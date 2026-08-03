// Creación de la fila de sesión (dictamen security E2 — R4/R2).
//
// Módulo PURO (sin next/headers): solo Prisma + crypto, para poder llamarlo
// dentro de la MISMA transacción que consume el OTP (R2: consumedAt + sesión
// + find-or-create del usuario se confirman juntos o no se confirman).
import { Prisma } from "@/server/db";
import { hashSessionToken } from "@/server/auth/session-token";
import { generateSessionToken } from "@/server/auth/session-token";
import { SESSION_TTL_SECONDS } from "@/server/auth/session-cookie";

export interface CreatedSession {
  token: string;
  expiresAt: Date;
}

/**
 * Crea la fila `Session` (tokenHash = sha256 del token aleatorio de 32 B) y
 * devuelve el token en claro para la cookie httpOnly. Ejecutar SOLO dentro de
 * una transacción (`db.$transaction((tx) => createSessionRecord(tx, userId))`).
 */
export async function createSessionRecord(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<CreatedSession> {
  const token = generateSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
  await tx.session.create({
    data: {
      tokenHash: hashSessionToken(token),
      userId,
      expiresAt,
      lastUsedAt: now,
      lastVerifiedAt: now, // el login ES la verificación de identidad
    },
  });
  return { token, expiresAt };
}
