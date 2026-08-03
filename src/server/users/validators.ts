// Validadores del perfil de usuario (épica E3 — perfiles editables).
//
// Reglas:
//   - name: obligatorio, 2–120 caracteres.
//   - email: OPCIONAL y nullish (null → quitar email; undefined → no tocar);
//     se trimea antes de validar (`" a@b.com "` → `a@b.com`), máx. 254.
//   - avatarUrl: SOLO URLs de NUESTRO upload `/uploads/users/...` (política de
//     seguridad E2/E3). La política se aplica en el SERVICIO
//     (`users/profile-service.ts` → `assertUploadedImageUrl`), no en la capa de
//     acción: undefined = no tocar, null = limpiar, string = solo uploads
//     propios. Aquí el zod solo valida formato/longitud, hasta 500 caracteres.
//   - El TELÉFONO NO es editable: es el identificador de login OTP.
import { z } from "zod";

/** Esquema de edición del perfil del usuario autenticado (PATCH-like). */
export const updateUserProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(120, "El nombre no puede superar 120 caracteres"),
  email: z
    .string()
    .trim()
    .email("Email inválido")
    .max(254, "El email no puede superar 254 caracteres")
    .nullish(),
  avatarUrl: z
    .string()
    .trim()
    .max(500, "La URL del avatar no puede superar 500 caracteres")
    .nullable()
    .optional(),
});

export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;
