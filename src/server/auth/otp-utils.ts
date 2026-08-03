// Utilidades de códigos OTP (dictamen security E2 — R3).
//
// El código se guarda como `salt:HMAC-SHA256(AUTH_SECRET, salt + code)`:
//   - HMAC keyed: sin AUTH_SECRET (pepper) no se puede recuperar ni adivinar
//     el código aunque se filtre la BD (a diferencia del sha256 plano).
//   - salt aleatorio por emisión (32 bytes hex) contra rainbow tables.
//   - comparación timing-safe.
//
// R2: el TTL y el máximo de intentos se leen aquí con defaults del dictamen
// (5 min / 5 intentos) pero se sobrescriben por configuración en tiempo de
// verificación (señal de llamada directa a verifyOtp).
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";

/** Formato: `<salt-hex>:<hmac-hex>` (salt 32 bytes → 64 hex, hmac 32 bytes → 64 hex). */
export const OTP_HASH_REGEX = /^[0-9a-f]{64}:[0-9a-f]{64}$/;

/** TTL por defecto (5 minutos) y máximo de intentos (5). */
export const OTP_DEFAULT_TTL_MINUTES = 5;
export const OTP_DEFAULT_MAX_ATTEMPTS = 5;

/** Fecha de expiración de un código recién emitido (now + TTL). */
export function otpExpiresAt(ttlMinutes = OTP_DEFAULT_TTL_MINUTES): Date {
  return new Date(Date.now() + ttlMinutes * 60 * 1000);
}

/** ¿El código ya venció? */
export function isOtpExpired(expiresAt: Date): boolean {
  return expiresAt.getTime() <= Date.now();
}

/** ¿Quedan intentos de verificación? */
export function hasAttemptsLeft(attempts: number, maxAttempts = OTP_DEFAULT_MAX_ATTEMPTS): boolean {
  return attempts < maxAttempts;
}

/**
 * Hash del código OTP con HMAC keyed por AUTH_SECRET.
 * Devuelve `salt:hmac`; el código en claro NO se persiste ni se loguea (R7).
 */
export function hashOtpCode(code: string): string {
  const salt = randomBytes(32).toString("hex");
  return `${salt}:${hmac(salt, code)}`;
}

function hmac(salt: string, code: string): string {
  return createHmac("sha256", env.AUTH_SECRET).update(`${salt}:${code}`).digest("hex");
}

/**
 * Verifica `code` contra un hash persistido (`salt:hmac`).
 * Comparación timing-safe; nunca revolver el hash.
 */
export function verifyOtpCode(code: string, storedHash: string): boolean {
  if (!OTP_HASH_REGEX.test(storedHash)) return false;
  const [salt, expectedHex] = storedHash.split(":");
  const actual = Buffer.from(hmac(salt, code), "hex");
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Genera un código OTP numérico de `digits` dígitos (por defecto 6). */
export function generateOtpCode(digits = 6): string {
  if (digits < 4 || digits > 10) throw new Error("digits must be between 4 and 10");
  const max = 10 ** digits;
  const bytes = Math.ceil((digits * Math.log2(10) + 8) / 8);
  const bits = bytes * 8;
  // Rejection sampling: solo acepta valores dentro del múltiplo más alto de
  // `max`, eliminando el sesgo del módulo (uniforme real).
  const limit = Math.floor(2 ** bits / max) * max;
  let out = 0;
  do {
    out = Number(randomBytes(bytes).readUIntBE(0, bytes));
  } while (out >= limit);
  return (out % max).toString().padStart(digits, "0");
}
