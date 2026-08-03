// Validadores compartidos de servidor (teléfono venezolano, etc.).
// `products/validators.ts` re-exporta `e164PhoneSchema` para compatibilidad.
//
// R6 (dictamen security E2): el login OTP valida PREFIJO +58 y formato
// venezolano ANTES de generar cualquier código (anti sms-bombing). Acepta:
//   - formato local:  04121234567  (11 dígitos) → se normaliza a +584121234567
//   - formato E.164:  +584121234567 (+58 + 10 dígitos)
// Se rechaza cualquier otro prefijo de país: este marketplace es local VE y el
// WhatsApp es wa.me con el número nacional.
import { z } from "zod";

/**
 * Normaliza un teléfono venezolano a E.164 (+58 + 10 dígitos).
 * Devuelve `null` si no es VE (prefijo +58 / 11 dígitos locales).
 */
export function normalizeVePhone(raw: string): string | null {
  const compact = raw.trim().replace(/[\s\-().]/g, "");
  // E.164: +58 + 10 dígitos (p. ej. +584121234567)
  if (/^\+58\d{10}$/.test(compact)) return compact;
  // Local: 04XXXXXXXXX (11 dígitos, p. ej. 04121234567) → +584121234567
  if (/^04\d{9}$/.test(compact)) return `+58${compact.slice(1)}`;
  return null;
}

/** Teléfono venezolano normalizado a E.164 (prefijo +58 y 11 dígitos locales). */
export const vePhoneSchema = z
  .string()
  .trim()
  .transform((raw, ctx) => {
    const normalized = normalizeVePhone(raw);
    if (!normalized) {
      ctx.addIssue({
        code: "custom",
        message: "Teléfono inválido: debe ser venezolano con prefijo +58 y 11 dígitos (ej. 04121234567)",
      });
      return z.NEVER;
    }
    return normalized;
  });

/** Alias histórico E.164 → ahora valida VE (el marketplace es local). */
export const e164PhoneSchema = vePhoneSchema;
