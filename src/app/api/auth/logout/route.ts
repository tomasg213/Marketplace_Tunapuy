// POST /api/auth/logout — destruye la sesión actual (Épica E2, R4/R5).
//
// R4: revoca la fila `Session` en BD y borra la cookie httpOnly.
// R5: CSRF (assertSafeOrigin) — es un route mutante.
import { NextResponse } from "next/server";
import { revokeSession } from "@/server/auth/session";
import { sessionCookieName, sessionCookieOptions } from "@/server/auth/session-cookie";
import { assertSafeOrigin } from "@/server/csrf";
import { getCookieFromRequest } from "@/server/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  assertSafeOrigin(request);

  const token = getCookieFromRequest(request, sessionCookieName());
  if (token) {
    await revokeSession(token); // marca revokedAt (idempotente)
  }

  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.cookies.set(sessionCookieName(), "", { ...sessionCookieOptions(), maxAge: 0 });
  return response;
}
