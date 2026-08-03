// Servicio de CRUD de productos del vendedor (Épica E2).
//
// Capa de negocio compartida por server actions (`actions.ts`) y route
// handlers (`/api/products`). Reglas:
//   - Ownership: solo el dueño (Product.sellerId === userId) puede
//     editar/cambiar estado/eliminar.
//   - Validación con `products/validators.ts` (priceUsd>0, offer<price,
//     E.164, slug de categoría).
//   - Al publicar (status ACTIVE): `publishedAt` = ahora y el usuario pasa a
//     role SELLER (find-or-create registró BUYER).
//   - Soporte borrador: status DRAFT sin publishedAt.
//   - `businessId` opcional: solo si el usuario es dueño del negocio.
import { USER_ROLE, type ProductStatus } from "@/lib/constants";
import { slugify, uniqueSlug } from "@/lib/slug";
import { db, Prisma } from "@/server/db";
import { getImageStorage } from "@/server/images/image-storage";
import {
  categorySlugsSchema,
  e164PhoneSchema,
  offerPriceUsdSchema,
  priceUsdSchema,
  productSlugSchema,
  productStatusSchema,
} from "@/server/products/validators";
import { z } from "zod";

// BusinessOwnershipError vive en business/service.ts (fuente única); se
// re-exporta aquí por compatibilidad (actions y route handlers lo importan).
export { BusinessOwnershipError } from "@/server/business/service";
import { BusinessOwnershipError } from "@/server/business/service";

// ---------------------------------------------------------------------------
// Errores controlados
// ---------------------------------------------------------------------------

export class ProductNotFoundError extends Error {
  constructor(message = "Producto no encontrado") {
    super(message);
    this.name = "ProductNotFoundError";
  }
}

export class ProductOwnershipError extends Error {
  constructor(message = "No tienes permisos sobre este producto") {
    super(message);
    this.name = "ProductOwnershipError";
  }
}

export class ProductValidationError extends Error {
  constructor(message: string, public readonly issues?: z.ZodIssue[]) {
    super(message);
    this.name = "ProductValidationError";
  }
}

/** Conflicto de slug único (R10): el route responde 409 y el cliente reintenta. */
export class ProductSlugConflictError extends Error {
  constructor(message = "El slug ya está en uso") {
    super(message);
    this.name = "ProductSlugConflictError";
  }
}

// ---------------------------------------------------------------------------
// Schemas de entrada (el slug de producto es opcional: se genera del título)
// ---------------------------------------------------------------------------

const productImageInput = z.object({
  url: z.string().url("Imagen inválida: url debe ser absoluta"),
  key: z.string().min(1, "key de imagen requerido"),
  alt: z.string().max(200).optional().nullable(),
});

/**
 * Esquema de creación del servicio: slug opcional (se genera del título si
 * falta), businessId opcional e imágenes. Se construye de forma independiente
 * reutilizando los field schemas de `validators.ts`: zod v4 prohíbe `.extend`
 * y `.omit` sobre esquemas con refinements (superRefine de createProductSchema).
 */
export const createProductActionSchema = z
  .object({
    slug: productSlugSchema.optional(),
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
    categorySlugs: categorySlugsSchema,
    priceUsd: priceUsdSchema,
    offerPriceUsd: offerPriceUsdSchema,
    phoneNumber: e164PhoneSchema,
    // R10: un producto NUEVO nace como DRAFT (nunca ACTIVE por omisión).
    status: productStatusSchema.default("DRAFT"),
    businessId: z.string().optional().nullable(),
    images: z.array(productImageInput).max(8, "Máximo 8 imágenes por producto").optional(),
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

/** Input de creación: `status` es OPCIONAL (default DRAFT se aplica al parsear). */
export type CreateProductActionInput = z.input<typeof createProductActionSchema>;

/** Esquema de edición: todos los campos opcionales (PATCH-like). */
export const updateProductActionSchema = z
  .object({
    slug: productSlugSchema.optional(),
    title: z.string().trim().min(3).max(120).optional(),
    description: z.string().trim().max(2_000).optional().nullable(),
    categorySlugs: categorySlugsSchema.optional(),
    priceUsd: priceUsdSchema.optional(),
    offerPriceUsd: priceUsdSchema.nullish(),
    phoneNumber: e164PhoneSchema.optional(),
    status: productStatusSchema.optional(),
    businessId: z.string().optional().nullable(),
    images: z.array(productImageInput).max(8).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.offerPriceUsd != null && data.priceUsd != null && !(data.offerPriceUsd < data.priceUsd)) {
      ctx.addIssue({
        code: "custom",
        path: ["offerPriceUsd"],
        message: "El precio de oferta debe ser menor que el precio regular",
      });
    }
  });

/** Input de edición: todos los campos opcionales (PATCH-like). */
export type UpdateProductActionInput = z.input<typeof updateProductActionSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function asDecimal(value: number | string): Prisma.Decimal {
  return new Prisma.Decimal(String(value));
}

/** Valida el ownership del negocio (si se pasa) y devuelve su id o null. */
async function resolveBusinessId(
  tx: Prisma.TransactionClient | PrismaClientLike,
  businessId: string | null | undefined,
  userId: string,
): Promise<string | null> {
  if (!businessId) return null;
  const business = await tx.business.findUnique({ where: { id: businessId }, select: { ownerId: true } });
  if (!business || business.ownerId !== userId) {
    throw new BusinessOwnershipError();
  }
  return businessId;
}

/** Slug único para un producto nuevo (dedupe contra slugs existentes). */
async function ensureProductSlug(
  tx: Prisma.TransactionClient | PrismaClientLike,
  title: string,
  explicitSlug?: string,
): Promise<string> {
  if (explicitSlug) return explicitSlug;
  const base = slugify(title);
  const existing = await tx.product.findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true },
  });
  return uniqueSlug(title, existing.map((p: { slug: string }) => p.slug));
}

