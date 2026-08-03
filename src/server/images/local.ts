// Almacenamiento local de imágenes (IMAGE_PROVIDER=local) — Épica E2/E3.
//
// Guarda en `.uploads/<folder>/<uuid>.<ext>` (raíz configurable por
// `UPLOADS_DIR`; default `path.join(process.cwd(), ".uploads")`). El fix de
// fotos (E3) sacó el almacenamiento de `public/` porque Next dev no sirve
// archivos nuevos de public/ sin reiniciar: ahora el route handler
// `src/app/uploads/[...key]/route.ts` sirve los archivos con la MISMA URL
// pública (`/uploads/<key>`) — no hace falta migrar datos.
//
// Seguridad:
//   - Validación del tipo REAL por magic bytes (no extensión ni MIME del header).
//   - Máx. 5 MB por defecto.
//   - Nombre aleatorio (uuid v4) — sin path traversal; key siempre generado aquí.
//   - `assertSafeKey()` / `assertImageFolder()` del módulo compartido `safe-key.ts`.
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  ImageProviderError,
  type ImageStorage,
  type ImageUploadInput,
  type ImageUploadResult,
} from "@/server/images/image-storage";
import { assertImageFolder, assertSafeKey } from "@/server/images/safe-key";
import {
  detectImageType,
  extensionForType,
  UnsupportedImageTypeError,
  type SupportedImageType,
} from "@/server/images/mime";

export class LocalImageStorage implements ImageStorage {
  constructor(
    private readonly baseDir: string = path.join(process.cwd(), ".uploads"),
    private readonly publicPrefix: string = "/uploads",
  ) {}

  async upload(input: ImageUploadInput): Promise<ImageUploadResult> {
    const maxBytes = input.maxBytes ?? 5 * 1024 * 1024;
    const allowedTypes = input.allowedTypes ?? ["image/jpeg", "image/png", "image/webp"];
    const buffer = Buffer.from(input.file);

    if (buffer.byteLength === 0) {
      throw new ImageProviderError("Archivo vacío");
    }
    if (buffer.byteLength > maxBytes) {
      throw new ImageProviderError(`El archivo excede el máximo de ${Math.round(maxBytes / 1024 / 1024)} MB`);
    }

    // R9: whitelist de carpetas ANTES de tocar el sistema de archivos.
    assertImageFolder(input.folder);

    const detected = detectImageType(buffer);
    if (!detected) {
      throw new UnsupportedImageTypeError("El archivo no es una imagen válida (jpeg/png/webp)");
    }
    if (!allowedTypes.includes(detected as SupportedImageType)) {
      throw new UnsupportedImageTypeError(`Tipo de imagen no permitido: ${detected}`);
    }

    const filename = `${randomUUID()}${extensionForType(detected)}`;
    const key = `${input.folder}/${filename}`;
    assertSafeKey(key);

    const dir = path.join(this.baseDir, input.folder);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, filename), buffer);

    return { url: `${this.publicPrefix}/${key}`, key };
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    const filePath = path.join(this.baseDir, key);
    try {
      await unlink(filePath);
    } catch (err) {
      // ENOENT: el archivo ya no existe (delete idempotente).
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
}

export const localImageStorage = new LocalImageStorage();
