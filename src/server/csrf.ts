// Protección CSRF para route handlers (dictamen security E2 — R5).
//
// Los route handlers de la API (`src/app/api/**/route.ts`) NO ejecutan el
// preflight de SameSite de las server actions; por eso TODO route mutante
// (POST/PUT/PATCH/DELETE) debe validar el origen con `assertSafeOrigin`.
//
// Estrategia doble:
//   1. `Sec-Fetch-Site: same-origin | none` (o ausente) → válido. Un
//      navegador cross-site envía `cross-site` (los bots/curl no envían el
//      header: se acepta por compatibilidad con scripts e2e).
//   2. Origen explícito (`Origin`/`Referer`) contra la allowlist
//      (APP_URL y derivados de PREVIEW_URL / VERCEL_URL). La cookie httpOnly
//      no llega a navegadores con doble envío: un atacante forzando
//      `fetch(..., {credentials: 'include'})` desde su origen envía
//      `Sec-Fetch-Site: cross-site` → rechazado.
import { env } from "@/server/env";

export class CsrfError extends Error {
  constructor(message = "origin_forbidden") {
    super(message);
    this.name = "CsrfError";
  }
}

/** Orígenes permitidos: APP_URL + VERCEL_URL (deploy previews) si existen. */
export function allowedOrigins(): string[] {
  const urls = [env.APP_URL, process.env.PREVIEW_URL, process.env.VERCEL_URL]
    .filter(Boolean)
    .map((u) => u!.trim())
    .map((u) => (u.startsWith("http") ? u : `https://${u}`))
    .map((u) => new URL(u).origin);
  return [...new Set(urls)];
}

function isAllowedOrigin(origin: string): boolean {
  try {
    return allowedOrigins().includes(new URL(origin).origin);
  } catch {
    return false;
  }
}

/**
 * Valida el origen de un request mutante. Lanza `CsrfError` (403) si un
 * navegador indica explícitamente cross-site o el Origin/Referer no es
 * confiable. Server-only.
 */
export function assertSafeOrigin(request: Request): void {
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite === "same-origin" || secFetchSite === "none") return;
  if (secFetchSite === "cross-site") throw new CsrfError();

  // Bots/curl no envían Sec-Fetch-Site: fallback al Origin/Referer si vienen.
  const origin = request.headers.get("origin");
  if (origin && !isAllowedOrigin(origin)) throw new CsrfError();

  const referer = request.headers.get("referer");
  if (!origin && referer) {
    try {
      const refOrigin = new URL(referer).origin;
      if (!isAllowedOrigin(refOrigin)) throw new CsrfError();
    } catch {
      throw new CsrfError();
    }
  }
}
