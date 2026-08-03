// Detección del tipo real de imagen por MAGIC BYTES (no por extensión ni MIME
// declarado). Requisito de seguridad E2/R9: un archivo renombrado a `.jpg` con
// contenido malicioso no debe pasar el filtro.
//
// Firmas soportadas (SOLO las permitidas por el dictamen R9 — jpeg/png/webp):
//   - JPEG:  FF D8 FF
//   - PNG:   89 50 4E 47 0D 0A 1A 0A
//   - WebP:  RIFF .... WEBP (bytes 0-3 "RIFF", 8-11 "WEBP")
// AVIF queda FUERA (no se soporta): los archivos que no coincidan con estas
// firmas devuelven `null` → rechazados como "no soportados". SVG jamás (no
// tiene magic bytes de imagen y es un vector XSS conocido).
export const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

export class UnsupportedImageTypeError extends Error {
  constructor(message = "Tipo de imagen no soportado") {
    super(message);
    this.name = "UnsupportedImageTypeError";
  }
}

const EXTENSION_BY_TYPE: Record<SupportedImageType, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

/** Detecta el tipo real por magic bytes; `null` si no coincide con ninguno. */
export function detectImageType(buffer: Uint8Array): SupportedImageType | null {
  const bytes = new Uint8Array(buffer);
  const len = bytes.length;

  // JPEG: FF D8 FF
  if (len >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    len >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  // WebP: "RIFF" (0-3) + "WEBP" (8-11)
  if (
    len >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  ) {
    return "image/webp";
  }

  return null;
}

/** Extensión canónica para el tipo detectado (para el nombre de archivo). */
export function extensionForType(type: SupportedImageType): string {
  return EXTENSION_BY_TYPE[type];
}
