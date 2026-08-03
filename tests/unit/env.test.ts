// Pruebas de la validación de entorno (src/server/env.ts) — dictamen E2 R11.
// Fail-fast: AUTH_SECRET ≥ 32, OTP_PROVIDER enum, whatsapp exige META_*.
import { describe, expect, it } from "vitest";
import { validateEnv } from "../../src/server/env";

const VALID = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/tunapuy",
  AUTH_SECRET: "0123456789abcdef0123456789abcdef", // 32 chars
  APP_URL: "http://localhost:3000",
  OTP_PROVIDER: "dev",
  NODE_ENV: "test",
} as const;

describe("validateEnv (R11)", () => {
  it("acepta una configuración mínima válida", () => {
    const env = validateEnv({ ...VALID });
    expect(env.AUTH_SECRET).toBe(VALID.AUTH_SECRET);
    expect(env.OTP_PROVIDER).toBe("dev");
    expect(env.OTP_TTL_MINUTES).toBe(5); // default
    expect(env.OTP_MAX_ATTEMPTS).toBe(5); // default
  });

  it("coerce OTP_TTL_MINUTES / OTP_MAX_ATTEMPTS numéricos", () => {
    const env = validateEnv({ ...VALID, OTP_TTL_MINUTES: "7", OTP_MAX_ATTEMPTS: "3" });
    expect(env.OTP_TTL_MINUTES).toBe(7);
    expect(env.OTP_MAX_ATTEMPTS).toBe(3);
  });

  it("exige DATABASE_URL (fail-fast)", () => {
    expect(() => validateEnv({ ...VALID, DATABASE_URL: "" })).toThrow(/DATABASE_URL/);
  });

  it("exige AUTH_SECRET de al menos 32 caracteres (R4/R11)", () => {
    expect(() => validateEnv({ ...VALID, AUTH_SECRET: "corto" })).toThrow(/AUTH_SECRET/);
    expect(() => validateEnv({ ...VALID, AUTH_SECRET: undefined as never })).toThrow();
  });

  it("rechaza un OTP_PROVIDER desconocido", () => {
    expect(() => validateEnv({ ...VALID, OTP_PROVIDER: "sms" })).toThrow(/OTP_PROVIDER/);
  });

  it("OTP_PROVIDER=whatsapp exige credenciales META (R11)", () => {
    expect(() => validateEnv({ ...VALID, OTP_PROVIDER: "whatsapp" })).toThrow(/META_WHATSAPP/);
    const ok = validateEnv({
      ...VALID,
      OTP_PROVIDER: "whatsapp",
      META_WHATSAPP_TOKEN: "token",
      META_WHATSAPP_PHONE_NUMBER_ID: "12345",
    });
    expect(ok.OTP_PROVIDER).toBe("whatsapp");
  });

  it("rechaza una APP_URL inválida", () => {
    expect(() => validateEnv({ ...VALID, APP_URL: "no-es-una-url" })).toThrow(/APP_URL/);
  });

  it("acepta SESSION_COOKIE_SECURE como enum true/false", () => {
    expect(validateEnv({ ...VALID, SESSION_COOKIE_SECURE: "false" }).SESSION_COOKIE_SECURE).toBe("false");
    expect(validateEnv({ ...VALID, SESSION_COOKIE_SECURE: "true" }).SESSION_COOKIE_SECURE).toBe("true");
    expect(() => validateEnv({ ...VALID, SESSION_COOKIE_SECURE: "yes" })).toThrow();
  });
});
