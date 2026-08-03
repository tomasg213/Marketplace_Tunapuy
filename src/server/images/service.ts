// Servicio de imágenes de producto (Épica E2): sube el archivo al storage y
// crea la fila `ProductImage` (position). Auth + ownership obligatorios.
//
// Flujo del designer: el stepper sube cada foto (multipart → /api/uploads),
// recibe { id, url, key, position } y envía esos `key`s/urls al crear el
// producto (createProductRecord acepta `images`).
import { db } from "@/server/db";
import {
  getImageStorage,
  IMAGE_ALLOWED_TYPES,
  IMAGE_MAX_BYTES,
} from "@/server/images/image-storage";
import {
  ProductNotFoundError,
  ProductOwnershipError,
} from "@/server/products/service";

export interface UploadedProductImage {
  id: string;
  url: string;
  key: string;
  alt: string | null;
  position: number;
  productId: string;
}

export interface UploadProductImageInput {
  productId: string;
  file: Buffer | Uint8Array;
  position?: number;
  alt?: string;
}

/** Sube la imagen y la asocia al producto (validando que es del dueño). */
export async function uploadProductImage(
  userId: string,
  input: UploadProductImageInput,
): Promise<UploadedProductImage> {
  const product = await db.product.findUnique({
    where: { id: input.productId },
    select: { sellerId: true },
  });
  if (!product) throw new ProductNotFoundError();
  if (product.sellerId !== userId) throw new ProductOwnershipError();

  const storage = getImageStorage();
  const { url, key } = await storage.upload({
    file: input.file,
    folder: "products",
    allowedTypes: IMAGE_ALLOWED_TYPES,
    maxBytes: IMAGE_MAX_BYTES,
  });

  return db.productImage.create({
    data: {
      url,
      key,
      alt: input.alt ?? null,
      position: input.position ?? 0,
      productId: input.productId,
    },
    select: { id: true, url: true, key: true, alt: true, position: true, productId: true },
  });
}

/** Borra una imagen del producto (solo el dueño) + archivo del storage. */
export async function deleteProductImage(userId: string, imageId: string): Promise<void> {
  const image = await db.productImage.findUnique({
    where: { id: imageId },
    include: { product: { select: { sellerId: true } } },
  });
  if (!image) throw new ProductNotFoundError("Imagen no encontrada");
  if (image.product.sellerId !== userId) throw new ProductOwnershipError();

  await db.productImage.delete({ where: { id: imageId } });

  const storage = getImageStorage();
  await storage.delete(image.key).catch((err) => {
    console.warn(`[images/delete] no se pudo borrar ${image.key}:`, err);
  });
}

// ---------------------------------------------------------------------------
// Imágenes de perfil (avatars de usuario y logos de negocio) — épica
// "Perfiles editables": /api/uploads con `folder=users|businesses`.
// No crean fila en BD (User.avatarUrl / Business.logoUrl son URLs simples);
// la asociación la hace la server action correspondiente tras validar el URL.
// ---------------------------------------------------------------------------

export interface UploadProfileImageInput {
  /** Carpeta de destino: "users" (avatar) o "businesses" (logo). */
  folder: "users" | "businesses";
  file: Buffer | Uint8Array;
}

export interface UploadedProfileImage {
  url: string;
  key: string;
}

/**
 * Sube un avatar/logo al storage (R9: jpeg/png/webp, ≤5 MB, carpeta whitelist).
 * La autenticación y la propiedad del negocio las valida el route handler
 * ANTES de llamar (requireAuth para `users`; ownership del negocio para
 * `businesses`).
 */
export async function uploadProfileImage(
  input: UploadProfileImageInput,
): Promise<UploadedProfileImage> {
  const storage = getImageStorage();
  return storage.upload({
    file: input.file,
    folder: input.folder,
    allowedTypes: IMAGE_ALLOWED_TYPES,
    maxBytes: IMAGE_MAX_BYTES,
  });
}
