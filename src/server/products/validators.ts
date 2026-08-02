// Validadores de productos (docs/architecture.md §2.1, §7 y roadmap E1).
//
// Reglas de negocio cubiertas:
//   - priceUsd > 0 (columna Decimal(10,2)).
//   - offerPriceUsd opcional y SIEMPRE menor que priceUsd.
//   - phoneNumber en E.164 (+58...) para el botón WhatsApp (D8).
//   - categorySlug ∈ las 6 categorías fijas (D2).
//   - status ∈ PRODUCT_STATUS (D11: String + unión TS, validado con zod en el borde).
//
// Nota: el módulo se creó como base para E1 (publicaciones del vendedor). En E0
// no hay rutas que lo usen todavía; su cobertura de prueba vive en
// tests/unit/validators.test.ts.
import { z } from "zod";
import { CATEGORIES, PRODUCT_STATUS, type CategorySlug, type ProductStatus } from "@/lib/constants";

/** Slug de categoría: una de las 6 fijas (comida, ropa, zapatos, perfume, automotriz, licor). */
export const categorySlugSchema = z.enum(
  CATEGORIES.map((c) => c.slug) as [CategorySlug, ...CategorySlug[]],
);

/** Estado de publicación del producto (DRAFT | ACTIVE | PAUSED | ARCHIVED). */
export const productStatusSchema = z.enum(
  Object.values(PRODUCT_STATUS) as [ProductStatus, ...ProductStatus[]],
);

/** Teléfono en E.164 (ITU-T): `+` + 7–15 dígitos, p. ej. "+584120000000". */
export const e164PhoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, "Teléfono inválido: debe ser E.164 (ej. +584120000000)");

/** Precio regular en USD: obligatorio, numérico y > 0, dentro de Decimal(10,2). */
export const priceUsdSchema = z.coerce
  .number()
  .finite("El precio debe ser numérico")
  .gt(0, "El precio debe ser mayor que 0")
  .max(99_999_999.99, "El precio supera el máximo de Decimal(10,2)");

/** Precio de oferta en USD: opcional (nullish); la condición < priceUsd se valida en el objeto. */
export const offerPriceUsdSchema = priceUsdSchema.nullish();

/** Slug de producto (kebab-case): minúsculas, dígitos y guiones. */
export const productSlugSchema = z
  .string()
  .trim()
  .min(1, "El slug no puede estar vacío")
  .max(120, "El slug no puede superar 120 caracteres")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug inválido: solo minúsculas, dígitos y guiones");

/** Esquema de creación/edición de un producto (E1). */
export const createProductSchema = z
  .object({
    slug: productSlugSchema,
    title: z
      .string()
      .trim()
      .min(3, "El título debe tener al menos 3 caracteres")
      .max(120, "El título no puede superar 120 caracteres"),
    description: z
      .string()
      .trim()
      .max(2_000, "La descripción no puede superar 2000 caracteres")
      .optional(),
    categorySlug: categorySlugSchema,
    priceUsd: priceUsdSchema,
    offerPriceUsd: offerPriceUsdSchema,
    phoneNumber: e164PhoneSchema,
    status: productStatusSchema.default("ACTIVE"),
  })
  .superRefine((data, ctx) => {
    if (data.offerPriceUsd != null && !(data.offerPriceUsd < data.priceUsd)) {
      ctx.addIssue({
        code: "custom",
        path: ["offerPriceUsd"],
        message: "El precio de oferta debe ser menor que el precio regular",
      });
    }
  });

export type CreateProductInput = z.infer<typeof createProductSchema>;
