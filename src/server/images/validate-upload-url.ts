// Validación de URLs de imágenes de perfil ya subidas (épica "Perfiles editables").
//
// Las server actions (`updateUserProfileAction`, `updateBusinessAction`) NO
// aceptan cualquier URL: solo una que apunte a `/uploads/<folder>/` de NUSTRO
// origen (relativa o absoluta same-origin), con key segura (sin "..", "\\", NUL).
// Eso evita que un atacante guarde `javascript:`, `data:` o URLs externas como
// avatar/logo (XSS por contenido remoto, phishing).
import { env } from "@/server/env";
import {
  assertImageFolder,
  assertSafeKey,
  type AllowedImageFolder,
} from "@/server/images/safe-key";

/** URL de imagen de perfil inválida (origen externo, folder equivocado, key insegura). */
export class InvalidUploadedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidUploadedUrlError";
  }
}

/**
 * Valida que `url` sea una imagen de perfil subida por nosotros:
 * path relativo `/uploads/<folder>/...` o absoluta del mismo origen (APP_URL).
 * Lanza `InvalidUploadedUrlError` si no. No muta ni normaliza la URL.
 */
export function assertUploadedImageUrl(url: string, folder: AllowedImageFolder): void {
  // Whitelist R9 primero (defensa ante folder arbitrario).
  try {
    assertImageFolder(folder);
  } catch (err) {
    throw new InvalidUploadedUrlError((err as Error).message);
  }

  let pathname: string;
  try {
    const base = new URL(env.APP_URL);
    const parsed = new URL(url, base); // URL relativa → resuelve contra APP_URL.
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("protocolo no http(s)");
    }
    // Absoluta: exige mismo origen que APP_URL. Relativa: siempre same-origin.
    if (/^https?:\/\//.test(url) && parsed.origin !== base.origin) {
      throw new Error("origen distinto");
    }
    pathname = parsed.pathname;
  } catch {
    throw new InvalidUploadedUrlError("URL de imagen inválida (debe ser de este sitio)");
  }

  const prefix = `/uploads/${folder}/`;
  if (!pathname.startsWith(prefix)) {
    throw new InvalidUploadedUrlError(`La imagen debe apuntar a /uploads/${folder}/`);
  }

  // Key interna: `/uploads/<folder>/<archivo>` → `<folder>/<archivo>`.
  const key = pathname.slice("/uploads/".length);
  try {
    assertSafeKey(key);
  } catch (err) {
    throw new InvalidUploadedUrlError((err as Error).message);
  }
}
