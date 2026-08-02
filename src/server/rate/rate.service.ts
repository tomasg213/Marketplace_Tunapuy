// Servicio de tasa BCV con caché híbrida (docs/architecture.md §3.2).
//
// getBcvRate() en cascada:
//   1. Memoria en proceso fresca (TTL corto) → sin red ni DB.
//   2. Tabla `RateCache` no expirada → puebla memoria.
//   3. Fetch a dolarapi (promedio) → upsert en RateCache + memoria.
//   4. Error → RateCache vieja (stale) → devolver con origen "stale".
//   5. Sin fila → BCV_RATE_FALLBACK (env) → origen "fallback".
//   6. Nada → lanza RateUnavailableError (la UI oculta el precio en Bs).
import Decimal from "decimal.js";
import { RATE_SOURCE } from "@/lib/constants";
import { db } from "@/server/db";
import { env } from "@/server/env";

export type RateOrigin = "memory" | "db" | "api" | "stale" | "fallback";

export interface BcvRate {
  /** Tasa USD → Bs (precisión 4 decimales). */
  usdToBs: Decimal;
  /** De dónde salió la tasa (para depuración/UI). */
  origin: RateOrigin;
  /** Momento de la tasa publicada por la fuente (si se conoce). */
  fetchedAt?: Date;
}

/** Error controlado: la UI oculta los precios en Bs cuando no hay tasa. */
export class RateUnavailableError extends Error {
  constructor(message = "Tasa BCV no disponible", options?: ErrorOptions) {
    super(message, options);
    this.name = "RateUnavailableError";
  }
}

interface MemoryRate {
  usdToBs: Decimal;
  fetchedAt: Date;
  expiresAt: Date;
}

let memoryRate: MemoryRate | null = null;

function now(): Date {
  return new Date();
}

/** Límite de vida de la caché de memoria: nunca más allá del TTL de memoria. */
function capMemoryExpiry(baseExpiry: Date): Date {
  const ttlMs = env.BCV_RATE_TTL_MEMORY_MINUTES * 60_000;
  const cap = new Date(now().getTime() + ttlMs);
  return baseExpiry < cap ? baseExpiry : cap;
}

function setMemory(usdToBs: Decimal, fetchedAt: Date, baseExpiry: Date): void {
  memoryRate = {
    usdToBs,
    fetchedAt,
    expiresAt: capMemoryExpiry(baseExpiry),
  };
}

/** Parsea la respuesta de dolarapi (campo `promedio`). */
function parseBcvPayload(payload: unknown): Decimal {
  const promedio = (payload as { promedio?: number | string })?.promedio;
  if (promedio === undefined || promedio === null) {
    throw new RateUnavailableError("Respuesta de dolarapi sin campo 'promedio'");
  }
  const rate = new Decimal(String(promedio));
  if (rate.isNaN() || rate.lte(0)) {
    throw new RateUnavailableError(`Tasa inválida recibida de dolarapi: ${String(promedio)}`);
  }
  return rate;
}

/** Fetch a dolarapi con timeout (AbortController). */
async function fetchFromApi(): Promise<{ usdToBs: Decimal; fetchedAt: Date }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.BCV_RATE_TIMEOUT_MS);
  try {
    const res = await fetch(env.BCV_RATE_API_URL, {
      signal: controller.signal,
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new RateUnavailableError(`dolarapi respondió con status ${res.status}`);
    }
    const payload = (await res.json()) as unknown;
    return { usdToBs: parseBcvPayload(payload), fetchedAt: now() };
  } catch (err) {
    if (err instanceof RateUnavailableError) throw err;
    throw new RateUnavailableError("Fallo de red o timeout al consultar dolarapi", { cause: err });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Devuelve la tasa BCV actual con la estrategia de caché híbrida y
 * fallback en cascada descrita arriba. Nunca lanza si existe alguna
 * fuente de respaldo (stale o BCV_RATE_FALLBACK).
 */
export async function getBcvRate(): Promise<BcvRate> {
  // 1. Memoria fresca.
  if (memoryRate && memoryRate.expiresAt > now()) {
    return {
      usdToBs: memoryRate.usdToBs,
      origin: "memory",
      fetchedAt: memoryRate.fetchedAt,
    };
  }

  const ttlMs = env.BCV_RATE_TTL_HOURS * 60 * 60 * 1000;
  let cached: { usdToBs: Decimal; fetchedAt: Date; expiresAt: Date } | null = null;

  try {
    // 2. Caché persistente (RateCache) no expirada.
    const row = await db.rateCache.findUnique({ where: { source: RATE_SOURCE } });
    if (row) {
      const usdToBs = new Decimal(String(row.usdToBs));
      cached = { usdToBs, fetchedAt: row.fetchedAt, expiresAt: row.expiresAt };
      if (row.expiresAt > now()) {
        setMemory(usdToBs, row.fetchedAt, row.expiresAt);
        return { usdToBs, origin: "db", fetchedAt: row.fetchedAt };
      }
    }

    // 3. Fetch a la API.
    const fresh = await fetchFromApi();
    const expiresAt = new Date(fresh.fetchedAt.getTime() + ttlMs);
    try {
      // Persistencia best-effort: si falla el upsert, igual devolvemos la tasa fresca.
      await db.rateCache.upsert({
        where: { source: RATE_SOURCE },
        update: {
          usdToBs: fresh.usdToBs,
          fetchedAt: fresh.fetchedAt,
          expiresAt,
        },
        create: {
          source: RATE_SOURCE,
          usdToBs: fresh.usdToBs,
          fetchedAt: fresh.fetchedAt,
          expiresAt,
        },
      });
    } catch {
      // no-op: la memoria ya tiene la tasa; la DB se corregirá en el próximo fetch.
    }
    setMemory(fresh.usdToBs, fresh.fetchedAt, expiresAt);
    return { usdToBs: fresh.usdToBs, origin: "api", fetchedAt: fresh.fetchedAt };
  } catch (err) {
    // 4. Fila vieja (stale) → servir con advertencia de origen.
    if (cached) {
      return { usdToBs: cached.usdToBs, origin: "stale", fetchedAt: cached.fetchedAt };
    }
    // 5. Fallback estático configurado.
    const fallbackRaw = env.BCV_RATE_FALLBACK;
    if (fallbackRaw) {
      const fallback = new Decimal(String(fallbackRaw));
      if (!fallback.isNaN() && fallback.gt(0)) {
        return { usdToBs: fallback, origin: "fallback" };
      }
    }
    // 6. Sin ninguna fuente: error controlado.
    throw new RateUnavailableError(
      "Tasa BCV no disponible (API caída, sin caché ni fallback)",
      { cause: err },
    );
  }
}
