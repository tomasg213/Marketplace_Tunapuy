// Servicio de autenticación OTP por teléfono (Épica E2) — lógica pura de
// servidor, sin Next.js (los route handlers solo adaptan HTTP ↔ servicio).
//
// Implementa el dictamen del security-reviewer E2:
//   R1  rate limit en BD (`AuthRateLimit`), SIEMPRE antes de generar/verificar.
//   R2  un solo código activo por teléfono (re-solicitar invalida el anterior),
//       TTL 5 min, máx 5 intentos, consumo único atómico en la MISMA
//       transacción que el find-or-create del usuario y la sesión.
//   R3  código hash = HMAC-SHA256(AUTH_SECRET, salt + code) (ver otp-utils).
//   R6  teléfono VE (+58 / 11 dígitos) validado ANTES de generar; el route
//       handler responde SIEMPRE 200 genérico (no enumeración de cuentas).
//   R7  nunca loguear códigos ni teléfonos; errores genéricos al cliente.
import { OTP_TYPE } from "@/lib/constants";
import { uniqueSlug } from "@/lib/slug";
import { db, Prisma } from "@/server/db";
import { getOtpProvider, isLocalMockDeployment, OtpProviderError } from "@/server/auth/otp-provider";
import {
  generateOtpCode,
  hasAttemptsLeft,
  hashOtpCode,
  isOtpExpired,
  OTP_DEFAULT_MAX_ATTEMPTS,
  otpExpiresAt,
  verifyOtpCode,
} from "@/server/auth/otp-utils";
import {
  assertRateLimit,
  RateLimitError,
  rateLimitKeys,
  setBlocked,
} from "@/server/auth/rate-limit-db";
import { createSessionRecord } from "@/server/auth/session-record";
import { normalizeVePhone } from "@/server/validators";

// ---------------------------------------------------------------------------
// Umbrales de rate limit (dictamen R1) — siempre ANTES de generar/verificar
// ---------------------------------------------------------------------------

const RATE = {
  request: {
    phonePerMinute: 1,
    phonePerHour: 5,
    phonePerDay: 10,
    ipPerHour: 10,
  },
  verify: {
    phonePerHour: 15,
    ipPerHour: 20,
  },
  blockMinutes: 30,
} as const;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * ¿Aplicamos el rate limit por IP? En despliegues local/mock se salta: sin
 * proxy headers el IP es "unknown" (bucket único compartido por TODO el
 * localhost) y 10 requests/h bloquean la IP 30 min → rompe dev/e2e. Los
 * buckets por teléfono (la defensa real contra abuso por número) siguen
 * activos. En producción (DATA_MODE=db + dominio público, detrás de proxy con
 * x-forwarded-for real) el rate limit por IP aplica completo (R1).
 */
function ipRateLimitEnabled(): boolean {
  return !isLocalMockDeployment();
}

// ---------------------------------------------------------------------------
// Errores controlados (el route mapea kind → respuesta HTTP)
// ---------------------------------------------------------------------------

export type OtpRequestErrorKind = "invalid_phone" | "rate_limited" | "send_failed";

export class OtpRequestError extends Error {
  constructor(
    public readonly kind: OtpRequestErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "OtpRequestError";
  }
}

export type OtpVerifyErrorKind =
  | "invalid_phone"
  | "invalid_code"
  | "expired"
  | "attempts_exhausted"
  | "consumed"
  | "rate_limited";

export class OtpVerifyError extends Error {
  constructor(
    public readonly kind: OtpVerifyErrorKind,
    message: string,
    options?: ErrorOptions & { retryAfterSeconds?: number },
  ) {
    super(message, options);
    this.name = "OtpVerifyError";
    this.retryAfterSeconds = options?.retryAfterSeconds;
  }

  /** Retry-After en segundos (solo rate_limited). */
  readonly retryAfterSeconds?: number;
}

// ---------------------------------------------------------------------------
// Request: pedir un código
// ---------------------------------------------------------------------------

export interface RequestOtpInput {
  phoneNumber: string;
  /** IP del cliente (rate limit por IP+teléfono). */
  ip: string;
}

export interface RequestOtpResult {
  /** Siempre true: respuesta genérica (R6). */
  ok: true;
  /** Segundos que el código permanecerá válido. */
  expiresInSeconds: number;
  /** True solo con OTP_PROVIDER=dev (UX de desarrollo; nunca en prod, R7). */
  devCode: string | null;
}

