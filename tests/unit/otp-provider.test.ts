// Pruebas del factory de proveedores OTP (src/server/auth/otp-provider.ts) —
// dictamen E2 R7. La guarda de producción bloquea OTP_PROVIDER=dev bajo
// NODE_ENV=production en despliegues reales, pero lo permite en instalaciones
// locales/mock (dev, e2e con `next start` sobre http://localhost).
import { beforeEach, describe, expect, it, vi } from "vitest";

const BASE_ENV = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/tunapuy_test_otp_provider",
  AUTH_SECRET: "test-secret-0123456789abcdefghijklmnopqrstuv",
  APP_URL: "http://localhost:3000",
  NODE_ENV: "development",
  OTP_PROVIDER: "dev",
};

// env.ts lee process.env al importar; se recarga el módulo por caso.
async function loadOtpProvider(envVars: Record<string, string | undefined>) {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, BASE_ENV, envVars);
  vi.resetModules();
  const mod = await import("../../src/server/auth/otp-provider");
  return mod;
}

beforeEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, BASE_ENV);
});

describe("getOtpProvider (R7)", () => {
  it("desarrollo: OTP_PROVIDER=dev devuelve el proveedor dev", async () => {
    const { getOtpProvider } = await loadOtpProvider({ NODE_ENV: "development", OTP_PROVIDER: "dev" });
    expect(getOtpProvider().name).toBe("dev");
  });

  it("PRODUCCIÓN + dev + despliegue real (DATA_MODE=db, dominio público) → error", async () => {
    const { getOtpProvider, OtpProviderError } = await loadOtpProvider({
      NODE_ENV: "production",
      OTP_PROVIDER: "dev",
      DATA_MODE: "db",
      APP_URL: "https://tunapuy.example.com",
    });
    expect(() => getOtpProvider()).toThrow(OtpProviderError);
  });

  it("PRODUCCIÓN + dev + DATA_MODE=mock (e2e local / demo) → dev permitido", async () => {
    const { getOtpProvider } = await loadOtpProvider({
      NODE_ENV: "production",
      OTP_PROVIDER: "dev",
      DATA_MODE: "mock",
      APP_URL: "https://tunapuy.example.com",
    });
    expect(getOtpProvider().name).toBe("dev");
  });

  it("PRODUCCIÓN + dev + APP_URL localhost (build/start local) → dev permitido", async () => {
    const { getOtpProvider } = await loadOtpProvider({
      NODE_ENV: "production",
      OTP_PROVIDER: "dev",
      DATA_MODE: "db",
      APP_URL: "http://localhost:3000",
    });
    expect(getOtpProvider().name).toBe("dev");
  });

  it("whatsapp (producción, con credenciales Meta) → proveedor whatsapp", async () => {
    const { getOtpProvider } = await loadOtpProvider({
      NODE_ENV: "production",
      OTP_PROVIDER: "whatsapp",
      META_WHATSAPP_TOKEN: "token",
      META_WHATSAPP_PHONE_NUMBER_ID: "12345",
    });
    expect(getOtpProvider().name).toBe("whatsapp");
  });
});
