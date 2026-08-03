// Servicio + server action de negocios (Épica E2).
//
// `createBusiness` crea el negocio del usuario autenticado (ownerId = userId).
// Business.ownerId es @unique → un solo negocio por cuenta (la UI del designer
// lo expone como "Mi negocio"). Después, el producto puede asignar businessId
// si el usuario es dueño (validado en products/service.ts).
"use server";

import { redirect } from "next/navigation";
import { AuthenticationError, requireAuth } from "@/server/auth/session";
import { db, Prisma } from "@/server/db";
import { slugify, uniqueSlug } from "@/lib/slug";
import {
  createBusinessSchema,
  type CreateBusinessInput,
} from "@/server/business/validators";

// No exportar clases desde un archivo "use server": Turbopack exige que todo
// lo exportado sea una función async (las clases solo se usan internamente).
class BusinessValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BusinessValidationError";
  }
}

export type BusinessActionResult =
  | { ok: true; id: string; slug: string }
  | { ok: false; error: string };

async function authedUserId(): Promise<string> {
  try {
    return await requireAuth();
  } catch (err) {
    if (err instanceof AuthenticationError) redirect("/login");
    throw err;
  }
}

/** Slug único para el negocio (dedupe contra slugs existentes). */
async function uniqueBusinessSlug(name: string, explicitSlug?: string): Promise<string> {
  if (explicitSlug) return explicitSlug;
  const base = slugify(name);
  const existing = await db.business.findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true },
  });
  return uniqueSlug(name, existing.map((b) => b.slug));
}

/** Crea el negocio del usuario autenticado (un negocio por cuenta). */
export async function createBusiness(input: CreateBusinessInput): Promise<BusinessActionResult> {
  const userId = await authedUserId();

  const parsed = createBusinessSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos del negocio inválidos",
    };
  }

  try {
    const business = await db.$transaction(async (tx) => {
      const existing = await tx.business.findUnique({ where: { ownerId: userId } });
      if (existing) {
        throw new BusinessValidationError("Ya tienes un negocio creado");
      }
      const slug = await uniqueBusinessSlug(parsed.data.name, parsed.data.slug);
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

    return { ok: true, id: business.id, slug: business.slug };
  } catch (err) {
    if (err instanceof BusinessValidationError) return { ok: false, error: err.message };
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "El slug del negocio ya está en uso. Prueba otro" };
    }
    console.error("[business/create] error inesperado:", err);
    return { ok: false, error: "No se pudo crear el negocio" };
  }
}
