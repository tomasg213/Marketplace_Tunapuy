// API de productos del vendedor (Épica E2).
//
//   GET  /api/products?status=DRAFT|ACTIVE|PAUSED|ARCHIVED|SOLD
//        → productos del usuario autenticado (para /mis-publicaciones).
//   POST /api/products  (JSON) → crea producto (validación + ownership).
//
// Ambos requieren sesión (401 si no). Los precios Decimal se serializan como
// string (toJSON de decimal.js).
import { NextResponse } from "next/server";
import { AuthenticationError, requireAuth } from "@/server/auth/session";
import { assertSafeOrigin } from "@/server/csrf";
import {
  BusinessOwnershipError,
  createProductRecord,
  getMyProducts,
  ProductSlugConflictError,
  ProductValidationError,
  type CreateProductActionInput,
  type MyProductsStatusFilter,
} from "@/server/products/service";

export const dynamic = "force-dynamic";

async function userIdOr401(): Promise<string | null> {
  try {
    return await requireAuth();
  } catch (err) {
    if (err instanceof AuthenticationError) return null;
    throw err;
  }
}

/** GET /api/products — listado del vendedor (filtro por ?status=). */
export async function GET(request: Request): Promise<Response> {
  const userId = await userIdOr401();
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const allowed = ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED", "SOLD", "ALL"];
  const filter = (status && allowed.includes(status) ? status : "ALL") as MyProductsStatusFilter;

  const products = await getMyProducts(userId, filter);
  return NextResponse.json({ products }, { status: 200 });
}

/** POST /api/products — crea un producto (JSON). */
export async function POST(request: Request): Promise<Response> {
  assertSafeOrigin(request); // R5
  const userId = await userIdOr401();
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  try {
    const { product } = await createProductRecord(userId, body as CreateProductActionInput);
    return NextResponse.json({ product }, { status: 201 });
  } catch (err) {
    if (err instanceof ProductValidationError) {
      return NextResponse.json({ error: err.message, issues: err.issues }, { status: 400 });
    }
    if (err instanceof BusinessOwnershipError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof ProductSlugConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("[api/products] error inesperado:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
