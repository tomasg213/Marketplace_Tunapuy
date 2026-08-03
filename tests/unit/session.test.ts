// Pruebas de integración de la sesión opaca en BD (src/server/auth/session.ts)
// — dictamen E2 R4. BD aislada: tunapuy_test_session.
//
// Cubre: creación con tokenHash (nunca el token en claro), getSessionFromToken
// (válida/revocada/vencida), renovación deslizante, revokeSession (logout),
// requireAuth/requireReauth y getCurrentUser. Todas las llamadas se hacen con
// `{ request }` (fuente explícita) para no depender de next/headers.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashSessionToken } from "../../src/server/auth/session-token";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL_SESSION ??
  "postgresql://postgres:postgres@localhost:5432/tunapuy_test_session";

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.AUTH_SECRET = "test-secret-0123456789abcdefghijklmnopqrstuv";
(process.env as Record<string, string | undefined>).NODE_ENV = "development";

const repoRoot = path.resolve(__dirname, "../..");
const bin = (name: string) => path.join(repoRoot, "node_modules", ".bin", name);

let db: typeof import("../../src/server/db");
let sessionModule: typeof import("../../src/server/auth/session");
let sessionCookieModule: typeof import("../../src/server/auth/session-cookie");

let admin: Client;
let userId: string;

function dbNameFromUrl(url: string): string {
  return new URL(url).pathname.replace(/^\//, "");
}

function requestWithCookie(token: string | null): Request {
  const cookie = token ? `; ${sessionCookieModule.sessionCookieName()}=${encodeURIComponent(token)}` : "";
  return new Request("http://localhost/api/test", { headers: { cookie: cookie.slice(2) } });
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
  admin = new Client({ connectionString: TEST_DATABASE_URL.replace("/tunapuy_test_session", "/postgres") });
  await admin.connect();
  await resetDb();

  db = await import("../../src/server/db");
  sessionModule = await import("../../src/server/auth/session");
  sessionCookieModule = await import("../../src/server/auth/session-cookie");

  const user = await db.db.user.create({
    data: { phoneNumber: "+580000030001", name: "Sesión Test", slug: "sesion-test" },
  });
  userId = user.id;
}, 240_000);

afterAll(async () => {
  const name = dbNameFromUrl(TEST_DATABASE_URL);
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.end();
}, 60_000);

beforeEach(async () => {
  await db.db.session.deleteMany({});
});

describe("createSession / getSessionFromToken (R4)", () => {
  it("persiste solo el sha256 del token, nunca el token en claro", async () => {
    const { token } = await sessionModule.createSession(userId);
    const rows = await db.db.session.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toBe(hashSessionToken(token));
    expect(rows[0].tokenHash).not.toContain(token);
  });

  it("getSessionFromToken resuelve una sesión válida", async () => {
    const { token } = await sessionModule.createSession(userId);
    const session = await sessionModule.getSessionFromToken(token);
    expect(session?.userId).toBe(userId);
    expect(session?.sessionId).toBeTruthy();
  });

  it("devuelve null para token inexistente, vacío o null", async () => {
    expect(await sessionModule.getSessionFromToken(null)).toBeNull();
    expect(await sessionModule.getSessionFromToken("no-existe")).toBeNull();
    expect(await sessionModule.getSessionFromToken("")).toBeNull();
  });

  it("no resuelve sesiones revocadas (logout)", async () => {
    const { token } = await sessionModule.createSession(userId);
    await sessionModule.revokeSession(token);
    expect(await sessionModule.getSessionFromToken(token)).toBeNull();
  });

  it("no resuelve sesiones vencidas", async () => {
    const { token } = await sessionModule.createSession(userId);
    await db.db.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await sessionModule.getSessionFromToken(token)).toBeNull();
  });

  it("renovación deslizante: extiende expiresAt cuando queda < mitad del TTL", async () => {
    const { token } = await sessionModule.createSession(userId);
    const ttlMs = sessionCookieModule.SESSION_TTL_SECONDS * 1000;
    // Envejece la sesión hasta el 70% de su vida (queda < mitad del TTL).
    await db.db.session.updateMany({
      data: { expiresAt: new Date(Date.now() + ttlMs * 0.3) },
    });
    const session = await sessionModule.getSessionFromToken(token);
    expect(session).not.toBeNull();
    const row = await db.db.session.findUnique({ where: { id: session!.sessionId } });
    expect(row!.expiresAt.getTime()).toBeGreaterThan(Date.now() + ttlMs * 0.5);
  });
});

describe("requireAuth / requireReauth (R4)", () => {
  it("requireAuth devuelve el userId con cookie válida", async () => {
    const { token } = await sessionModule.createSession(userId);
    const request = requestWithCookie(token);
    await expect(sessionModule.requireAuth({ request })).resolves.toBe(userId);
  });

  it("requireAuth lanza AuthenticationError sin cookie", async () => {
    await expect(sessionModule.requireAuth({ request: requestWithCookie(null) })).rejects.toMatchObject({
      name: "AuthenticationError",
    });
  });

  it("requireReauth exige una sesión verificada hace < 10 min", async () => {
    const { token } = await sessionModule.createSession(userId);
    const request = requestWithCookie(token);
    await expect(sessionModule.requireReauth({ request })).resolves.toBe(userId);

    // Envejece lastVerifiedAt (re-auth) por encima del umbral.
    await db.db.session.updateMany({ data: { lastVerifiedAt: new Date(Date.now() - 11 * 60 * 1000) } });
    await expect(sessionModule.requireReauth({ request })).rejects.toMatchObject({
      name: "ReauthenticationRequiredError",
    });
    // requireAuth sigue funcionando (la sesión es válida, solo "vieja").
    await expect(sessionModule.requireAuth({ request })).resolves.toBe(userId);
  });
});

describe("getCurrentUser (minimización de PII)", () => {
  it("devuelve solo campos públicos con la sesión activa", async () => {
    const { token } = await sessionModule.createSession(userId);
    const user = await sessionModule.getCurrentUser({ request: requestWithCookie(token) });
    expect(user).not.toBeNull();
    expect(user!.id).toBe(userId);
    expect(Object.keys(user!)).toEqual(
      expect.arrayContaining(["id", "name", "phoneNumber", "role", "slug", "businessId", "avatarUrl"]),
    );
    expect(Object.keys(user!)).not.toContain("email");
  });

  it("devuelve null sin sesión", async () => {
    expect(await sessionModule.getCurrentUser({ request: requestWithCookie(null) })).toBeNull();
  });
});
