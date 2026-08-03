// Pruebas de utilidades OTP (src/server/auth/otp-utils.ts) — dictamen E2 R3.
// El hash es HMAC-SHA256(AUTH_SECRET, salt + code): sin la clave (pepper) no
// se puede recuperar el código ni forjar hashes; el formato es
// `saltHex(32B → 64 chars):hmacHex(32B → 64 chars)`.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OTP_CODE_LENGTH } from "../../src/lib/constants";
import {
  generateOtpCode,
  hasAttemptsLeft,
  hashOtpCode,
  isOtpExpired,
  otpExpiresAt,
  OTP_HASH_REGEX,
  verifyOtpCode,
} from "../../src/server/auth/otp-utils";

// otp-utils lee env.AUTH_SECRET en tiempo de carga (pepper del HMAC).
beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-0123456789abcdefghijklmnopqrstuv";
});

describe("generateOtpCode", () => {
  it("genera un código de 6 dígitos", () => {
    const code = generateOtpCode();
    expect(code).toHaveLength(OTP_CODE_LENGTH);
    expect(code).toMatch(/^\d{6}$/);
  });

  it("genera códigos distintos (alta probabilidad)", () => {
    expect(generateOtpCode()).not.toBe(generateOtpCode());
  });

  it("respeta una longitud custom sin sesgo de módulo (rejection sampling)", () => {
    for (const len of [4, 6, 8]) {
      const code = generateOtpCode(len);
      expect(code).toHaveLength(len);
      expect(code).toMatch(new RegExp(`^\\d{${len}}$`));
    }
  });
});

describe("hashOtpCode / verifyOtpCode (R3: HMAC keyed por AUTH_SECRET)", () => {
  it("nunca guarda el código en texto plano y usa formato salt:hmac", () => {
    const hash = hashOtpCode("123456");
    expect(hash).not.toContain("123456");
    expect(hash).toMatch(/^[0-9a-f]{64}:[0-9a-f]{64}$/);
    expect(OTP_HASH_REGEX.test(hash)).toBe(true);
  });

  it("usa un salt distinto por código (mismo código → hashes distintos)", () => {
    expect(hashOtpCode("123456")).not.toBe(hashOtpCode("123456"));
  });

  it("verifica códigos correctos y rechaza incorrectos", () => {
    const hash = hashOtpCode("123456");
    expect(verifyOtpCode("123456", hash)).toBe(true);
    expect(verifyOtpCode("654321", hash)).toBe(false);
    expect(verifyOtpCode("12345", hash)).toBe(false);
  });

  it("el HMAC depende del AUTH_SECRET: con otra clave no verifica", async () => {
    // otp-utils lee env.AUTH_SECRET al cargar (pepper). Se reimporta el módulo
    // con otra clave para comprobar que el hash no verifica (R3).
    const hash = hashOtpCode("123456");
    process.env.AUTH_SECRET = "otra-clave-distinta-0123456789abcdefghijklmnop";
    vi.resetModules();
    const fresh = await import("../../src/server/auth/otp-utils");
    expect(fresh.verifyOtpCode("123456", hash)).toBe(false);
  });

  it("no verifica hashes mal formados", () => {
    expect(verifyOtpCode("123456", "sin-salt")).toBe(false);
    expect(verifyOtpCode("123456", `${"a".repeat(63)}:${"b".repeat(64)}`)).toBe(false);
    expect(verifyOtpCode("123456", `${"a".repeat(64)}:zz`)).toBe(false);
  });

  it("roundtrip completo: hash → verify OK y hash ≠ código plano", () => {
    const code = generateOtpCode();
    const hash = hashOtpCode(code);
    expect(hash).not.toContain(code);
    expect(verifyOtpCode(code, hash)).toBe(true);
  });
});

describe("isOtpExpired / otpExpiresAt", () => {
  it("considera vencido cuando expiresAt <= now", () => {
    const now = Date.now();
    expect(isOtpExpired(new Date(now - 1000))).toBe(true);
    expect(isOtpExpired(new Date(now))).toBe(true);
  });

  it("considera vigente cuando expiresAt > now", () => {
    expect(isOtpExpired(new Date(Date.now() + 1000))).toBe(false);
  });

  it("otpExpiresAt calcula expiración = now + TTL (default 5 min)", () => {
    const expires = otpExpiresAt(5);
    expect(expires.getTime() - Date.now()).toBeGreaterThan(4 * 60 * 1000);
    expect(expires.getTime() - Date.now()).toBeLessThanOrEqual(5 * 60 * 1000);
  });

  it("hasAttemptsLeft respeta el límite (default 5)", () => {
    expect(hasAttemptsLeft(0)).toBe(true);
    expect(hasAttemptsLeft(4)).toBe(true);
    expect(hasAttemptsLeft(5)).toBe(false);
  });
});
