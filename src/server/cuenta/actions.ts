// Server actions de cuenta (épica "Perfiles editables") — capa FINA "use server"
// sobre los servicios `users/profile-service.ts` y `business/service.ts`.
// El cliente las importa desde `@/server/cuenta/actions` (contrato de
// `src/app/cuenta/cuenta-settings.tsx`): aquí solo auth + traducción de errores.
//
// Seguridad:
//   - requireAuth() en ambas (sin sesión → redirect /login).
//   - El teléfono del usuario es SOLO LECTURA (login OTP): no se acepta aquí.
//   - avatarUrl / logoUrl: la política de imágenes (solo uploads propios
//     `/uploads/<folder>/`; nada de javascript:, data: o externos) se aplica EN
//     EL SERVICIO (defensa en profundidad, H1-SEC). La acción solo traduce
//     `ImagePolicyError` → { ok: false, error: err.message } (mensaje
//     específico, p.ej. "La imagen debe apuntar a /uploads/users/").
//     undefined = no tocar; null = LIMPIAR (se persiste null SIN error).
//   - Ownership del negocio: `updateBusiness` (servicio) resuelve por ownerId
//     (Business.ownerId @unique) y lanza BusinessOwnershipError si no coincide.
"use server";

import { redirect } from "next/navigation";
import { AuthenticationError, requireAuth } from "@/server/auth/session";
import {
  BusinessNotFoundError,
  BusinessOwnershipError,
  BusinessSlugConflictError,
  BusinessValidationError,
  updateBusiness,
} from "@/server/business/service";
import type { UpdateBusinessInput } from "@/server/business/validators";
import {
  EmailConflictError,
  ImagePolicyError,
  UserProfileValidationError,
  updateUserProfile,
} from "@/server/users/profile-service";
import type { UpdateUserProfileInput } from "@/server/users/validators";

export type CuentaActionResult = { ok: true } | { ok: false; error: string };

async function authedUserId(): Promise<string> {
  try {
    return await requireAuth();
  } catch (err) {
    if (err instanceof AuthenticationError) redirect("/login");
    throw err;
  }
}

/** Email "" → null (la UI ya lo convierte; se mantiene por robustez). */
function normalizeEmail(email: string | null | undefined): string | null | undefined {
  return typeof email === "string" && email.trim() === "" ? null : email;
}

/** Actualiza los datos personales del usuario autenticado. */
export async function updateUserProfileAction(
  input: UpdateUserProfileInput,
): Promise<CuentaActionResult> {
  const userId = await authedUserId();

  try {
    await updateUserProfile(userId, {
      ...input,
      email: normalizeEmail(input.email),
    });
    return { ok: true };
  } catch (err) {
    if (
      err instanceof UserProfileValidationError ||
      err instanceof EmailConflictError ||
      err instanceof ImagePolicyError
    ) {
      return { ok: false, error: err.message };
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

  try {
    await updateBusiness(userId, input);
    return { ok: true };
  } catch (err) {
    if (
      err instanceof BusinessValidationError ||
      err instanceof BusinessNotFoundError ||
      err instanceof BusinessOwnershipError ||
      err instanceof BusinessSlugConflictError ||
      err instanceof ImagePolicyError
    ) {
      return { ok: false, error: err.message };
    }
    console.error("[cuenta/update-business] error inesperado:", err);
    return { ok: false, error: "No se pudo actualizar el negocio" };
  }
}
