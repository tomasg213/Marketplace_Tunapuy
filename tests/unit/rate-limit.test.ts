// Pruebas del rate limiter en BD (src/server/auth/rate-limit-db.ts) — dictamen
// E2 R1. Cada bucket es una fila `AuthRateLimit` con incremento atómico y
// ventana en BD (funciona en despliegues multi-instancia, no es memoria).
//
// BD aislada: tunapuy_test_rate_limit (evita carreras con los demás archivos).
import { execFileSync } from "node:child_process";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL_RATE_LIMIT ??
  "postgresql://postgres:postgres@localhost:5432/tunapuy_test_rate_limit";

// Env ANTES de importar los módulos (db.ts crea el cliente con DATABASE_URL).
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.AUTH_SECRET = "test-secret-0123456789abcdefghijklmnopqrstuv";

const repoRoot = path.resolve(__dirname, "../..");
const bin = (name: string) => path.join(repoRoot, "node_modules", ".bin", name);

let db: typeof import("../../src/server/db");
let rl: typeof import("../../src/server/auth/rate-limit-db");
let RateLimitErrorClass: typeof import("../../src/server/auth/rate-limit-db").RateLimitError;

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

beforeAll(async () => {
  admin = new Client({ connectionString: TEST_DATABASE_URL.replace("/tunapuy_test_rate_limit", "/postgres") });
  await admin.connect();
  await resetDb();

  db = await import("../../src/server/db");
  rl = await import("../../src/server/auth/rate-limit-db");
  RateLimitErrorClass = rl.RateLimitError;
}, 240_000);

afterAll(async () => {
  const name = dbNameFromUrl(TEST_DATABASE_URL);
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.end();
}, 60_000);

beforeEach(async () => {
  await db.db.authRateLimit.deleteMany({});
});

describe("assertRateLimit", () => {
  it("permite hasta `limit` hits y bloquea el que excede", async () => {
    const key = "test:phone:+584120000000";
    for (let i = 0; i < 5; i += 1) {
      await expect(rl.assertRateLimit(key, { limit: 5, windowMs: 60_000 })).resolves.toBeUndefined();
    }
    await expect(rl.assertRateLimit(key, { limit: 5, windowMs: 60_000 })).rejects.toMatchObject({
      name: "RateLimitError",
    });
  });

  it("RateLimitError incluye Retry-After en segundos", async () => {
    const key = "test:retry";
    await rl.assertRateLimit(key, { limit: 1, windowMs: 60_000 }); // 1º OK
    try {
      await rl.assertRateLimit(key, { limit: 1, windowMs: 60_000 });
      expect.unreachable();
    } catch (err) {
      expect((err as InstanceType<typeof RateLimitErrorClass>).retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it("renueva la ventana al vencer (misma key vuelve a permitir)", async () => {
    // Ventana de 1s (antes 100ms): bajo carga la ventana vencía entre hits y
    // el test fallaba ~1 de 2 corridas (flaky H4). La espera de 1.1s garantiza
    // que la ventana expiró sin depender del jitter del scheduler.
    const key = "test:window";
    await rl.assertRateLimit(key, { limit: 1, windowMs: 1_000 }); // 1º OK
    await expect(rl.assertRateLimit(key, { limit: 1, windowMs: 1_000 })).rejects.toBeInstanceOf(
      RateLimitErrorClass,
    );
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    await expect(rl.assertRateLimit(key, { limit: 1, windowMs: 1_000 })).resolves.toBeUndefined();
  });

  it("mantiene buckets independientes por key", async () => {
    await rl.assertRateLimit("test:key-a", { limit: 1, windowMs: 60_000 });
    await expect(rl.assertRateLimit("test:key-b", { limit: 1, windowMs: 60_000 })).resolves.toBeUndefined();
  });

  it("sobrevive a una carrera: N hits concurrentes cuentan todos (atómico)", async () => {
    const key = "test:race";
    await Promise.all(
      Array.from({ length: 6 }, () => rl.assertRateLimit(key, { limit: 3, windowMs: 60_000 }).catch(() => null)),
    );
    const row = await db.db.authRateLimit.findUnique({ where: { key } });
    expect(row!.count).toBe(6);
  });
});

describe("setBlocked (bloqueo duro 30 min)", () => {
  it("tras setBlocked, assertRateLimit de la misma key siempre lanza", async () => {
    const key = "test:block";
    await rl.setBlocked(key, 30);
    await expect(rl.assertRateLimit(key, { limit: 5, windowMs: 60_000 })).rejects.toBeInstanceOf(
      RateLimitErrorClass,
    );
    await expect(rl.assertRateLimit(key, { limit: 5, windowMs: 60_000 })).rejects.toBeInstanceOf(
      RateLimitErrorClass,
    );
  });

  it("el bloqueo expira al terminar la ventana", async () => {
    const key = "test:block-window";
    await rl.setBlocked(key, 0); // ventana mínima de 0 minutos
    await new Promise((resolve) => setTimeout(resolve, 50));
    await expect(rl.assertRateLimit(key, { limit: 5, windowMs: 60_000 })).resolves.toBeUndefined();
  });
});

describe("rateLimitKeys", () => {
  it("genera claves estables y con scope", () => {
    expect(rl.rateLimitKeys.requestByPhone("+584120000000")).toBe("otp:request:phone:+584120000000");
    expect(rl.rateLimitKeys.requestByIp("1.2.3.4")).toBe("otp:request:ip:1.2.3.4");
    expect(rl.rateLimitKeys.verifyByPhone("+584120000000")).toBe("otp:verify:phone:+584120000000");
  });
});
