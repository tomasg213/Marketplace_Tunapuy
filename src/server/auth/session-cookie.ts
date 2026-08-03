// Atributos de la cookie de sesión (dictamen security E2 — R4).
//
// Edge-safe: este módulo NO importa node:crypto ni Prisma, así el middleware
// (Edge runtime) puede leer el nombre de la cookie sin arrastrar dependencias
// de servidor. La generación/verificación del token vive en `session-token.ts`.
//
// Cookie: httpOnly, secure en producción, sameSite=Lax, path=/, maxAge 30 días
// y prefijo `__Host-` (RFC 6265bis: exige Secure, sin Domain y Path=/). El
// prefijo se usa solo cuando la cookie es Secure: en dev/e2e sobre http
// (SESSION_COOKIE_SECURE=false) el prefijo __Host- es inválido (requiere
// Secure), así que se usa el nombre base.
export const SESSION_COOKIE_BASE = "tunapuy_session";
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 días

/** ¿La cookie lleva el flag Secure? (prod por defecto; SESSION_COOKIE_SECURE fuerza). */
export function isSessionCookieSecure(): boolean {
  return process.env.SESSION_COOKIE_SECURE === undefined
    ? process.env.NODE_ENV === "production"
    : process.env.SESSION_COOKIE_SECURE === "true";
}

/** Nombre de la cookie: `__Host-tunapuy_session` cuando es Secure, si no base. */
export function sessionCookieName(): string {
  return isSessionCookieSecure() ? `__Host-${SESSION_COOKIE_BASE}` : SESSION_COOKIE_BASE;
}

export interface SessionCookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
}

/** Opciones de la cookie (para `response.cookies.set` y `cookies().set`). */
export function sessionCookieOptions(): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: isSessionCookieSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}
