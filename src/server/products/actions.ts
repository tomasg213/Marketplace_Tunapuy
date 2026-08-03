// Server actions del CRUD de productos (Épica E2) — capa fina sobre
// `products/service.ts` + `requireAuth()`. Las llama el designer desde forms
// o botones (useActionState / sonner).
//
// Errores de auth → redirect("/login"); errores de negocio → { ok: false, error }
// para que la UI los muestre sin tirar una excepción al cliente.
"use server";

import { redirect } from "next/navigation";
import { AuthenticationError, requireAuth } from "@/server/auth/session";
import type { ProductStatus } from "@/lib/constants";
import {
  BusinessOwnershipError,
  createProductRecord,
  deleteProductRecord,
  ProductNotFoundError,
  ProductOwnershipError,
  ProductSlugConflictError,
  ProductValidationError,
  setProductStatusRecord,
  updateProductRecord,
  type CreateProductActionInput,
  type UpdateProductActionInput,
} from "@/server/products/service";

export type ProductActionResult =
  | { ok: true; id: string; slug: string }
  | { ok: false; error: string };

async function authedUserId(): Promise<string> {
  try {
    return await requireAuth();
  } catch (err) {
    if (err instanceof AuthenticationError) {
      redirect("/login");
    }
    throw err;
  }
}

function toActionResult(
  err: unknown,
  fallback = "Error al guardar el producto",
): Extract<ProductActionResult, { ok: false }> {
  if (
    err instanceof ProductValidationError ||
    err instanceof ProductOwnershipError ||
    err instanceof ProductNotFoundError ||
    err instanceof ProductSlugConflictError ||
    err instanceof BusinessOwnershipError
  ) {
    return { ok: false, error: err.message };
  }
  console.error("[products/action] error inesperado:", err);
  return { ok: false, error: fallback };
}

/** Crea un producto (borrador o activo). Marca al usuario SELLER si publica. */
export async function createProduct(input: CreateProductActionInput): Promise<ProductActionResult> {
  const userId = await authedUserId();
  try {
    const { product } = await createProductRecord(userId, input);
    return { ok: true, id: product.id, slug: product.slug };
  } catch (err) {
    return toActionResult(err, "No se pudo crear el producto");
  }
}

/** Edita un producto del dueño (campos parciales; status incluido). */
export async function updateProduct(
  productId: string,
  input: UpdateProductActionInput,
): Promise<ProductActionResult> {
  const userId = await authedUserId();
  try {
    const { product } = await updateProductRecord(userId, productId, input);
    return { ok: true, id: product.id, slug: product.slug };
  } catch (err) {
    return toActionResult(err, "No se pudo actualizar el producto");
  }
}

/** Cambia el estado: DRAFT | ACTIVE | PAUSED | ARCHIVED | SOLD. */
export async function setProductStatus(
  productId: string,
  status: ProductStatus,
): Promise<ProductActionResult> {
  const userId = await authedUserId();
  try {
    await setProductStatusRecord(userId, productId, status);
    return { ok: true, id: productId, slug: "" };
  } catch (err) {
    return toActionResult(err, "No se pudo cambiar el estado");
  }
}

/** Elimina el producto (solo el dueño). */
export async function deleteProduct(productId: string): Promise<ProductActionResult> {
  const userId = await authedUserId();
  try {
    await deleteProductRecord(userId, productId);
    return { ok: true, id: productId, slug: "" };
  } catch (err) {
    return toActionResult(err, "No se pudo eliminar el producto");
  }
}
