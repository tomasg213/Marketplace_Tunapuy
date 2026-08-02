// Pruebas de `getBcvRate()` (src/server/rate/rate.service.ts).
//
// Estrategia de prueba (docs/architecture.md §3.2):
//   - Se mockean `fetch` (global) y la capa `@/server/db` + `@/server/env`
//     para no golpear APIs reales ni la base de datos.
//   - `vi.resetModules()` + import dinámico por test: la caché de memoria del
//     módulo (`memoryRate`) es estado privado del módulo; al re-importar se
//     reinicia y cada escenario parte de memoria vacía.
//   - `vi.hoisted` mantiene referencias estables de los mocks a través de los
//     reset de módulo.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

const { envMock, dbMock } = vi.hoisted(() => {
  const envMock = {
    BCV_RATE_API_URL: "https://ve.dolarapi.com/v1/dolares/oficial",
    BCV_RATE_TTL_HOURS: 6,
    BCV_RATE_TTL_MEMORY_MINUTES: 10,
    BCV_RATE_TIMEOUT_MS: 5000,
    BCV_RATE_FALLBACK: "746.6297",
  };
  const dbMock = {
    rateCache: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  };
  return { envMock, dbMock };
});

vi.mock("@/server/db", () => ({ db: dbMock }));
vi.mock("@/server/env", () => ({ env: envMock }));

type RateService = typeof import("@/server/rate/rate.service");
let rateService: RateService;

const fetchMock = () => vi.fn<typeof fetch>();
let fetchImpl: Mock;

function okApi(promedio: string | number) {
  return {
    ok: true,
    json: async () => ({ promedio }),
  };
}

function dbRow(overrides: Partial<{ usdToBs: string; fetchedAt: Date; expiresAt: Date }> = {}) {
  const now = Date.now();
  return {
    source: "dolarapi-oficial",
    usdToBs: "740.5000",
    fetchedAt: new Date(now - 3_600_000),
    expiresAt: new Date(now - 60_000), // expirada por defecto
    ...overrides,
  };
}