/**
 * Valida + rate limit (R1) + genera y envía el código (R2).
 * Cualquier fallo (rate limit, envío) lanza error controlado: el route handler
 * responde 200 genérico en todos los casos (no revela si el número existe).
 */
export async function requestOtp(input: RequestOtpInput): Promise<RequestOtpResult> {
  const phoneNumber = normalizeVePhone(input.phoneNumber);
  if (!phoneNumber) {
    throw new OtpRequestError("invalid_phone", "Teléfono inválido (debe ser venezolano)");
  }

  try {
    // R1: todos los buckets ANTES de generar el código.
    await assertRateLimit(rateLimitKeys.requestByPhone(phoneNumber), {
      limit: RATE.request.phonePerMinute,
      windowMs: MINUTE_MS,
    });
    await assertRateLimit(`${rateLimitKeys.requestByPhone(phoneNumber)}:h`, {
      limit: RATE.request.phonePerHour,
      windowMs: HOUR_MS,
    });
    await assertRateLimit(`${rateLimitKeys.requestByPhone(phoneNumber)}:d`, {
      limit: RATE.request.phonePerDay,
      windowMs: DAY_MS,
    });
    if (ipRateLimitEnabled()) {
      await assertRateLimit(rateLimitKeys.requestByIp(input.ip), {
        limit: RATE.request.ipPerHour,
        windowMs: HOUR_MS,
      });
    }
  } catch (err) {
    if (err instanceof RateLimitError) {
      // Bloqueo duro 30 min: el bucket `block:<key>` hace que los siguientes
      // requests del mismo teléfono/IP respondan 429 hasta expirar (R1).
      await setBlocked(rateLimitKeys.requestByPhone(phoneNumber), RATE.blockMinutes);
      if (ipRateLimitEnabled()) {
        await setBlocked(rateLimitKeys.requestByIp(input.ip), RATE.blockMinutes);
      }
      throw new OtpRequestError("rate_limited", "rate_limited", { cause: err });
    }
    throw err;
  }

  // R2: invalida códigos previos del mismo teléfono (un solo código activo).
  await db.otpCode.deleteMany({ where: { phoneNumber } });

  const code = generateOtpCode();
  const codeHash = hashOtpCode(code);
  const expiresAt = otpExpiresAt();

  await db.otpCode.create({
    data: {
      phoneNumber,
      codeHash,
      type: OTP_TYPE.LOGIN,
      expiresAt,
      attempts: 0,
    },
  });

  const provider = getOtpProvider();
  try {
    await provider.send(phoneNumber, code);
  } catch (err) {
    if (err instanceof OtpProviderError) {
      throw new OtpRequestError("send_failed", "send_failed", { cause: err });
    }
    throw err;
  }

  return {
    ok: true,
    expiresInSeconds: Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 1000)),
    // El proveedor dev expone el código por la respuesta HTTP (nunca en logs).
    devCode: provider.name === "dev" ? code : null,
  };
}

// ---------------------------------------------------------------------------
// Verify: verificar un código, hacer find-or-create y abrir sesión
// ---------------------------------------------------------------------------

export interface VerifyOtpInput {
  phoneNumber: string;
  code: string;
  /** IP del cliente (rate limit). */
  ip: string;
}

export interface VerifyOtpResult {
  user: {
    id: string;
    name: string;
    phoneNumber: string;
    role: string;
    slug: string;
  };
  isNewUser: boolean;
  /** Sesión recién creada (el route handler la fija como cookie httpOnly). */
  session: { token: string; expiresAt: Date };
}

/**
 * Verifica timing-safe (R3), consume el código atómicamente y crea sesión en la
 * MISMA transacción (R2). Rate limits de verify (R1). Errores controlados para
 * que el route responda 401 genérico / 429 + Retry-After.
 */
