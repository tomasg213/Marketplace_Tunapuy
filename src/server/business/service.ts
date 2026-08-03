// Servicio de negocios (Épica E2/E3): capa de negocio compartida por las
// server actions (`business/actions.ts`) y, en el futuro, route handlers.
//
// Reglas:
//   - Un negocio por cuenta: Business.ownerId es @unique.
//   - El slug es una PERMALINKA estable: solo se genera en `create` (o se usa el
//     explícito). En `update`, renombrar NO regenera el slug.
//   - Ownership: solo el dueño (ownerId === userId) puede editar.
//   - `updateBusiness` traduce P2002 (slug único) → BusinessSlugConflictError.
//   - logoUrl: política de imágenes aplicada EN EL SERVICIO (defensa en
//     profundidad, H1-SEC): `string` se valida con `assertUploadedImageUrl`
//     ANTES de persistir; `undefined` = no tocar; `null` = limpiar (sin
//     validar). Un fallo → `ImagePolicyError` con mensaje específico.
import { db, Prisma } from "@/server/db";
import { slugify, uniqueSlug } from "@/lib/slug";
import { assertUploadedImageUrl } from "@/server/images/validate-upload-url";
import { ImagePolicyError } from "@/server/images/image-policy-error";
import {
  createBusinessSchema,
  updateBusinessSchema,
  type CreateBusinessInput,
  type UpdateBusinessInput,
} from "@/server/business/validators";

export { ImagePolicyError } from "@/server/images/image-policy-error";

// ---------------------------------------------------------------------------
// Errores controlados
// ---------------------------------------------------------------------------

export class BusinessValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BusinessValidationError";
  }
}

export class BusinessNotFoundError extends Error {
  constructor(message = "Negocio no encontrado") {
    super(message);
    this.name = "BusinessNotFoundError";
  }
}

export class BusinessOwnershipError extends Error {
  constructor(message = "No eres dueño de este negocio") {
    super(message);
    this.name = "BusinessOwnershipError";
  }
}

export class BusinessSlugConflictError extends Error {
  constructor(message = "El slug del negocio ya está en uso") {
    super(message);
    this.name = "BusinessSlugConflictError";
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Slug único para el negocio (dedupe contra slugs existentes). */
export async function uniqueBusinessSlug(
  tx: Prisma.TransactionClient | typeof db,
  name: string,
  explicitSlug?: string,
): Promise<string> {
  if (explicitSlug) return explicitSlug;
  const base = slugify(name);
  const existing = await tx.business.findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true },
  });
  return uniqueSlug(name, existing.map((b) => b.slug));
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export interface BusinessResult {
  id: string;
  slug: string;
}

/** Crea el negocio del usuario (un negocio por cuenta). Recibe el userId del
 *  caller autenticado; NO hace auth (la hace la capa de acción). */
export async function createBusiness(
  userId: string,
  input: CreateBusinessInput,
): Promise<BusinessResult> {
  const parsed = createBusinessSchema.safeParse(input);
  if (!parsed.success) {
    throw new BusinessValidationError(
      parsed.error.issues[0]?.message ?? "Datos del negocio inválidos",
    );
  }

  try {
    const business = await db.$transaction(async (tx) => {
      const existing = await tx.business.findUnique({ where: { ownerId: userId } });
      if (existing) {
        throw new BusinessValidationError("Ya tienes un negocio creado");
      }
      const slug = await uniqueBusinessSlug(tx, parsed.data.name, parsed.data.slug);
      return tx.business.create({
        data: {
          slug,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          phoneNumber: parsed.data.phoneNumber,
          ownerId: userId,
        },
      });
    });

    return { id: business.id, slug: business.slug };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new BusinessSlugConflictError();
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/**
 * Edita el negocio del usuario autenticado (PATCH-like). El negocio se resuelve
 * por `ownerId` (Business.ownerId es @unique → un negocio por cuenta). Reglas
 * de la épica E3:
 *   - El slug NO se regenera al renombrar (permalinga estable). Solo cambia si
 *     el cliente lo envía explícitamente.
 *   - Si se envía un slug explícito, se valida que no esté tomado por OTRO
 *     negocio (chequeo previo + P2002 como red de seguridad).
 */
export async function updateBusiness(
  userId: string,
  input: UpdateBusinessInput,
): Promise<BusinessResult> {
  const parsed = updateBusinessSchema.safeParse(input);
  if (!parsed.success) {
    throw new BusinessValidationError(
      parsed.error.issues[0]?.message ?? "Datos del negocio inválidos",
    );
  }
  const data = parsed.data;

  // Defensa en profundidad (H1-SEC): política de imágenes en el servicio, no en
  // la capa de acción. Solo se valida si es string (undefined = no tocar;
  // null = limpiar). Mensaje específico para la UI.
  if (data.logoUrl !== undefined && data.logoUrl !== null) {
    try {
      assertUploadedImageUrl(data.logoUrl, "businesses");
    } catch (err) {
      throw new ImagePolicyError((err as Error).message);
    }
  }

  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.business.findUnique({ where: { ownerId: userId } });
      if (!existing) throw new BusinessNotFoundError();
      if (existing.ownerId !== userId) throw new BusinessOwnershipError();

      // Slug explícito: comprobar disponibilidad contra OTROS negocios.
      if (data.slug !== undefined && data.slug !== existing.slug) {
        const taken = await tx.business.findUnique({ where: { slug: data.slug } });
        if (taken && taken.id !== existing.id) {
          throw new BusinessSlugConflictError("El slug del negocio ya está en uso. Prueba otro");
        }
      }

      const updated = await tx.business.update({
        where: { id: existing.id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.slug !== undefined ? { slug: data.slug } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.phoneNumber !== undefined ? { phoneNumber: data.phoneNumber } : {}),
          ...(data.logoUrl !== undefined ? { logoUrl: data.logoUrl } : {}),
        },
      });

      return { id: updated.id, slug: updated.slug };
    });
  } catch (err) {
    // P2002: colisión de slug único (carrera) → 409, no 500.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new BusinessSlugConflictError("El slug del negocio ya está en uso. Prueba otro");
    }
    throw err;
  }
}
