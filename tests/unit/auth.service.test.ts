// Pruebas de integración del flujo OTP (auth.service.ts) contra una BD
// PostgreSQL AISLADA (tunapuy_test_auth). Dictamen security E2:
//   R1 rate limit en BD (antes de generar/verificar) · R2 single-use + sesión
//   en la MISMA transacción · R3 HMAC keyed por AUTH_SECRET · R6 teléfono VE
//   (+58 / 11 dígitos) validado antes · R7 sin PII en logs.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL_AUTH ??
  "postgresql://postgres:postgres@localhost:5432/tunapuy_test_auth";

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.OTP_PROVIDER = "dev";
process.env.OTP_TTL_MINUTES = "5";
process.env.OTP_MAX_ATTEMPTS = "5";
process.env.AUTH_SECRET = "test-secret-0123456789abcdefghijklmnopqrstuv";

const repoRoot = path.resolve(__dirname, "../..");
const bin = (name: string) => path.join(repoRoot, "node_modules", ".bin", name);

const TEST_IP = "10.0.0.99";
const PHONE = "+584120000001"; // VE: +58 + 10 dígitos
const DIFFERENT_IP = "10.0.0.100";

let db: typeof import("../../src/server/db");
let authService: typeof import("../../src/server/auth/auth.service");

let admin: Client;

function dbNameFromUrl(url: string): string {
  return new URL(url).pathname.replace(/^\//, "");
}

async function resetDb(): Promise<void> {
  const name = dbNameFromUrl(TEST_DATABASE_URL);
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${name}"`);
  execFileSync(bin("prisma"), ["migrate", "deploy"], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "pipe",
  });
}

/** Baja los buckets de rate limit de request para repetir el flujo en el test. */
async function resetRequestBuckets(): Promise<void> {
  await db.db.authRateLimit.deleteMany({
    where: { key: { startsWith: "otp:request:" } },
  });
}

async function requestCode(phoneNumber: string = PHONE, ip: string = TEST_IP) {
  return authService.requestOtp({ phoneNumber, ip });
}

beforeAll(async () => {
  admin = new Client({ connectionString: TEST_DATABASE_URL.replace("/tunapuy_test_auth", "/postgres") });
  await admin.connect();
  await resetDb();

  db = await import("../../src/server/db");
  authService = await import("../../src/server/auth/auth.service");
}, 240_000);

afterAll(async () => {
  const name = dbNameFromUrl(TEST_DATABASE_URL);
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.end();
}, 60_000);

beforeEach(async () => {
  await db.db.authRateLimit.deleteMany({});
  await db.db.otpCode.deleteMany({});
  await db.db.session.deleteMany({});
  await db.db.user.deleteMany({});
});

