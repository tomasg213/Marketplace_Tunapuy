// Middleware de rutas privadas (Épica E2, dictamen security R4).
//
// Guard de UX a nivel de edge para /vender, /mis-publicaciones y /cuenta: si
// no hay cookie de sesión (token opaco) → redirect a /login?next=<ruta>.
//
// Decisión de arquitectura: el middleware corre en el Edge runtime y NO puede
// consultar la BD, así que NO es una frontera de seguridad (solo UX). La
// verificación real (validez, expiración, revocación, renovación deslizante)
// vive en `requireAuth()` / `getCurrentUser()` de `src/server/auth/session.ts`,
// que las páginas y server actions vuelven a ejecutar (defensa en profundidad).
import { NextRequest, NextResponse } from "next/server";
import { sessionCookieName } from "@/server/auth/session-cookie";

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  const token = request.cookies.get(sessionCookieName())?.value;
  if (token) return NextResponse.next();

  // Redirige a /login conservando el destino original (deep-link tras login).
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/vender/:path*", "/mis-publicaciones/:path*", "/cuenta/:path*"],
};
