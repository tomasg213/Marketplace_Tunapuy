// Server actions de negocios (Épica E2/E3) — capa fina "use server" sobre
// `business/service.ts` + `requireAuth()`. Solo el ALTA (`createBusiness`)
// vive aquí; la edición del negocio se hace desde la cuenta
// (`cuenta/actions.ts` → `business/service.updateBusiness`, fuente única).
"use server";

import { redirect } from "next/navigation";
import { AuthenticationError, requireAuth } from "@/server/auth/session";
import {
  createBusiness as createBusinessService,
  BusinessNotFoundError,
  BusinessOwnershipError,
  BusinessSlugConflictError,
  BusinessValidationError,
} from "@/server/business/service";
import type { CreateBusinessInput } from "@/server/business/validators";

export type BusinessActionResult =
  | { ok: true; id: string; slug: string }
  | { ok: false; error: string };

async function authedUserId(): Promise<string> {
  try {
    return await requireAuth();
  } catch (err) {
    if (err instanceof AuthenticationError) redirect("/login");
    throw err;
  }
}

/** Traduce errores controlados del servicio a { ok: false, error }. */
function toActionResult(err: unknown, fallback: string): Extract<BusinessActionResult, { ok: false }> {
  if (
    err instanceof BusinessValidationError ||
    err instanceof BusinessNotFoundError ||
    err instanceof BusinessOwnershipError ||
    err instanceof BusinessSlugConflictError
  ) {
    return { ok: false, error: err.message };
  }
  console.error("[business/action] error inesperado:", err);
  return { ok: false, error: fallback };
}

/** Crea el negocio del usuario autenticado (un negocio por cuenta). */
export async function createBusiness(input: CreateBusinessInput): Promise<BusinessActionResult> {
  const userId = await authedUserId();
  try {
    const result = await createBusinessService(userId, input);
    return { ok: true, id: result.id, slug: result.slug };
  } catch (err) {
    return toActionResult(err, "No se pudo crear el negocio");
  }
}
