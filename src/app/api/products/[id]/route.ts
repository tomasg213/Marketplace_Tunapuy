// API de un producto concreto del vendedor (Épica E2).
//
//   PATCH /api/products/:id   { ...campos } | { status } → edita (ownership).
//   DELETE /api/products/:id  → elimina (ownership; cascade imágenes).
import { NextResponse } from "next/server";
import { AuthenticationError, requireAuth } from "@/server/auth/session";
import { assertSafeOrigin } from "@/server/csrf";
import {
  BusinessOwnershipError,
  deleteProductRecord,
  ProductNotFoundError,
  ProductOwnershipError,
  ProductSlugConflictError,
  ProductValidationError,
  setProductStatusRecord,
  updateProductRecord,
  type UpdateProductActionInput,
} from "@/server/products/service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function userIdOr401(): Promise<string | null> {
  try {
    return await requireAuth();
  } catch (err) {
    if (err instanceof AuthenticationError) return null;
    throw err;
  }
}

function toErrorResponse(err: unknown): Response {
  if (err instanceof ProductValidationError) {
    return NextResponse.json({ error: err.message, issues: err.issues }, { status: 400 });
  }
  if (err instanceof ProductNotFoundError) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
  if (err instanceof ProductOwnershipError || err instanceof BusinessOwnershipError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err instanceof ProductSlugConflictError) {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }
  console.error("[api/products/:id] error inesperado:", err);
  return NextResponse.json({ error: "Error interno" }, { status: 500 });
}

/** PATCH — edición parcial; si el body es solo `{ status }` usa el cambio de estado. */
export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  assertSafeOrigin(request); // R5
  const userId = await userIdOr401();
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const onlyStatus =
    body &&
    typeof body === "object" &&
    Object.keys(body as Record<string, unknown>).length === 1 &&
    typeof (body as { status?: unknown }).status === "string";

  try {
    if (onlyStatus) {
      await setProductStatusRecord(userId, id, (body as { status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED" | "SOLD" }).status);
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    const { product } = await updateProductRecord(userId, id, body as UpdateProductActionInput);
    return NextResponse.json({ product }, { status: 200 });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** DELETE — elimina el producto (cascade de imágenes + archivos). */
export async function DELETE(request: Request, ctx: Ctx): Promise<Response> {
  assertSafeOrigin(request); // R5
  const userId = await userIdOr401();
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await ctx.params;
  try {
    await deleteProductRecord(userId, id);
    return new Response(null, { status: 204 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