/** Si el status es ACTIVE, devuelve publishedAt (si aún no había). */
function publishedAtFor(status: string, current: Date | null): Date | null {
  if (status !== "ACTIVE") return current;
  return current ?? new Date();
}

// Transiciones de estado válidas (R10): ARCHIVED solo se reactiva.
const ALLOWED_TRANSITIONS: Record<ProductStatus, ProductStatus[]> = {
  DRAFT: ["ACTIVE", "PAUSED", "ARCHIVED", "SOLD"],
  ACTIVE: ["PAUSED", "ARCHIVED", "SOLD"],
  PAUSED: ["ACTIVE", "ARCHIVED", "SOLD"],
  // Archivado = fuera de catálogo: la única operación permitida es reactivar
  // (a ACTIVE o devolver a DRAFT). Nada de editar contenido mientras está.
  ARCHIVED: ["ACTIVE", "DRAFT"],
  SOLD: ["ACTIVE", "ARCHIVED", "PAUSED"],
};

/** Valida una transición de estado (R10); lanza ProductValidationError si no. */
function assertStatusTransition(from: string, to: string): void {
  const fromStatus = from as ProductStatus;
  const toStatus = to as ProductStatus;
  if (!ALLOWED_TRANSITIONS[fromStatus].includes(toStatus)) {
    throw new ProductValidationError(`No se puede pasar de ${from} a ${to}`);
  }
}

/** Campos editables de un producto ARCHIVED: solo `status` (reactivación, R10). */
const ARCHIVED_EDITABLE_FIELDS = new Set(["status"]);

type PrismaClientLike = Pick<
  Prisma.TransactionClient,
  "business" | "product" | "category" | "user"
>;

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export interface CreateProductResult {
  product: Prisma.ProductGetPayload<{ include: typeof createResultInclude }>;
}

const createResultInclude = {
  // Multi-categoría (épica E3): se incluyen ordenadas por position (0 = principal).
  categories: { include: { category: true }, orderBy: { position: "asc" as const } },
  images: { orderBy: { position: "asc" as const } },
} as const;