export async function verifyOtp(input: VerifyOtpInput): Promise<VerifyOtpResult> {
  const phoneNumber = normalizeVePhone(input.phoneNumber);
  if (!phoneNumber) {
    throw new OtpVerifyError("invalid_phone", "Código inválido o expirado");
  }
  const code = input.code.trim();

  try {
    await assertRateLimit(rateLimitKeys.verifyByPhone(phoneNumber), {
      limit: RATE.verify.phonePerHour,
      windowMs: HOUR_MS,
    });
    if (ipRateLimitEnabled()) {
      await assertRateLimit(rateLimitKeys.verifyByIp(input.ip), {
        limit: RATE.verify.ipPerHour,
        windowMs: HOUR_MS,
      });
    }
  } catch (err) {
    if (err instanceof RateLimitError) {
      // Bloqueo duro 30 min de verify para teléfono/IP (R1).
      await setBlocked(rateLimitKeys.verifyByPhone(phoneNumber), RATE.blockMinutes);
      if (ipRateLimitEnabled()) {
        await setBlocked(rateLimitKeys.verifyByIp(input.ip), RATE.blockMinutes);
      }
      throw new OtpVerifyError("rate_limited", "rate_limited", {
        cause: err,
        retryAfterSeconds: RATE.blockMinutes * 60,
      });
    }
    throw err;
  }

  const otp = await db.otpCode.findFirst({
    where: { phoneNumber },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) throw new OtpVerifyError("invalid_code", "Código inválido o no solicitado");
  if (otp.consumedAt) throw new OtpVerifyError("consumed", "Este código ya fue utilizado");
  if (isOtpExpired(otp.expiresAt)) {
    throw new OtpVerifyError("expired", "El código expiró. Solicita uno nuevo");
  }
  if (!hasAttemptsLeft(otp.attempts)) {
    throw new OtpVerifyError("attempts_exhausted", "Demasiados intentos fallidos");
  }

  const valid = verifyOtpCode(code, otp.codeHash);
  if (!valid) {
    // Consumo de intento (atómico, R2): el código se invalida al agotarse.
    const attempts = await db.otpCode.updateMany({
      where: { id: otp.id, consumedAt: null, attempts: { lt: OTP_DEFAULT_MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (attempts.count === 0) {
      // Carrera: ya se consumió o se agotó justo antes → genérico.
      throw new OtpVerifyError("invalid_code", "Código incorrecto");
    }
    throw new OtpVerifyError("invalid_code", "Código incorrecto");
  }

  // Éxito: consumo único + find-or-create + sesión en la MISMA transacción.
  const result = await db.$transaction(async (tx) => {
    const consumed = await tx.otpCode.updateMany({
      where: { id: otp.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count === 0) {
      // Carrera: otro request consumió el código primero → single-use.
      throw new OtpVerifyError("consumed", "Este código ya fue utilizado");
    }

    const existing = await tx.user.findUnique({ where: { phoneNumber } });
    const isNewUser = !existing;
    const user = existing ?? (await createUserWithUniqueSlug(tx, phoneNumber));

    // R2: la sesión nace en la misma transacción que el consumo del código.
    const session = await createSessionRecord(tx, user.id);

    return { user, isNewUser, session };
  });

  return {
    user: {
      id: result.user.id,
      name: result.user.name,
      phoneNumber: result.user.phoneNumber,
      role: result.user.role,
      slug: result.user.slug,
    },
    isNewUser: result.isNewUser,
    session: result.session,
  };
}

// ---------------------------------------------------------------------------
// find-or-create: crea el usuario con slug único (retry ante colisión)
// ---------------------------------------------------------------------------

const SLUG_RETRIES = 5;

/** Crea `User` con name "Usuario <últimos 4 dígitos>" y slug único (dedupe). */
async function createUserWithUniqueSlug(
  tx: Prisma.TransactionClient,
  phoneNumber: string,
): Promise<{ id: string; name: string; phoneNumber: string; role: string; slug: string }> {
  const name = `Usuario ${phoneNumber.slice(-4)}`;
  const baseSlug = uniqueSlug(name, []);

  for (let attempt = 0; attempt < SLUG_RETRIES; attempt += 1) {
    const candidate = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
    const taken = await tx.user.findMany({
      where: { slug: { in: [candidate] } },
      select: { slug: true },
    });
    const slug = taken.length > 0 ? `${candidate}-${taken.length + 1}` : candidate;

    try {
      return await tx.user.create({
        data: { phoneNumber, name, role: "BUYER", slug },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        continue; // colisión de slug (único): reintenta con otro sufijo
      }
      throw err;
    }
  }
  throw new OtpVerifyError("invalid_code", "No se pudo crear la cuenta (intenta de nuevo)");
}
