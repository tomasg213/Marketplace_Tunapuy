// Pruebas del guard CSRF (src/server/csrf.ts) — dictamen E2 R5.
// Todo route handler mutante debe rechazar orígenes cross-site.
import { beforeEach, describe, expect, it } from "vitest";
import { assertSafeOrigin, CsrfError } from "../../src/server/csrf";

// env.ts valida process.env en tiempo de carga.
beforeEach(() => {
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/tunapuy_test_csrf";
  process.env.AUTH_SECRET = "test-secret-0123456789abcdefghijklmnopqrstuv";
  process.env.APP_URL = "http://localhost:3000";
  delete process.env.PREVIEW_URL;
  delete process.env.VERCEL_URL;
});

function requestWith(headers: Record<string, string>): Request {
  return new Request("http://localhost:3000/api/test", { method: "POST", headers });
}

describe("assertSafeOrigin (R5)", () => {
  it("acepta navegadores same-origin (Sec-Fetch-Site: same-origin)", () => {
    expect(() => assertSafeOrigin(requestWith({ "sec-fetch-site": "same-origin" }))).not.toThrow();
  });

  it("acepta Sec-Fetch-Site: none (navegación directa)", () => {
    expect(() => assertSafeOrigin(requestWith({ "sec-fetch-site": "none" }))).not.toThrow();
  });

  it("RECHAZA cross-site (navegador atacante) con CsrfError", () => {
    expect(() =>
      assertSafeOrigin(requestWith({ "sec-fetch-site": "cross-site", origin: "https://evil.example" })),
    ).toThrow(CsrfError);
  });

  it("RECHAZA un Origin que no está en la allowlist (sin Sec-Fetch-Site)", () => {
    expect(() =>
      assertSafeOrigin(requestWith({ origin: "https://evil.example" })),
    ).toThrow(CsrfError);
  });

  it("acepta un Origin de la allowlist (APP_URL)", () => {
    expect(() =>
      assertSafeOrigin(requestWith({ origin: "http://localhost:3000" })),
    ).not.toThrow();
  });

  it("acepta el Referer de la allowlist como fallback", () => {
    expect(() =>
      assertSafeOrigin(requestWith({ referer: "http://localhost:3000/login" })),
    ).not.toThrow();
  });

  it("RECHAZA un Referer externo", () => {
    expect(() =>
      assertSafeOrigin(requestWith({ referer: "https://evil.example/login" })),
    ).toThrow(CsrfError);
  });

  it("acepta clientes sin headers de fetch (bots/scripts e2e)", () => {
    expect(() => assertSafeOrigin(requestWith({}))).not.toThrow();
  });

  it("acepta origins de deploy previews (VERCEL_URL)", () => {
    process.env.VERCEL_URL = "tunapuy-preview-abc.vercel.app";
    expect(() =>
      assertSafeOrigin(requestWith({ "sec-fetch-site": "same-origin", origin: "https://tunapuy-preview-abc.vercel.app" })),
    ).not.toThrow();
    expect(() =>
      assertSafeOrigin(requestWith({ origin: "https://tunapuy-preview-abc.vercel.app" })),
    ).not.toThrow();
  });
});
