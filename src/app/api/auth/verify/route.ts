// POST /api/auth/verify — verifica el código OTP y abre sesión (Épica E2).
//
// Dictamen security E2:
//   R2: consumo único del código + find-or-create + creación de sesión ocurren
//       en la MISMA transacción (auth.service.verifyOtp).
//   R4: la sesión es OPACA (token aleatorio en cookie httpOnly; en BD solo su
//       sha256). La cookie se fija aquí con `__Host-` (prod, secure) y
//       `SESSION_COOKIE_SECURE=false` (dev/e2e sobre http).
//   R5: CSRF (assertSafeOrigin) antes de mutar.
//   R6: errores de verificación → 401 genérico (no enumerar); solo el rate
//       limit responde 429 con Retry-After.
import { NextResponse } from "next/server";
import { OtpVerifyError, verifyOtp } from "@/server/auth/auth.service";
import { sessionCookieName, sessionCookieOptions } from "@/server/auth/session-cookie";
import { assertSafeOrigin } from "@/server/csrf";
import { getClientIp, jsonResponse } from "@/server/http";

export const dynamic = "force-dynamic";

/** `redirectTo` solo admite rutas internas (protección contra open redirect). */
function safeRedirectTo(value: unknown): string {
  if (typeof value !== "string") return "/mis-publicaciones";
  if (!value.startsWith("/") || value.startsWith("//")) return "/mis-publicaciones";
  return value;
}

export async function POST(request: Request): Promise<Response> {
  assertSafeOrigin(request);

  let body: { phoneNumber?: unknown; code?: unknown; redirectTo?: unknown } = {};
  try {
    body = (await request.json()) as {
      phoneNumber?: unknown;
      code?: unknown;
      redirectTo?: unknown;
    };
  } catch {
    return jsonResponse({ error: "JSON inválido" }, { status: 400 });
  }

  const { phoneNumber, code, redirectTo } = body;
  if (typeof phoneNumber !== "string" || typeof code !== "string") {
    return jsonResponse({ error: "phoneNumber y code son requeridos" }, { status: 400 });
  }

  try {
    const result = await verifyOtp({ phoneNumber, code, ip: getClientIp(request) });

    const response = NextResponse.json(
      {
        ok: true,
        user: result.user,
        redirectTo: safeRedirectTo(redirectTo),
      },
      { status: 200 },
    );
    // R4: cookie de sesión opaca (httpOnly; Secure solo en prod).
    response.cookies.set(sessionCookieName(), result.session.token, sessionCookieOptions());
    return response;
  } catch (err) {
    if (err instanceof OtpVerifyError) {
      if (err.kind === "rate_limited") {
        // 429 + Retry-After (bloqueo 30 min, R1).
        const response = jsonResponse({ error: "Demasiados intentos. Intenta más tarde" }, { status: 429 });
        response.headers.set("Retry-After", String(err.retryAfterSeconds ?? 1800));
        return response;
      }
      // R6: mismo 401 genérico para código inválido/vencido/usado/agotado.
      return jsonResponse({ error: "Código inválido o expirado" }, { status: 401 });
    }
    // R7: log anónimo, error genérico (nunca el teléfono ni el código).
    console.error("[auth/verify] error inesperado:", err);
    return jsonResponse({ error: "Error interno" }, { status: 500 });
  }
}
