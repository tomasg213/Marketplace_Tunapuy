// Servicio de perfil de usuario (épica E3 — perfiles editables).
//
// `updateUserProfile` actualiza name/email/avatarUrl del usuario autenticado.
// Reglas:
//   - El email es opcional: `undefined` → NO se toca; `null` → se limpia.
//   - P2002 en email (único) → EmailConflictError (mensaje amigable, no 500).
//   - El TELÉFONO NO es editable (identificador de login OTP) y no aparece aquí.
//   - avatarUrl: política de imágenes aplicada AQUÍ (defensa en profundidad,
//     H1-SEC): `string` se valida con `assertUploadedImageUrl` ANTES de
//     persistir; `undefined` = no tocar; `null` = limpiar (sin validar). Un
//     fallo se traduce a `ImagePolicyError` con mensaje específico (la UI
//     muestra err.message, no `InvalidUploadedUrlError` crudo).
import { db, Prisma } from "@/server/db";
import { assertUploadedImageUrl } from "@/server/images/validate-upload-url";
import { ImagePolicyError } from "@/server/images/image-policy-error";
import {
  updateUserProfileSchema,
  type UpdateUserProfileInput,
} from "@/server/users/validators";

export { ImagePolicyError } from "@/server/images/image-policy-error";

export class UserProfileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserProfileValidationError";
  }
}

export class EmailConflictError extends Error {
  constructor(message = "Ese email ya está en uso por otra cuenta") {
    super(message);
    this.name = "EmailConflictError";
  }
}

export interface UpdatedUserProfile {
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
}

/** Actualiza el perfil del usuario autenticado (PATCH-like). */
export async function updateUserProfile(
  userId: string,
  input: UpdateUserProfileInput,
): Promise<UpdatedUserProfile> {
  const parsed = updateUserProfileSchema.safeParse(input);
  if (!parsed.success) {
    throw new UserProfileValidationError(
      parsed.error.issues[0]?.message ?? "Datos de perfil inválidos",
    );
  }
  const data = parsed.data;

  // Defensa en profundidad (H1-SEC): la política de imágenes vive en el
  // servicio, no en la capa de acción. Solo se valida si es string
  // (undefined = no tocar; null = limpiar). Mensaje específico para la UI.
  if (data.avatarUrl !== undefined && data.avatarUrl !== null) {
    try {
      assertUploadedImageUrl(data.avatarUrl, "users");
    } catch (err) {
      throw new ImagePolicyError((err as Error).message);
    }
  }

  try {
    return await db.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        // undefined → no tocar el email; null → limpiarlo.
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
      },
      select: { id: true, name: true, email: true, avatarUrl: true },
    });
  } catch (err) {
    // P2002: colisión de email único → conflicto controlado (409 en UI).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new EmailConflictError();
    }
    throw err;
  }
}
