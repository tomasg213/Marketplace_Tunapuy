// Server actions de cuenta (épica "Perfiles editables") — creadas por el
// backend; el cliente las importa desde `@/server/cuenta/actions` (contrato de
// `src/app/cuenta/cuenta-settings.tsx`).
//
// Seguridad:
//   - requireAuth() en ambas (sin sesión → redirect /login).
//   - El teléfono del usuario es SOLO LECTURA (login OTP): no se acepta aquí.
//   - avatarUrl / logoUrl solo aceptan URLs de NUSTRO storage (`/uploads/<folder>/`,
//     validado por `assertUploadedImageUrl`): nada de javascript:, data: o externos.
//   - Ownership del negocio: `updateBusinessAction` actúa únicamente sobre el
//     negocio cuyo `ownerId` es el usuario autenticado (Business.ownerId @unique).
"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { AuthenticationError, requireAuth } from "@/server/auth/session";
import { db, Prisma } from "@/server/db";
import { assertUploadedImageUrl } from "@/server/images/validate-upload-url";
import { e164PhoneSchema } from "@/server/validators";

export type CuentaActionResult = { ok: true } | { ok: false; error: string };

async function authedUserId(): Promise<string> {
  try {
    return await requireAuth();
  } catch (err) {
    if (err instanceof AuthenticationError) redirect("/login");
    throw err;
  }
}

/** Email opcional: "" y null → null; si viene, debe ser un email válido. */
const nullableEmailSchema = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z.union([
    z.string().trim().max(200, "El email no puede superar 200 caracteres").email("Email inválido"),
    z.null(),
  ]),
);

/**
 * URL de imagen subida: undefined = no tocar, null = limpiar, string = validar
 * contra el storage (`/uploads/<folder>/`) y guardar.
 */
function optionalUploadedUrl(folder: "users" | "businesses") {
  return z
    .string()
    .optional()
    .nullable()
    .refine(
      (v) => v === undefined || v === null || (() => { try { assertUploadedImageUrl(v, folder); return true; } catch { return false; } })(),
      "La imagen debe haber sido subida a este sitio (carpeta " + folder + ")",
    );
}

const updateUserProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(120, "El nombre no puede superar 120 caracteres"),
  email: nullableEmailSchema,
  avatarUrl: optionalUploadedUrl("users"),
});
type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;

const updateBusinessSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(120, "El nombre no puede superar 120 caracteres"),
  description: z
    .string()
    .trim()
    .max(1_000, "La descripción no puede superar 1000 caracteres")
    .optional()
    .nullable(),
  phoneNumber: e164PhoneSchema.optional().nullable(),
  logoUrl: optionalUploadedUrl("businesses"),
});
type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;

/** Actualiza los datos personales del usuario autenticado. */
export async function updateUserProfileAction(
  input: UpdateUserProfileInput,
): Promise<CuentaActionResult> {
  const userId = await authedUserId();

  const parsed = updateUserProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const { name, email, avatarUrl } = parsed.data;

  try {
    if (avatarUrl !== undefined) {
      assertUploadedImageUrl(avatarUrl ?? "", "users"); // null → limpiar.
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "URL de imagen inválida" };
  }

  try {
    await db.user.update({
      where: { id: userId },
      data: {
        name,
        email,
        ...(avatarUrl !== undefined ? { avatarUrl } : {}),
      },
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "El email ya está en uso por otra cuenta" };
    }
    console.error("[cuenta/update-user] error inesperado:", err);
    return { ok: false, error: "No se pudo actualizar el perfil" };
  }
}

/** Actualiza el negocio del usuario autenticado (solo el suyo; ownerId @unique). */
export async function updateBusinessAction(
  input: UpdateBusinessInput,
): Promise<CuentaActionResult> {
  const userId = await authedUserId();

  const parsed = updateBusinessSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const { name, description, phoneNumber, logoUrl } = parsed.data;

  try {
    if (logoUrl !== undefined) {
      assertUploadedImageUrl(logoUrl ?? "", "businesses"); // null → limpiar.
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "URL de imagen inválida" };
  }

  try {
    const business = await db.business.findUnique({ where: { ownerId: userId } });
    if (!business) {
      return { ok: false, error: "No tienes un negocio creado" };
    }
    await db.business.update({
      where: { id: business.id },
      data: {
        name,
        description: description ?? null,
        phoneNumber: phoneNumber ?? null,
        ...(logoUrl !== undefined ? { logoUrl } : {}),
      },
    });
    return { ok: true };
  } catch (err) {
    console.error("[cuenta/update-business] error inesperado:", err);
    return { ok: false, error: "No se pudo actualizar el negocio" };
  }
}
