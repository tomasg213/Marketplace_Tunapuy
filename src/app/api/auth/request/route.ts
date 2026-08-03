// POST /api/auth/request — solicita un código OTP por teléfono (Épica E2).
//
// Dictamen security E2:
//   R5: todo route mutante valida origen con `assertSafeOrigin` (CSRF).
//   R6: responde SIEMPRE 200 genérico con la MISMA forma (ok:true), esté el
//       número registrado o no, haya rate limit o falle el envío: no revela
//       existencia de cuentas ni permite enumerar. El teléfono VE (+58 / 11
//       dígitos) se valida ANTES en el servicio (anti sms-bombing).
//   R7: errores genéricos en el response; nunca se loguea el teléfono.
import { OtpRequestError, requestOtp } from "@/server/auth/auth.service";
import { assertSafeOrigin } from "@/server/csrf";
import { getClientIp, jsonResponse } from "@/server/http";

export const dynamic = "force-dynamic";

/** Respuesta genérica: idéntica para éxito, rate limit o envío fallido (R6). */
const GENERIC_OK = { ok: true, expiresInSeconds: 300, devCode: null } as const;

export async function POST(request: Request): Promise<Response> {
  assertSafeOrigin(request);

  let body: { phoneNumber?: unknown } = {};
  try {
    body = (await request.json()) as { phoneNumber?: unknown };
  } catch {
    // Body malformado → misma respuesta genérica (no revelar nada).
    return jsonResponse(GENERIC_OK, { status: 200 });
  }

  const { phoneNumber } = body;
  if (typeof phoneNumber !== "string") {
    return jsonResponse(GENERIC_OK, { status: 200 });
  }

  try {
    const result = await requestOtp({ phoneNumber, ip: getClientIp(request) });
    return jsonResponse(result, { status: 200 });
  } catch (err) {
    if (err instanceof OtpRequestError) {
      // invalid_phone / rate_limited / send_failed → 200 genérico (R6).
      return jsonResponse(GENERIC_OK, { status: 200 });
    }
    // Inesperado (R7): log anónimo, respuesta genérica.
    console.error("[auth/request] error inesperado:", err);
    return jsonResponse(GENERIC_OK, { status: 200 });
  }
}