describe("requestOtp (R1/R6/R7)", () => {
  it("rechaza teléfonos que no son venezolanos (R6: +58 / 11 dígitos)", async () => {
    await expect(authService.requestOtp({ phoneNumber: "+12345678901", ip: TEST_IP })).rejects.toMatchObject({
      name: "OtpRequestError",
      kind: "invalid_phone",
    });
    await expect(authService.requestOtp({ phoneNumber: "no-phone", ip: TEST_IP })).rejects.toMatchObject({
      name: "OtpRequestError",
      kind: "invalid_phone",
    });
  });

  it("normaliza el formato local 0412... a +58412...", async () => {
    const result = await authService.requestOtp({ phoneNumber: "04121234567", ip: TEST_IP });
    expect(result.devCode).toMatch(/^\d{6}$/);
    const otp = await db.db.otpCode.findFirst({ where: { phoneNumber: "+584121234567" } });
    expect(otp).toBeTruthy();
  });

  it("responde genérico con devCode y expiración (número nuevo)", async () => {
    const result = await requestCode("+584120000099");
    expect(result.ok).toBe(true);
    expect(result.devCode).toMatch(/^\d{6}$/);
    expect(result.expiresInSeconds).toBeGreaterThan(0);
    expect(result.expiresInSeconds).toBeLessThanOrEqual(300);
  });

  it("persiste SOLO el codeHash HMAC (salt 64 hex : hmac 64 hex), nunca el código", async () => {
    const result = await requestCode();
    const otp = await db.db.otpCode.findFirst({ where: { phoneNumber: PHONE } });
    expect(otp).toBeTruthy();
    expect(otp!.codeHash).toMatch(/^[0-9a-f]{64}:[0-9a-f]{64}$/);
    expect(otp!.codeHash).not.toContain(result.devCode!);
    expect(Object.keys(otp!)).not.toContain("code");
  });

  it("mantiene un único código activo por teléfono (el nuevo reemplaza al anterior)", async () => {
    await requestCode();
    await resetRequestBuckets();
    await requestCode();
    const count = await db.db.otpCode.count({ where: { phoneNumber: PHONE } });
    expect(count).toBe(1);
  });

  it("aplica rate limit por teléfono: 1 por minuto (2.ª solicitud → rate_limited)", async () => {
    await requestCode();
    await expect(requestCode()).rejects.toMatchObject({ name: "OtpRequestError", kind: "rate_limited" });
  });

  it("rate limit por IP: 10/h por teléfonos distintos; el 11.º desde la misma IP se bloquea", async () => {
    // Escenario de producción: APP_URL público. En local/mock (DATA_MODE=mock o
    // APP_URL localhost) el rate limit por IP se omite a propósito (localhost
    // comparte un único bucket "unknown" que se auto-bloquea; ver
    // auth.service.ts ipRateLimitEnabled).
    const prevAppUrl = process.env.APP_URL;
    process.env.APP_URL = "https://app.tunapuy.test";
    try {
      const ip = DIFFERENT_IP;
      for (let i = 0; i < 10; i += 1) {
        const phone = `+58412${String(1000000 + i * 1000).padStart(7, "0")}`;
        await authService.requestOtp({ phoneNumber: phone, ip });
      }
      await expect(
        authService.requestOtp({ phoneNumber: "+584120099999", ip }),
      ).rejects.toMatchObject({ name: "OtpRequestError", kind: "rate_limited" });
    } finally {
      if (prevAppUrl === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = prevAppUrl;
    }
  });
});

describe("verifyOtp (R2/R3/R6)", () => {
  it("crea la cuenta (find-or-create) con role BUYER, slug único y una sesión", async () => {
    const { devCode } = await requestCode();
    const result = await authService.verifyOtp({ phoneNumber: PHONE, code: devCode!, ip: TEST_IP });
    expect(result.isNewUser).toBe(true);
    expect(result.user.role).toBe("BUYER");
    expect(result.user.slug).toBe("usuario-0001");
    expect(result.user.name).toBe("Usuario 0001");
    // R2/R4: la sesión nace en la misma transacción que el consumo del código.
    expect(result.session.token).toBeTruthy();
    const sessionRows = await db.db.session.findMany({ where: { userId: result.user.id } });
    expect(sessionRows).toHaveLength(1);
    expect(sessionRows[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("consume el código (single-use): la 2.ª verificación falla con consumed", async () => {
    const { devCode } = await requestCode();
    await authService.verifyOtp({ phoneNumber: PHONE, code: devCode!, ip: TEST_IP });
    await expect(
      authService.verifyOtp({ phoneNumber: PHONE, code: devCode!, ip: TEST_IP }),
    ).rejects.toMatchObject({ name: "OtpVerifyError", kind: "consumed" });
  });

  it("carrera por el mismo código: solo UN verify gana (single-use atómico, R2)", async () => {
    const { devCode } = await requestCode();
    const results = await Promise.allSettled([
      authService.verifyOtp({ phoneNumber: PHONE, code: devCode!, ip: TEST_IP }),
      authService.verifyOtp({ phoneNumber: PHONE, code: devCode!, ip: TEST_IP }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const err = (rejected[0] as PromiseRejectedResult).reason as { name: string };
    expect(err.name).toBe("OtpVerifyError");
  });

  it("rechaza un código incorrecto e incrementa los intentos (máx 5)", async () => {
    await requestCode();
    for (let i = 0; i < 5; i += 1) {
      await expect(
        authService.verifyOtp({ phoneNumber: PHONE, code: "000000", ip: TEST_IP }),
      ).rejects.toMatchObject({ name: "OtpVerifyError", kind: "invalid_code" });
    }
    const otp = await db.db.otpCode.findFirst({ where: { phoneNumber: PHONE } });
    expect(otp!.attempts).toBe(5);
    await expect(
      authService.verifyOtp({ phoneNumber: PHONE, code: "000000", ip: TEST_IP }),
    ).rejects.toMatchObject({ name: "OtpVerifyError", kind: "attempts_exhausted" });
  });

  it("rechaza códigos vencidos (expiresAt en el pasado)", async () => {
    const { devCode } = await requestCode();
    await db.db.otpCode.updateMany({
      where: { phoneNumber: PHONE },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    await expect(
      authService.verifyOtp({ phoneNumber: PHONE, code: devCode!, ip: TEST_IP }),
    ).rejects.toMatchObject({ name: "OtpVerifyError", kind: "expired" });
  });

  it("rechaza teléfonos no venezolanos también en verify", async () => {
    await expect(
      authService.verifyOtp({ phoneNumber: "no-phone", code: "000000", ip: TEST_IP }),
    ).rejects.toMatchObject({ name: "OtpVerifyError", kind: "invalid_phone" });
  });

  it("deduplica slugs entre usuarios con el mismo último dígito (usuario-9999 → -2)", async () => {
    const phoneA = "+584129999999";
    const phoneB = "+584131999999"; // mismos últimos 4 dígitos que A

    const codeA = (await requestCode(phoneA)).devCode!;
    const userA = await authService.verifyOtp({ phoneNumber: phoneA, code: codeA, ip: TEST_IP });
    expect(userA.user.slug).toBe("usuario-9999");

    const codeB = (await requestCode(phoneB)).devCode!;
    const userB = await authService.verifyOtp({ phoneNumber: phoneB, code: codeB, ip: TEST_IP });
    expect(userB.user.slug).toBe("usuario-9999-2");
    expect(userB.user.id).not.toBe(userA.user.id);
  });

  it("login de un usuario existente: isNewUser=false, mismo id y una sesión nueva", async () => {
    const first = (await requestCode()).devCode!;
    const created = await authService.verifyOtp({ phoneNumber: PHONE, code: first, ip: TEST_IP });
    expect(created.isNewUser).toBe(true);

    await resetRequestBuckets();
    const again = (await requestCode()).devCode!;
    const logged = await authService.verifyOtp({ phoneNumber: PHONE, code: again, ip: TEST_IP });
    expect(logged.isNewUser).toBe(false);
    expect(logged.user.id).toBe(created.user.id);
    expect(logged.session.token).not.toBe(created.session.token);
  });
});