/** Crea un producto (borrador o publicado) y marca al usuario como SELLER. */
export async function createProductRecord(
  userId: string,
  input: CreateProductActionInput,
): Promise<CreateProductResult> {
  const parsed = createProductActionSchema.safeParse(input);
  if (!parsed.success) {
    throw new ProductValidationError(
      parsed.error.issues[0]?.message ?? "Datos de producto inválidos",
      parsed.error.issues,
    );
  }
  const data = parsed.data;
  // R10: default DRAFT (nunca se publica un producto por omisión).
  const status = data.status ?? "DRAFT";

  let product: Awaited<ReturnType<typeof createProductRecord>>["product"];
  try {
    product = await db.$transaction(async (tx) => {
      // Multi-categoría (épica E3): se resuelven TODAS y se valida que existan
      // (si falta alguna → ProductValidationError). Dedupe preservando el orden:
      // un slug repetido daría PK duplicada en ProductCategory.
      const categorySlugs = [...new Set(data.categorySlugs)];
      const found = await tx.category.findMany({
        where: { slug: { in: categorySlugs } },
        select: { id: true, slug: true },
      });
      const foundSlugs = new Set(found.map((c) => c.slug));
      const missing = categorySlugs.filter((slug) => !foundSlugs.has(slug));
      if (missing.length > 0) {
        throw new ProductValidationError(`Categorías desconocidas: ${missing.join(", ")}`);
      }
      const categoryIdBySlug = new Map(found.map((c) => [c.slug, c.id]));

      const businessId = await resolveBusinessId(tx, data.businessId, userId);
      const slug = await ensureProductSlug(tx, data.title, data.slug);
      const publishedAt = publishedAtFor(status, null);

      return tx.product.create({
        data: {
          slug,
          title: data.title,
          description: data.description ?? null,
          priceUsd: asDecimal(data.priceUsd),
          offerPriceUsd: data.offerPriceUsd != null ? asDecimal(data.offerPriceUsd) : null,
          phoneNumber: data.phoneNumber,
          status,
          publishedAt,
          sellerId: userId,
          businessId,
          categories: {
            create: categorySlugs.map((slug, position) => ({
              categoryId: categoryIdBySlug.get(slug)!,
              position,
            })),
          },
          images: data.images?.length
            ? {
                create: data.images.map((image, position) => ({
                  url: image.url,
                  key: image.key,
                  alt: image.alt ?? null,
                  position,
                })),
              }
            : undefined,
        },
        include: createResultInclude,
      });
    });
  } catch (err) {
    // R10: colisión de slug único (explícito o carrera) → 409, no 500.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ProductSlugConflictError();
    }
    throw err;
  }

  // Al publicar, el usuario pasa a ser vendedor (si aún era BUYER).
  if (status === "ACTIVE") {
    await db.user.updateMany({
      where: { id: userId, role: { not: USER_ROLE.SELLER } },
      data: { role: USER_ROLE.SELLER },
    });
  }

  return { product };
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export interface UpdateProductResult {
  product: Prisma.ProductGetPayload<{ include: typeof createResultInclude }>;
}

