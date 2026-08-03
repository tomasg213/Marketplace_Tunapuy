import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

// Mock de la capa de base de datos: el health check solo toca `db.$queryRaw`.
vi.mock("../../src/server/db", () => ({
  db: { $queryRaw: vi.fn() },
}));

import { db } from "../../src/server/db";
import { GET } from "../../src/app/api/health/route";

const queryRaw = db.$queryRaw as unknown as Mock;

beforeEach(() => {
  queryRaw.mockReset();
});

describe("GET /api/health", () => {
  it("responde 200 con db:true cuando la base de datos responde", async () => {
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "ok", db: true });
  });

  it("responde 503 con db:false cuando la base de datos falla", async () => {
    queryRaw.mockRejectedValue(new Error("connection refused"));

    const res = await GET();

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ status: "degraded", db: false });
  });
});
