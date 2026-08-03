// Validación de variables de entorno al arrancar (dictamen security E2 — R11).
//
// Fail-fast: si falta algo crítico (DATABASE_URL, AUTH_SECRET < 32 chars) o la
// combinación es inválida (OTP_PROVIDER=whatsapp sin META_*), el proceso falla
// temprano en lugar de propagar errores raros a mitad de un request.
//
// Nota de diseño: la guarda "OTP_PROVIDER=dev en NODE_ENV=production" NO vive
// aquí porque `next build` corre con NODE_ENV=production aunque el destino sea
// dev/e2e (build de producción sobre http local). Esa guarda vive en el
// factory de proveedores OTP (src/server/auth/otp-provider.ts, R7), el punto
// exacto donde se elige el proveedor.
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url("APP_URL debe ser una URL válida").default("http://localhost:3000"),

  // Base de datos (PostgreSQL en todos los entornos).
  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatoria"),

  // Sesión opaca (R4): secreto pepper mínimo de 32 caracteres. También es la
  // clave HMAC de los códigos OTP (R3). Nunca commitear el valor real.
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET debe tener al menos 32 caracteres"),

  // OTP por teléfono (R1/R2/R6).
  OTP_PROVIDER: z.enum(["dev", "whatsapp"]).default("dev"),
  OTP_TTL_MINUTES: z.coerce.number().int().positive().default(5),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().max(10).default(5),

  // Meta Cloud API (WhatsApp Business) — solo si OTP_PROVIDER=whatsapp.
  META_WHATSAPP_TOKEN: z.string().optional().default(""),
  META_WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(""),
  META_WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional().default(""),
  META_WHATSAPP_OTP_TEMPLATE: z.string().optional().default("otp_verification"),

  // Tasa BCV (dolarapi).
  BCV_RATE_API_URL: z
    .string()
    .url()
    .default("https://ve.dolarapi.com/v1/dolares/oficial"),
  BCV_RATE_TTL_HOURS: z.coerce.number().int().positive().default(6),
  BCV_RATE_TTL_MEMORY_MINUTES: z.coerce.number().int().positive().default(10),
  BCV_RATE_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  BCV_RATE_FALLBACK: z.string().optional().default(""),

  // Imágenes (R9): local en dev; s3/cloudinary en E3 (mismo contrato).
  IMAGE_PROVIDER: z.enum(["local", "s3", "cloudinary"]).default("local"),

  // Cookie de sesión: por defecto Secure solo en producción. En builds de
  // producción sobre http://localhost (e2e local) se fuerza false.
  SESSION_COOKIE_SECURE: z.enum(["true", "false"]).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

/** Valida un objeto de entorno y devuelve el resultado tipado (fail-fast). */
export function validateEnv(input: Record<string, string | undefined>): Env {
  const parsed = EnvSchema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Variables de entorno inválidas:\n${details}`);
  }

  const env = parsed.data;

  // Guarda de configuración (R11): whatsapp exige las credenciales Meta.
  if (env.OTP_PROVIDER === "whatsapp" && (!env.META_WHATSAPP_TOKEN || !env.META_WHATSAPP_PHONE_NUMBER_ID)) {
    throw new Error(
      "OTP_PROVIDER=whatsapp requiere META_WHATSAPP_TOKEN y META_WHATSAPP_PHONE_NUMBER_ID",
    );
  }

  return env;
}

// Fail-fast al importar (server-only). Los tests usan validateEnv() con
// entradas controladas; los módulos de auth leen process.env directamente.
export const env = validateEnv(process.env);
