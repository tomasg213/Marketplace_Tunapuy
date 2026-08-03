// Helpers HTTP compartidos por los route handlers de la API.
// (capa adaptadora: HTTP ↔ servicios de dominio)
import { NextResponse } from "next/server";

/** IP del cliente desde proxies: x-forwarded-for (primera) → x-real-ip. */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = request.headers.get("x-real-ip");
  return realIp ?? "unknown";
}

/** Lee una cookie del header `Cookie` (el `Request` estándar no tiene `.cookies`). */
export function getCookieFromRequest(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

/** Respuesta JSON tipada (inferencia limpia para Next 16). */
export function jsonResponse<TBody>(
  body: TBody,
  init?: ResponseInit,
): NextResponse<TBody> {
  return NextResponse.json(body, init);
}
