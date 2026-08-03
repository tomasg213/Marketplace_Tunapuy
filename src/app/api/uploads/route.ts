// POST /api/uploads — sube una imagen (multipart) y la asocia a un producto
// (Épica E2, IMAGE_PROVIDER=local) o la devuelve para perfil (avatar/logo,
// "Perfiles editables" — la asociación la hace la server action de cuenta).
//
// Body multipart:
//   - `file`      (File, obligatorio) — imagen jpeg/png/webp, máx 5 MB (R9).
//
// Modo producto (galería del vendedor):
//   - `productId` (string, obligatorio) — el usuario debe ser el dueño.
//   - `position`  (string numérica, opcional) — orden en la galería.
//   - `alt`       (string, opcional).
//   Respuesta 200: { id, url, key, alt, position, productId }.
//
// Modo perfil:
//   - `folder`    ("users" | "businesses", obligatorio) — avatar o logo.
//   - `businessId`(string) — SOLO con folder=businesses; el usuario debe ser dueño.
//   Respuesta 200: { url, key } (sin fila en BD; ver validate-upload-url.ts).
import { NextResponse } from "next/server";
import { requireAuth } from "@/server/auth/session";
import { assertSafeOrigin } from "@/server/csrf";
import { db } from "@/server/db";
import { IMAGE_MAX_BYTES } from "@/server/images/image-storage";
import { uploadProductImage, uploadProfileImage } from "@/server/images/service";
import {
  ProductNotFoundError,
  ProductOwnershipError,
} from "@/server/products/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  assertSafeOrigin(request); // R5
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // Rechazo temprano por Content-Length (sin leer el body completo).
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > IMAGE_MAX_BYTES + 4096) {
    return NextResponse.json(
      { error: `El archivo excede el máximo de ${Math.round(IMAGE_MAX_BYTES / 1024 / 1024)} MB` },
      { status: 413 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Multipart inválido" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Campo 'file' (archivo) requerido" }, { status: 400 });
  }
  if (file.size > IMAGE_MAX_BYTES) {
    return NextResponse.json(
      { error: `El archivo excede el máximo de ${Math.round(IMAGE_MAX_BYTES / 1024 / 1024)} MB` },
      { status: 413 },
    );
  }
  const buffer = new Uint8Array(await file.arrayBuffer());

  const folder = formData.get("folder");
  const productIdRaw = formData.get("productId");

  // --- Modo perfil: avatar (users) o logo de negocio (businesses) ---
  if (folder === "users" || folder === "businesses") {
    if (folder === "businesses") {
      const businessIdRaw = formData.get("businessId");
      if (typeof businessIdRaw !== "string" || !businessIdRaw) {
        return NextResponse.json({ error: "Campo 'businessId' requerido" }, { status: 400 });
      }
      const business = await db.business.findUnique({
        where: { id: businessIdRaw },
        select: { ownerId: true },
      });
      if (!business) {
        return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 });
      }
      if (business.ownerId !== userId) {
        return NextResponse.json({ error: "No eres dueño de este negocio" }, { status: 403 });
      }
    }
    try {
      const image = await uploadProfileImage({ folder, file: buffer });
      return NextResponse.json(image, { status: 200 });
    } catch (err) {
      return uploadErrorResponse(err);
    }
  }

  // --- Modo producto (galería del vendedor) ---
  if (typeof productIdRaw !== "string" || !productIdRaw) {
    return NextResponse.json(
      { error: "Campo 'productId' o 'folder' ('users'|'businesses') requerido" },
      { status: 400 },
    );
  }
  const positionRaw = formData.get("position");
  const alt = formData.get("alt");
  const position = positionRaw ? Number(positionRaw) : 0;
  if (!Number.isInteger(position) || position < 0 || position > 15) {
    return NextResponse.json({ error: "'position' debe ser un entero 0–15" }, { status: 400 });
  }

  try {
    const image = await uploadProductImage(userId, {
      productId: productIdRaw,
      file: buffer,
      position,
      alt: typeof alt === "string" && alt.trim() ? alt.trim() : undefined,
    });
    return NextResponse.json(image, { status: 200 });
  } catch (err) {
    return uploadErrorResponse(err);
  }
}

/** Mapea errores de la capa de imágenes a respuestas HTTP (compartido por modos). */
function uploadErrorResponse(err: unknown): Response {
  if (err instanceof ProductNotFoundError) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }
  if (err instanceof ProductOwnershipError) {
    return NextResponse.json({ error: "No eres dueño de este producto" }, { status: 403 });
  }
  if (err instanceof Error && err.name === "UnsupportedImageTypeError") {
    return NextResponse.json({ error: err.message }, { status: 415 });
  }
  if (err instanceof Error && err.name === "ImageProviderError") {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  console.error("[uploads] error inesperado:", err);
  return NextResponse.json({ error: "Error interno" }, { status: 500 });
}
