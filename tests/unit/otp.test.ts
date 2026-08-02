import { describe, expect, it } from "vitest";
import {
  OTP_CODE_LENGTH,
  generateOtpCode,
  hasAttemptsLeft,
  hashOtpCode,
  isOtpExpired,
  isValidOtpFormat,
  otpExpiresAt,
  verifyOtpCode,
} from "../../src/server/auth/otp-utils";

describe("generateOtpCode", () => {
  it("genera un código de 6 dígitos", () => {
    const code = generateOtpCode();
    expect(code).toHaveLength(OTP_CODE_LENGTH);
    expect(code).toMatch(/^\d{6}$/);
  });

  it("genera códigos distintos (alta probabilidad)", () => {
    expect(generateOtpCode()).not.toBe(generateOtpCode());
  });

  it("respeta una longitud custom (sin sesgo de módulo)", () => {
    for (const len of [4, 6, 8]) {
      const code = generateOtpCode(len);
      expect(code).toHaveLength(len);
      expect(code).toMatch(new RegExp(`^\\d{${len}}$`));
    }
  });
});

describe("isValidOtpFormat", () => {
  it("acepta exactamente 6 dígitos", () => {
    expect(isValidOtpFormat("123456")).toBe(true);
    expect(isValidOtpFormat("000000")).toBe(true);
  });

  it("rechaza letras, largo incorrecto o vacío", () => {
    expect(isValidOtpFormat("12a456")).toBe(false);
    expect(isValidOtpFormat("12345")).toBe(false);
    expect(isValidOtpFormat("1234567")).toBe(false);
    expect(isValidOtpFormat("")).toBe(false);
  });
});

describe("hashOtpCode / verifyOtpCode", () => {
  it("nunca guarda el código en texto plano", () => {
    const hash = hashOtpCode("123456");
    expect(hash).not.toContain("123456");
    // formato: saltHex(32) : sha256Hex(64)
    expect(hash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/);
  });

  it("usa un salt distinto por código (mismo código → hashes distintos)", () => {
    expect(hashOtpCode("123456")).not.toBe(hashOtpCode("123456"));
  });

  it("verifica códigos correctos y rechaza incorrectos", () => {
    const hash = hashOtpCode("123456");
    expect(verifyOtpCode("123456", hash)).toBe(true);
    expect(verifyOtpCode("654321", hash)).toBe(false);
    expect(verifyOtpCode("12345", hash)).toBe(false); // formato inválido
  });

  it("no verifica hashes mal formados", () => {
    expect(verifyOtpCode("123456", "sin-salt")).toBe(false);
  });

  it("verificación timing-safe: rechaza sin lanzar, incluso con largo distinto", () => {
    const hash = hashOtpCode("123456");
    // Distinto largo → devuelve false sin excepción (short-circuit antes del hash).
    expect(verifyOtpCode("1", hash)).toBe(false);
    expect(verifyOtpCode("", hash)).toBe(false);
    // Hash mal formado (sin ':' o hex inválido) → false, nunca throw.
    expect(verifyOtpCode("123456", "abcdef")).toBe(false);
    expect(verifyOtpCode("123456", `${"a".repeat(32)}:zz`)).toBe(false);
  });

  it("roundtrip completo: hash → verify OK y hash ≠ código plano", () => {
    const code = generateOtpCode();
    const hash = hashOtpCode(code);
    expect(hash).not.toContain(code);
    expect(verifyOtpCode(code, hash)).toBe(true);
  });
});

describe("consumo único (semántica del flujo)", () => {
  it("verifyOtpCode es pura y determinista: no consume ni invalida por sí misma", () => {
    const hash = hashOtpCode("123456");
    // La misma verificación se puede repetir: el "consumo único" NO está en la
    // función de utilidad, sino en el flujo (OtpCode.consumedAt), aún no
    // implementado en E0 → pendiente de cubrir en E1 (riesgo R1).
    expect(verifyOtpCode("123456", hash)).toBe(true);
    expect(verifyOtpCode("123456", hash)).toBe(true);
  });

  it("intentos fallidos no mutan el hash almacenado", () => {
    const hash = hashOtpCode("123456");
    expect(verifyOtpCode("000000", hash)).toBe(false);
    expect(verifyOtpCode("000000", hash)).toBe(false);
    // El código correcto sigue verificando: el límite de intentos también es
    // responsabilidad del flujo (contador `attempts`), no de la utilidad.
    expect(verifyOtpCode("123456", hash)).toBe(true);
  });
});

describe("isOtpExpired", () => {
  const now = new Date("2026-08-02T12:00:00.000Z");

  it("considera vencido cuando expiresAt <= now", () => {
    expect(isOtpExpired(new Date("2026-08-02T11:59:59.000Z"), now)).toBe(true);
    expect(isOtpExpired(new Date("2026-08-02T12:00:00.000Z"), now)).toBe(true);
  });

  it("considera vigente cuando expiresAt > now", () => {
    expect(isOtpExpired(new Date("2026-08-02T12:00:01.000Z"), now)).toBe(false);
  });
});

describe("otpExpiresAt", () => {
  it("calcula expiración = now + TTL (minutos)", () => {
    const now = new Date("2026-08-02T12:00:00.000Z");
    expect(otpExpiresAt(now, 5).toISOString()).toBe("2026-08-02T12:05:00.000Z");
  });
});

describe("hasAttemptsLeft", () => {
  it("respeta el límite de intentos (default 5)", () => {
    expect(hasAttemptsLeft(0)).toBe(true);
    expect(hasAttemptsLeft(4)).toBe(true);
    expect(hasAttemptsLeft(5)).toBe(false);
  });

  it("respeta un máximo custom", () => {
    expect(hasAttemptsLeft(3, 5)).toBe(true);
    expect(hasAttemptsLeft(5, 5)).toBe(false);
  });
});
