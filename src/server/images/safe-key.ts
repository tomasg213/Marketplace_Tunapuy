// Validación de keys y folders de imágenes (épica "fix de fotos", E3).
//
// Compartido por el storage local (`local.ts`) y el route handler de servicio
// (`src/app/uploads/[...key]/route.ts`) para que la whitelist y la validación
// de path traversal vivan en UN solo lugar.
//
// Este módulo es una HOJA del grafo de imports (no importa nada de la capa de
// imágenes) para que `image-storage.ts` pueda re-exportar sus símbolos sin
// ciclos: image-storage → local → safe-key.

/** Carpetas permitidas (R9): el storage rechaza cualquier otra. */
export const ALLOWED_IMAGE_FOLDERS = ["products", "businesses", "users"] as const;
export type AllowedImageFolder = (typeof ALLOWED_IMAGE_FOLDERS)[number];

/** Error base de la capa de imágenes (storage, validación, folders). */
export class ImageProviderError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ImageProviderError";
  }
}

/** Key o folder de imagen inseguro (path traversal, whitelist). */
export class UnsafeKeyError extends ImageProviderError {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeKeyError";
  }
}

/**
 * Valida que `key` sea un path relativo seguro de imagen: sin "/" inicial,
 * sin "..", sin backslashes y sin NUL. NO permite subir de directorio ni
 * salir de la raíz de uploads. Lanza `UnsafeKeyError` si es inválido.
 */
export function assertSafeKey(key: string): void {
  if (!key) {
    throw new UnsafeKeyError("Key de imagen vacío");
  }
  if (key.startsWith("/")) {
    throw new UnsafeKeyError(`Key de imagen inválido (no puede iniciar con "/"): ${key}`);
  }
  if (key.includes("..")) {
    throw new UnsafeKeyError(`Key de imagen inválido (no puede contener ".."): ${key}`);
  }
  if (key.includes("\\")) {
    throw new UnsafeKeyError(`Key de imagen inválido (no puede contener "\\"): ${key}`);
  }
  if (key.includes("\0")) {
    throw new UnsafeKeyError("Key de imagen inválido (no puede contener NUL)");
  }
}

/**
 * Valida que `folder` esté en la whitelist de carpetas de imagen
 * (products | businesses | users). Lanza `UnsafeKeyError` si no.
 */
export function assertImageFolder(folder: string): void {
  if (!(ALLOWED_IMAGE_FOLDERS as readonly string[]).includes(folder)) {
    throw new UnsafeKeyError(
      `Folder de imagen no permitido: "${folder}" (opciones: ${ALLOWED_IMAGE_FOLDERS.join(" | ")})`,
    );
  }
}