/** Edita un producto del dueño (cualquier campo; status incluido). */
export async function updateProductRecord(
  userId: string,
  productId: string,
  input: UpdateProductActionInput,
): Promise<UpdateProductResult> {
  const parsed = updateProductActionSchema.safeParse(input);
  if (!parsed.success) {
    throw new ProductValidationError(
      parsed.error.issues[0]?.message ?? "Datos de producto inválidos",
      parsed.error.issues,
    );
  }
  const data = parsed.data;

  const product = await db.$transaction(async (tx) => {
    const existing = await tx.product.findUnique({ where: { id: productId } });
    if (!existing) throw new ProductNotFoundError();
    if (existing.sellerId !== userId) throw new ProductOwnershipError();

    // R10: un producto ARCHIVED no es editable salvo reactivación (solo status).
    if (existing.status === "ARCHIVED") {
      const nonStatusFields = Object.keys(data).filter((key) => !ARCHIVED_EDITABLE_FIELDS.has(key));
      if (nonStatusFields.length > 0) {
        throw new ProductValidationError(
          "Producto archivado: reactívalo antes de editarlo",
        );
      }
    }

    const businessId = await resolveBusinessId(tx, data.businessId, userId);
    const slug = data.slug ?? existing.slug;
    const status = data.status ?? existing.status;
    // R10: transiciones validadas (no se puede saltar de ARCHIVED a PAUSED, etc.).
    if (data.status && data.status !== existing.status) {
      assertStatusTransition(existing.status, data.status);
    }
    const publishedAt = publishedAtFor(status, existing.publishedAt);

    // Multi-categoría (épica E3): si vienen categorySlugs, resolver IDs y
    // reemplazar las asociaciones (deleteMany + create, patrón como `images`).
    let resolvedCategories:
      | { create: { categoryId: string; position: number }[] }
      | undefined;
    if (data.categorySlugs !== undefined) {
      const categorySlugs = [...new Set(data.categorySlugs)];
      const found = await tx.category.findMany({
        where: { slug: { in: categorySlugs } },
        select: { id: true, slug: true },
      });
      const foundSlugs = new Set(found.map((c) => c.slug));
      const missing = categorySlugs.filter((slug) => !foundSlugs.has(slug));
      if (missing.length > 0) {
        throw new ProductValidationError(`Categorías desconocidas: ${missing.join(", ")}`);
      }
      const categoryIdBySlug = new Map(found.map((c) => [c.slug, c.id]));
      resolvedCategories = {
        create: categorySlugs.map((slug, position) => ({
          categoryId: categoryIdBySlug.get(slug)!,
          position,
        })),
      };
    }

    return tx.product.update({
      where: { id: productId },
      data: {
        ...(data.slug !== undefined ? { slug } : {}),
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(resolvedCategories !== undefined
          ? { categories: { deleteMany: {}, ...resolvedCategories } }
          : {}),
        ...(data.priceUsd !== undefined ? { priceUsd: asDecimal(data.priceUsd) } : {}),
        ...(data.offerPriceUsd !== undefined
          ? { offerPriceUsd: data.offerPriceUsd != null ? asDecimal(data.offerPriceUsd) : null }
          : {}),
        ...(data.phoneNumber !== undefined ? { phoneNumber: data.phoneNumber } : {}),
        status,
        publishedAt,
        ...(data.businessId !== undefined ? { businessId } : {}),
        ...(data.images !== undefined
          ? {
              images: {
                deleteMany: {},
                create: data.images.map((image, position) => ({
                  url: image.url,
                  key: image.key,
                  alt: image.alt ?? null,
                  position,
                })),
              },
            }
          : {}),
      },
      include: createResultInclude,
    });
  }).catch((err) => {
    // R10: colisión de slug único al editar → 409 (no 500).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ProductSlugConflictError();
    }
    throw err;
  });

  if (product.status === "ACTIVE") {
    await db.user.updateMany({
      where: { id: userId, role: { not: USER_ROLE.SELLER } },
      data: { role: USER_ROLE.SELLER },
    });
  }

  return { product };
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/** Cambia el estado de un producto (DRAFT | ACTIVE | PAUSED | ARCHIVED | SOLD). */
export async function setProductStatusRecord(
  userId: string,
  productId: string,
  status: ProductStatus,
): Promise<void> {
  const parsed = productStatusSchema.safeParse(status);
  if (!parsed.success) {
    throw new ProductValidationError("Estado de producto inválido");
  }

  await db.$transaction(async (tx) => {
    const existing = await tx.product.findUnique({ where: { id: productId } });
    if (!existing) throw new ProductNotFoundError();
    if (existing.sellerId !== userId) throw new ProductOwnershipError();

    // R10: transiciones validadas (ARCHIVED solo se reactiva).
    if (parsed.data !== existing.status) {
      assertStatusTransition(existing.status, parsed.data);
    }

    await tx.product.update({
      where: { id: productId },
      data: { status: parsed.data, publishedAt: publishedAtFor(parsed.data, existing.publishedAt) },
    });
  });

  if (parsed.data === "ACTIVE") {
    await db.user.updateMany({
      where: { id: userId, role: { not: USER_ROLE.SELLER } },
      data: { role: USER_ROLE.SELLER },
    });
  }
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/** Elimina un producto del dueño (cascade de imágenes + borrado de archivos). */
export async function deleteProductRecord(userId: string, productId: string): Promise<void> {
  const images = await db.$transaction(async (tx) => {
    const existing = await tx.product.findUnique({
      where: { id: productId },
      select: { id: true, sellerId: true, images: { select: { key: true } } },
    });
    if (!existing) throw new ProductNotFoundError();
    if (existing.sellerId !== userId) throw new ProductOwnershipError();
    await tx.product.delete({ where: { id: productId } });
    return existing.images;
  });

  // Borrado de archivos best-effort: si el storage falla, el registro ya se eliminó.
  const storage = getImageStorage();
  await Promise.all(
    images.map((image) =>
      storage.delete(image.key).catch((err) => {
        console.warn(`[products/delete] no se pudo borrar ${image.key}:`, err);
      }),
    ),
  );
}

// ---------------------------------------------------------------------------
// Queries del dueño (/mis-publicaciones)
// ---------------------------------------------------------------------------

export type MyProductsStatusFilter = ProductStatus | "ALL";

export async function getMyProducts(
  userId: string,
  status: MyProductsStatusFilter = "ALL",
): Promise<Prisma.ProductGetPayload<{ include: typeof createResultInclude }>[]> {
  return db.product.findMany({
    where: {
      sellerId: userId,
      ...(status === "ALL" ? {} : { status }),
    },
    orderBy: [{ status: "asc" }, { publishedAt: "desc" }],
    include: createResultInclude,
  });
}

export async function getOwnedProductById(
  userId: string,
  productId: string,
): Promise<Prisma.ProductGetPayload<{ include: typeof createResultInclude }> | null> {
  const product = await db.product.findUnique({
    where: { id: productId },
    include: createResultInclude,
  });
  if (!product || product.sellerId !== userId) return null;
  return product;
}
