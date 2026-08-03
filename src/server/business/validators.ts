// Validadores de negocios (Épica E2/E3): nombre, slug único, descripción,
// teléfono E.164 (contacto WhatsApp del negocio, D8) y logoUrl.
import { z } from "zod";
import { e164PhoneSchema } from "@/server/validators";

/** Slug de negocio (kebab-case): minúsculas, dígitos y guiones. */
export const businessSlugSchema = z
  .string()
  .trim()
  .min(1, "El slug no puede estar vacío")
  .max(120, "El slug no puede superar 120 caracteres")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug inválido: solo minúsculas, dígitos y guiones");

/** Logo del negocio: SOLO URLs de NUESTRO upload `/uploads/businesses/...`
 * (política de seguridad E2/E3). La política se aplica en el SERVICIO
 * (`business/service.ts` → `assertUploadedImageUrl`), no en la capa de acción:
 * undefined = no tocar, null = limpiar, string = solo uploads propios. Aquí el
 * zod solo valida formato URL/longitud, hasta 500 caracteres; nullish opcional. */
export const businessLogoUrlSchema = z
  .string()
  .trim()
  .url("Logo inválido: debe ser una URL absoluta")
  .max(500, "La URL del logo no puede superar 500 caracteres")
  .nullable()
  .optional();

/** Esquema de creación de un negocio (el slug se genera del nombre si falta). */
export const createBusinessSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(120, "El nombre no puede superar 120 caracteres"),
  slug: businessSlugSchema.optional(),
  description: z
    .string()
    .trim()
    .max(1_000, "La descripción no puede superar 1000 caracteres")
    .optional()
    .nullable(),
  phoneNumber: e164PhoneSchema,
});

export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;

/**
 * Esquema de edición del negocio (épica E3 — perfiles editables): todos los
 * campos opcionales (PATCH-like). El slug es editable PERO NO se regenera
 * automáticamente al renombrar (permalinga estable); si se cambia el nombre y
 * no el slug, el slug se conserva.
 */
export const updateBusinessSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(120, "El nombre no puede superar 120 caracteres")
    .optional(),
  slug: businessSlugSchema.optional(),
  description: z
    .string()
    .trim()
    .max(1_000, "La descripción no puede superar 1000 caracteres")
    .nullish(),
  phoneNumber: e164PhoneSchema.nullish(),
  logoUrl: businessLogoUrlSchema,
});

export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;
