// Sesión HTTP opaca en BD (dictamen security E2 — R4).
//
// - `createSession(userId)` / `createSessionRecord(tx, userId)` (transaccional
//   para R2: consumedAt + sesión en la MISMA transacción): crea la fila
//   `Session` con el sha256 del token aleatorio y devuelve el token en claro
//   (solo viaja en la cookie httpOnly).
// - `getSession()` resuelve el token de la cookie (request o next/headers),
//   valida expiración/revocación y aplica RENOVACIÓN DESLIZANTE (extiende
//   `expiresAt` a +30 días cuando queda < mitad del TTL).
// - `revokeSession(token)` marca `revokedAt` (logout / revocación puntual).
// - `requireAuth()` / `requireReauth()`: guards para rutas y server actions.
//   `requireReauth()` exige que la sesión se haya verificado hace menos de
//   `REAUTH_MAX_AGE_SECONDS` (acciones sensibles: publicar, cambiar teléfono).
//
// La cookie la fija cada route handler en la Response (`Set-Cookie`) o la capa
// de páginas con `cookies()`; aquí solo se calculan nombre/opciones (edge-safe).
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { hashSessionToken } from "@/server/auth/session-token";
import { getCookieFromRequest } from "@/server/http";
import {
  SESSION_TTL_SECONDS,
  sessionCookieName,
  sessionCookieOptions,
} from "@/server/auth/session-cookie";
import { createSessionRecord } from "@/server/auth/session-record";

export { createSessionRecord } from "@/server/auth/session-record";
export type { CreatedSession } from "@/server/auth/session-record";

/** Error controlado: no hay sesión válida (route handlers → 401). */
export class AuthenticationError extends Error {
  constructor(message = "No autenticado") {
    super(message);
    this.name = "AuthenticationError";
  }
}

/** Error controlado: sesión válida pero antigua → re-autenticación (R4). */
export class ReauthenticationRequiredError extends Error {
  constructor(message = "Re-autenticación requerida") {
    super(message);
    this.name = "ReauthenticationRequiredError";
  }
}

/** Ventana de frescura de una sesión para acciones sensibles (10 minutos). */
export const REAUTH_MAX_AGE_SECONDS = 10 * 60;

export interface SessionInfo {
  userId: string;
  sessionId: string;
  lastVerifiedAt: Date;
}

// ---------------------------------------------------------------------------
// Tokens y cookies
// ---------------------------------------------------------------------------

/** Token de la cookie de sesión, desde un Request o desde next/headers. */
export async function getSessionToken(source?: { request?: Request }): Promise<string | null> {
  if (source?.request) {
    return getCookieFromRequest(source.request, sessionCookieName());
  }
  const store = await cookies();
  return store.get(sessionCookieName())?.value ?? null;
}

// ---------------------------------------------------------------------------
// Creación
// ---------------------------------------------------------------------------

/** Crea una sesión (transacción propia). Devuelve el token en claro. */
export function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  return db.$transaction((tx) => createSessionRecord(tx, userId));
}

// ---------------------------------------------------------------------------
// Lectura / renovación deslizante
// ---------------------------------------------------------------------------

/** Resuelve una sesión por token: válida si no está revocada ni vencida. */
export async function getSessionFromToken(token: string | null): Promise<SessionInfo | null> {
  if (!token) return null;
  const row = await db.session.findUnique({ where: { tokenHash: hashSessionToken(token) } });
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;

  // Renovación deslizante: si queda < mitad del TTL, extiende a +30 días.
  const now = new Date();
  if (row.expiresAt.getTime() - now.getTime() < (SESSION_TTL_SECONDS * 1000) / 2) {
    await db.session.update({
      where: { id: row.id },
      data: { expiresAt: new Date(now.getTime() + SESSION_TTL_SECONDS * 1000), lastUsedAt: now },
    });
  }

  return {
    userId: row.userId,
    sessionId: row.id,
    lastVerifiedAt: row.lastVerifiedAt,
  };
}

/** Sesión actual (cookie del request o de next/headers). Nunca lanza. */
export async function getSession(source?: { request?: Request }): Promise<SessionInfo | null> {
  const token = await getSessionToken(source);
  return getSessionFromToken(token);
}

// ---------------------------------------------------------------------------
// Revocación / cierre
// ---------------------------------------------------------------------------

/** Revoca una sesión puntual (logout). Idempotente. */
export async function revokeSession(token: string): Promise<void> {
  await db.session.updateMany({
    where: { tokenHash: hashSessionToken(token) },
    data: { revokedAt: new Date() },
  });
}

/**
 * Cierra la sesión actual: revoca la fila en BD. La cookie la borra la capa
 * de HTTP (route handler con `response.cookies.set(..., { maxAge: 0 })`); si
 * no hay `request` (server action/página), se borra con `cookies()`.
 */
export async function destroySession(source?: { request?: Request }): Promise<void> {
  const token = await getSessionToken(source);
  if (token) await revokeSession(token);
  if (!source?.request) {
    const store = await cookies();
    store.set(sessionCookieName(), "", { ...sessionCookieOptions(), maxAge: 0 });
  }
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/** Devuelve el userId o lanza AuthenticationError (401/redirect /login). */
export async function requireAuth(source?: { request?: Request }): Promise<string> {
  const session = await getSession(source);
  if (!session) throw new AuthenticationError();
  return session.userId;
}

/** Acciones sensibles: sesión válida Y verificada hace menos de 10 minutos. */
export async function requireReauth(source?: { request?: Request }): Promise<string> {
  const session = await getSession(source);
  if (!session) throw new AuthenticationError();
  const ageMs = Date.now() - new Date(session.lastVerifiedAt).getTime();
  if (ageMs > REAUTH_MAX_AGE_SECONDS * 1000) {
    throw new ReauthenticationRequiredError();
  }
  return session.userId;
}

// ---------------------------------------------------------------------------
// Usuario actual
// ---------------------------------------------------------------------------

/** Campos públicos del usuario que sí pueden exponerse vía API/UI. */
export interface PublicUser {
  id: string;
  name: string;
  phoneNumber: string;
  role: string;
  slug: string;
  businessId: string | null;
  avatarUrl: string | null;
}

/** Carga el usuario autenticado con solo campos públicos (minimización PII). */
export async function getCurrentUser(source?: { request?: Request }): Promise<PublicUser | null> {
  const session = await getSession(source);
  if (!session) return null;

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      role: true,
      slug: true,
      avatarUrl: true,
      business: { select: { id: true } },
    },
  });
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    phoneNumber: user.phoneNumber,
    role: user.role,
    slug: user.slug,
    businessId: user.business?.id ?? null,
    avatarUrl: user.avatarUrl,
  };
}
