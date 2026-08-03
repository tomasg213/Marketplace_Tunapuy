// Pruebas del token de sesión OPACO (src/server/auth/session-token.ts) y de la
// cookie (session-cookie.ts) — dictamen E2 R4.
// El token es un secreto aleatorio de 32 bytes (base64url); la BD guarda solo
// su sha256. La cookie es httpOnly + Secure (prod) + SameSite=Lax + __Host-.
import { afterEach, describe, expect, it } from "vitest";
import {
  generateSessionToken,
  hashSessionToken,
  SESSION_TOKEN_BYTES,
} from "../../src/server/auth/session-token";
import {
  isSessionCookieSecure,
  SESSION_COOKIE_BASE,
  sessionCookieName,
  sessionCookieOptions,
  SESSION_TTL_SECONDS,
} from "../../src/server/auth/session-cookie";

describe("generateSessionToken / hashSessionToken (R4)", () => {
  it("genera tokens aleatorios de 32 bytes en base64url (~43 chars)", () => {
    const token = generateSessionToken();
    expect(token).not.toBe("");
    expect(Buffer.from(token, "base64url").length).toBe(SESSION_TOKEN_BYTES);
  });

  it("genera tokens distintos en cada llamada", () => {
    expect(generateSessionToken()).not.toBe(generateSessionToken());
  });

  it("el hash es sha256 (64 hex) y nunca revela el token", () => {
    const token = generateSessionToken();
    const hash = hashSessionToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
  });

  it("hash determinista: mismo token → mismo hash (verificación por lookup)", () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });
});

describe("sessionCookieOptions (R4)", () => {
  const savedSecure = process.env.SESSION_COOKIE_SECURE;
  const savedNodeEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.SESSION_COOKIE_SECURE = savedSecure;
    (process.env as Record<string, string | undefined>).NODE_ENV = savedNodeEnv;
  });

  it("en producción la cookie es Secure y con prefijo __Host-", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    delete process.env.SESSION_COOKIE_SECURE;
    expect(isSessionCookieSecure()).toBe(true);
    expect(sessionCookieName()).toBe(`__Host-${SESSION_COOKIE_BASE}`);
    const opts = sessionCookieOptions();
    expect(opts.httpOnly).toBe(true);
    expect(opts.secure).toBe(true);
    expect(opts.sameSite).toBe("lax");
    expect(opts.path).toBe("/");
    expect(opts.maxAge).toBe(SESSION_TTL_SECONDS);
  });

  it("en desarrollo (http local) la cookie NO es Secure y usa el nombre base", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    delete process.env.SESSION_COOKIE_SECURE;
    expect(isSessionCookieSecure()).toBe(false);
    expect(sessionCookieName()).toBe(SESSION_COOKIE_BASE);
    expect(sessionCookieOptions().secure).toBe(false);
  });

  it("SESSION_COOKIE_SECURE=false fuerza nombre base incluso en build prod", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.SESSION_COOKIE_SECURE = "false";
    expect(sessionCookieName()).toBe(SESSION_COOKIE_BASE);
    expect(sessionCookieOptions().secure).toBe(false);
  });
});
