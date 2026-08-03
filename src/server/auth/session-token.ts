// Token de sesión opaco (dictamen security E2 — R4).
//
// A diferencia de un JWT (stateless), el token de sesión es un secreto
// aleatorio de 32 bytes (base64url) cuyo SHA-256 se guarda en la tabla
// `Session` (`tokenHash`). El token en claro solo viaja en la cookie httpOnly;
// una fuga de la BD no permite forjar sesiones (a diferencia de un JWT con
// clave robada, aquí además se puede revocar fila a fila).
//
// Este módulo es puro (crypto + env) y no toca la BD: la capa de sesión
// (`session.ts`) lo combina con Prisma y las cookies.

import { createHash, randomBytes } from "node:crypto";

/** Longitud del token aleatorio en bytes (32 bytes → 43 chars base64url). */
export const SESSION_TOKEN_BYTES = 32;

/** Genera un token de sesión aleatorio (base64url, sin relleno). */
export function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
}

/** Hash del token (sha256 hex) — lo que se persiste en `Session.tokenHash`. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
