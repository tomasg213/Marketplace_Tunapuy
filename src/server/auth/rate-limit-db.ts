// Rate limiting de autenticación en BD (dictamen security E2 — R1).
//
// Sustituye al RateLimiter en memoria (perdía estado entre instancias y no
// soportaba escalado horizontal). Cada bucket es una fila de `AuthRateLimit`
// con clave única `key`, ventana `[windowStart, windowEnd]` y contador atómico.
//
// Umbrales (todos ANTES de generar/verificar un código):
//   - request OTP:     1 por teléfono / 60s, 5 / hora, 10 / día, 10 / hora por IP
//   - verify OTP:      5 intentos por código, 15 / hora por teléfono, 20 / hora por IP
//   - bloqueo:         `setBlocked(key, 30)` → el bucket `block:<key>` devuelve
//                      429 + Retry-After 1800s hasta expirar su ventana.
//
// Semántica de `limit`: máximo de hits permitidos por ventana. En caso de
// exceso se lanza `RateLimitError` (el route responde 429 + Retry-After).
import { Prisma, db } from "@/server/db";

/** Exceso de tasa → el route responde 429 con Retry-After en segundos. */
export class RateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("rate_limited");
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface RateLimitOptions {
  /** Máximo de hits por ventana. */
  limit: number;
  /** Duración de la ventana en milisegundos. */
  windowMs: number;
  /** Retry-After explícito (default: segundos restantes de la ventana). */
  retryAfterSeconds?: number;
}

/** Prefijo de los buckets de bloqueo (los buckets normales no se mezclan). */
const BLOCK_PREFIX = "block:";

/**
 * Guard principal: incrementa el contador del bucket y lanza `RateLimitError`
 * si hay un bloqueo activo o se supera el límite. Siempre se llama ANTES de
 * generar/verificar códigos (R1).
 */
export async function assertRateLimit(key: string, opts: RateLimitOptions): Promise<void> {
  const now = new Date();

  // 1) ¿Hay un bloqueo activo? → 429 hasta que expire su ventana.
  const blocked = await db.authRateLimit.findUnique({ where: { key: BLOCK_PREFIX + key } });
  if (blocked && blocked.windowEnd > now) {
    const retryAfterSeconds =
      opts.retryAfterSeconds ??
      Math.max(1, Math.ceil((blocked.windowEnd.getTime() - now.getTime()) / 1000));
    throw new RateLimitError(retryAfterSeconds);
  }

  // 2) INCREMENT atómico si existe una ventana viva (evita contar ventanas viejas).
  const windowEnd = new Date(now.getTime() + opts.windowMs);
  const updated = await db.authRateLimit.updateMany({
    where: { key, windowEnd: { gt: now } },
    data: { count: { increment: 1 } },
  });

  // 3) Sin ventana viva → crear con count=1 (retry ante carrera P2002).
  if (updated.count === 0) {
    try {
      await db.authRateLimit.create({
        data: { key, count: 1, windowStart: now, windowEnd },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        // Carrera: otra petición creó la ventana justo antes; re-incrementa.
        await db.authRateLimit.updateMany({
          where: { key, windowEnd: { gt: now } },
          data: { count: { increment: 1 } },
        });
      } else {
        throw err;
      }
    }
    // Barrido barato: borra buckets vencidos hace > 1h (índice windowEnd).
    const staleBefore = new Date(now.getTime() - 60 * 60 * 1000);
    await db.authRateLimit.deleteMany({ where: { windowEnd: { lt: staleBefore } } }).catch(() => {});
  }

  // 4) Lectura autoritativa (carreras resueltas con count > limit de inmediato).
  const row = await db.authRateLimit.findUnique({ where: { key } });
  if (!row || row.windowEnd <= now) return;

  const over = row.count > opts.limit;
  if (over) {
    const retryAfterSeconds =
      opts.retryAfterSeconds ??
      Math.max(1, Math.ceil((row.windowEnd.getTime() - now.getTime()) / 1000));
    throw new RateLimitError(retryAfterSeconds);
  }
}

/**
 * Activa un bloqueo duro sobre una key: crea/renueva el bucket `block:<key>` con
 * ventana de `minutes`. Mientras esté activo, `assertRateLimit(key, ...)` lanza
 * 429 (Retry-After) sin consumir hits del bucket normal.
 */
export async function setBlocked(key: string, minutes = 30): Promise<void> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + minutes * 60 * 1000);
  await db.authRateLimit.upsert({
    where: { key: BLOCK_PREFIX + key },
    create: { key: BLOCK_PREFIX + key, count: 0, windowStart: now, windowEnd },
    update: { windowStart: now, windowEnd, count: 0 },
  });
}

/** Claves de bucket canónicas (scope separado por `:`). */
export const rateLimitKeys = {
  requestByPhone: (phone: string) => `otp:request:phone:${phone}`,
  requestByIp: (ip: string) => `otp:request:ip:${ip}`,
  verifyByCode: (phone: string, codeHash: string) => `otp:verify:code:${phone}:${codeHash.slice(0, 16)}`,
  verifyByPhone: (phone: string) => `otp:verify:phone:${phone}`,
  verifyByIp: (ip: string) => `otp:verify:ip:${ip}`,
} as const;
