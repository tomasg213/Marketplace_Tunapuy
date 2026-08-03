// Validadores de negocios (Épica E2): nombre, slug único, descripción y
// teléfono E.164 (contacto WhatsApp del negocio, D8).
import { z } from "zod";
import { e164PhoneSchema } from "@/server/validators";

/** Slug de negocio (kebab-case): minúsculas, dígitos y guiones. */
export const businessSlugSchema = z
  .string()
  .trim()
  .min(1, "El slug no puede estar vacío")
  .max(120, "El slug no puede superar 120 caracteres")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug inválido: solo minúsculas, dígitos y guiones");

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