beforeEach(async () => {
  vi.resetModules();
  dbMock.rateCache.findUnique.mockReset();
  dbMock.rateCache.upsert.mockReset();
  envMock.BCV_RATE_FALLBACK = "746.6297";
  fetchImpl = fetchMock();
  vi.stubGlobal("fetch", fetchImpl);
  vi.useRealTimers();
  rateService = await import("@/server/rate/rate.service");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getBcvRate — fuente API (fetch OK)", () => {
  it("fetch exitoso: devuelve origen 'api' con el promedio y hace upsert en RateCache", async () => {
    fetchImpl.mockResolvedValue(okApi("746.6297"));
    dbMock.rateCache.findUnique.mockResolvedValue(null);
    dbMock.rateCache.upsert.mockResolvedValue({});

    const rate = await rateService.getBcvRate();

    expect(rate.origin).toBe("api");
    expect(rate.usdToBs.toString()).toBe("746.6297");
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // upsert con los valores frescos (persistencia best-effort).
    expect(dbMock.rateCache.upsert).toHaveBeenCalledTimes(1);
    const arg = dbMock.rateCache.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ source: "dolarapi-oficial" });
    expect(arg.update.usdToBs.toString()).toBe("746.6297");
    expect(arg.create.source).toBe("dolarapi-oficial");
    expect(arg.create.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("si el upsert falla, igual devuelve la tasa fresca (best-effort)", async () => {
    fetchImpl.mockResolvedValue(okApi("746.6297"));
    dbMock.rateCache.findUnique.mockResolvedValue(null);
    dbMock.rateCache.upsert.mockRejectedValue(new Error("db down"));

    const rate = await rateService.getBcvRate();

    expect(rate.origin).toBe("api");
    expect(rate.usdToBs.toString()).toBe("746.6297");
  });

  it("rechaza payload de dolarapi sin 'promedio' (→ cae a fallback)", async () => {
    fetchImpl.mockResolvedValue({ ok: true, json: async () => ({ moneda: "USD" }) });
    dbMock.rateCache.findUnique.mockResolvedValue(null);

    const rate = await rateService.getBcvRate();

    expect(rate.origin).toBe("fallback");
    expect(rate.usdToBs.toString()).toBe("746.6297");
  });

  it("rechaza 'promedio' inválido (0 / negativo / NaN) → fallback", async () => {
    fetchImpl.mockResolvedValue(okApi("0"));
    dbMock.rateCache.findUnique.mockResolvedValue(null);

    const rate = await rateService.getBcvRate();

    expect(rate.origin).toBe("fallback");
  });
});

describe("getBcvRate — caché de memoria (TTL)", () => {
  it("segundo request con memoria fresca: origen 'memory', sin fetch ni consulta a DB", async () => {
    fetchImpl.mockResolvedValue(okApi("750.50"));
    dbMock.rateCache.findUnique.mockResolvedValue(null);
    dbMock.rateCache.upsert.mockResolvedValue({});

    const first = await rateService.getBcvRate();
    const second = await rateService.getBcvRate();

    expect(first.origin).toBe("api");
    expect(second.origin).toBe("memory");
    expect(second.usdToBs.toString()).toBe("750.5");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(dbMock.rateCache.findUnique).toHaveBeenCalledTimes(1);
  });

  it("al expirar el TTL de memoria (10 min) vuelve a buscar (refetch)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-02T12:00:00.000Z"));

    fetchImpl.mockResolvedValue(okApi("750.50"));
    dbMock.rateCache.findUnique.mockResolvedValue(null);
    dbMock.rateCache.upsert.mockResolvedValue({});

    const first = await rateService.getBcvRate();
    expect(first.origin).toBe("api");

    // Avanza 11 min: la caché de memoria (10 min) ya expiró.
    vi.setSystemTime(new Date("2026-08-02T12:11:00.000Z"));

    const second = await rateService.getBcvRate();
    expect(second.origin).toBe("api");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

describe("getBcvRate — fuentes de respaldo (cascada)", () => {
  it("fetch falla y hay fila expirada en DB → origen 'stale' con esa tasa", async () => {
    fetchImpl.mockRejectedValue(new Error("network down"));
    dbMock.rateCache.findUnique.mockResolvedValue(dbRow({ usdToBs: "740.5000" }));

    const rate = await rateService.getBcvRate();

    expect(rate.origin).toBe("stale");
    expect(rate.usdToBs.toString()).toBe("740.5");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("fetch responde status HTTP no-ok y hay fila vieja → origen 'stale'", async () => {
    fetchImpl.mockResolvedValue({ ok: false, status: 502, json: async () => ({}) });
    dbMock.rateCache.findUnique.mockResolvedValue(dbRow());

    const rate = await rateService.getBcvRate();

    expect(rate.origin).toBe("stale");
  });

  it("sin fila en DB y fetch falla → BCV_RATE_FALLBACK con origen 'fallback'", async () => {
    fetchImpl.mockRejectedValue(new Error("timeout"));
    dbMock.rateCache.findUnique.mockResolvedValue(null);
    envMock.BCV_RATE_FALLBACK = "746.6297";

    const rate = await rateService.getBcvRate();

    expect(rate.origin).toBe("fallback");
    expect(rate.usdToBs.toString()).toBe("746.6297");
  });

  it("fallback configurado pero inválido (no numérico) → RateUnavailableError", async () => {
    fetchImpl.mockRejectedValue(new Error("timeout"));
    dbMock.rateCache.findUnique.mockResolvedValue(null);
    envMock.BCV_RATE_FALLBACK = "abc";

    await expect(rateService.getBcvRate()).rejects.toBeInstanceOf(
      rateService.RateUnavailableError,
    );
  });

  it("sin fila, sin fallback y fetch falla → lanza RateUnavailableError", async () => {
    fetchImpl.mockRejectedValue(new Error("timeout"));
    dbMock.rateCache.findUnique.mockResolvedValue(null);
    envMock.BCV_RATE_FALLBACK = "";

    await expect(rateService.getBcvRate()).rejects.toBeInstanceOf(
      rateService.RateUnavailableError,
    );
  });
});

describe("getBcvRate — fuente DB (fila fresca)", () => {
  it("fila RateCache fresca → origen 'db' sin fetch (y puebla memoria)", async () => {
    fetchImpl.mockRejectedValue(new Error("no debe llamarse"));
    dbMock.rateCache.findUnique.mockResolvedValue(
      dbRow({
        usdToBs: "745.5000",
        expiresAt: new Date(Date.now() + 3_600_000), // vigente
      }),
    );

    const rate = await rateService.getBcvRate();

    expect(rate.origin).toBe("db");
    expect(rate.usdToBs.toString()).toBe("745.5");
    expect(fetchImpl).not.toHaveBeenCalled();

    // Memoria poblada: el segundo request no vuelve a consultar la DB.
    const second = await rateService.getBcvRate();
    expect(second.origin).toBe("memory");
    expect(dbMock.rateCache.findUnique).toHaveBeenCalledTimes(1);
  });
});
