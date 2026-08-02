// Utilidades de códigos OTP (docs/architecture.md §2.2, modelo OtpCode).
// El código en texto plano NUNCA se persiste: se guarda `hashOtpCode()`.
// Algoritmo: sha256 con salt aleatorio por código (16 bytes hex).
// Seguridad: comparación timing-safe y sin sesgo de módulo en la generación.
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const OTP_CODE_LENGTH = 6;
export const OTP_DEFAULT_TTL_MINUTES = Number(process.env.OTP_TTL_MINUTES ?? 5);
export const OTP_DEFAULT_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS ?? 5);

/**
 * Genera un código numérico de `length` dígitos usando crypto.randomInt
 * (sin sesgo de módulo). Ej.: "482913".
 */
export function generateOtpCode(length: number = OTP_CODE_LENGTH): string {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += String(randomInt(0, 10));
  }
  return code;
}

/** Valida el formato de un código OTP (solo dígitos, longitud correcta). */
export function isValidOtpFormat(code: string, length: number = OTP_CODE_LENGTH): boolean {
  return new RegExp(`^\\d{${length}}$`).test(code);
}

/** Genera un salt aleatorio en hex (16 bytes). */
export function generateSalt(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Hashea un código OTP: `"<salt>:<sha256(salt + code)>"`.
 * Almacenar este string en `OtpCode.codeHash`, nunca el código plano.
 */
export function hashOtpCode(code: string, salt: string = generateSalt()): string {
  const hash = createHash("sha256").update(salt).update(code).digest("hex");
  return `${salt}:${hash}`;
}

/** Verifica un código contra un `codeHash` almacenado (timing-safe). */
export function verifyOtpCode(code: string, stored: string): boolean {
  const [salt, expectedHex] = stored.split(":");
  if (!salt || !expectedHex) return false;
  if (!isValidOtpFormat(code)) return false;

  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(
    createHash("sha256").update(salt).update(code).digest("hex"),
    "hex",
  );

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** ¿El código ya venció? (`expiresAt` <= ahora). */
export function isOtpExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

/** ¿Quedan intentos de verificación? (se invalida al alcanzar el máximo). */
export function hasAttemptsLeft(
  attempts: number,
  maxAttempts: number = OTP_DEFAULT_MAX_ATTEMPTS,
): boolean {
  return attempts < maxAttempts;
}

/** Calcula `expiresAt` = now + TTL (minutos). */
export function otpExpiresAt(
  now: Date = new Date(),
  ttlMinutes: number = OTP_DEFAULT_TTL_MINUTES,
): Date {
  return new Date(now.getTime() + ttlMinutes * 60_000);
}
