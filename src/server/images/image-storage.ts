// Contrato de almacenamiento de imágenes (docs/architecture.md §7).
//
// La capa de negocio depende SOLO de esta interfaz (inversión de dependencia):
//   - local      → `LocalImageStorage` (dev): .uploads/<folder>/<uuid>.<ext>
//                  servido por `/uploads/[...key]` (fix de fotos E3).
//   - s3 / cloudinary → E3 (misma interfaz, sin tocar el resto del código).
//
// `ALLOWED_IMAGE_FOLDERS`, `ImageProviderError` y la validación de folders viven
// en `safe-key.ts` (módulo hoja) y se re-exportan aquí por compatibilidad.
import { localImageStorage } from "@/server/images/local";
import {
  ALLOWED_IMAGE_FOLDERS,
  assertImageFolder,
  ImageProviderError,
  type AllowedImageFolder,
} from "@/server/images/safe-key";

// Re-export de compatibilidad (la whitelist y los errores se definen en safe-key).
export {
  ALLOWED_IMAGE_FOLDERS,
  assertImageFolder,
  ImageProviderError,
  type AllowedImageFolder,
} from "@/server/images/safe-key";

/** Tipos de imagen aceptados (dictamen R9: jpeg/png/webp — sin SVG, sin AVIF). */
export const IMAGE_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Valida que `folder` esté en la whitelist (products|businesses|users);
 * lanza ImageProviderError si no. Alias histórico: delega en `assertImageFolder`.
 */
export function assertAllowedImageFolder(folder: string): void {
  assertImageFolder(folder);
}

export interface ImageUploadInput {
  /** Buffer del archivo (ya leído). */
  file: Buffer | Uint8Array;
  /** Carpeta lógica: "products" | "businesses" | "users" (whitelist R9). */
  folder: string;
  /** Tipos MIME permitidos (default: jpeg/png/webp, R9). */
  allowedTypes?: readonly string[];
  /** Tamaño máximo en bytes (default: 5 MB). */
  maxBytes?: number;
}

export interface ImageUploadResult {
  /** URL pública para servir la imagen (paths locales o absolutos remotos). */
  url: string;
  /** Key interna (object key / public_id) para `delete()`. */
  key: string;
}

export interface ImageStorage {
  upload(input: ImageUploadInput): Promise<ImageUploadResult>;
  delete(key: string): Promise<void>;
}

/**
 * Factory según `IMAGE_PROVIDER` (default "local").
 * s3/cloudinary lanzan ImageProviderError hasta E3 (contrato cerrado en E0).
 */
export function getImageStorage(): ImageStorage {
  const provider = process.env.IMAGE_PROVIDER ?? "local";
  switch (provider) {
    case "local":
      return localImageStorage;
    case "s3":
    case "cloudinary":
      throw new ImageProviderError(
        `IMAGE_PROVIDER=${provider} no está implementado aún (E3). Usa IMAGE_PROVIDER=local en dev`,
      );
    default:
      throw new ImageProviderError(
        `IMAGE_PROVIDER desconocido: "${provider}" (opciones: local | s3 | cloudinary)`,
      );
  }
}
