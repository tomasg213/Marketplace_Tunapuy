// GET /uploads/[...key] — sirve las imágenes subidas en runtime desde la raíz
// de uploads (fix de fotos, épica E3).
//
// Contexto del bug corregido: las fotos se guardaban en `public/uploads/` y
// Next dev devolvía 404 para archivos NUEVOS de public/ sin reiniciar el
// servidor. Ahora el almacenamiento vive fuera de public/ (`.uploads/`,
// configurable por `UPLOADS_DIR`) y este route handler las sirve con la MISMA
// URL pública en BD (`/uploads/products/<uuid>.jpg`) → no hay que migrar datos.
//
// Seguridad:
//   - `assertSafeKey()`: rechaza "/" inicial, "..", "\\" y NUL (path traversal).
//   - El path resuelto SIEMPRE se re-valida contra la raíz de uploads
//     (defensa en profundidad): nunca se sirve nada fuera de uploadsRoot.
//   - Content-Type por magic bytes (`detectImageType`), nunca por extensión;
//     `X-Content-Type-Options: nosniff` evita sniffing.
//   - Cache inmutable: los nombres son uuid v4, una vez creados no cambian.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { assertSafeKey, UnsafeKeyError } from "@/server/images/safe-key";
import { detectImageType } from "@/server/images/mime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Raíz de uploads: configurable por UPLOADS_DIR (default `.uploads` en la raíz del proyecto). */
function uploadsRoot(): string {
  return process.env.UPLOADS_DIR ?? path.join(process.cwd(), ".uploads");
}

// Next 15+: los params de rutas dinámicas son una Promise.
type Params = Promise<{ key: string[] }>;

export async function GET(_request: Request, ctx: { params: Params }): Promise<Response> {
  const key = (await ctx.params).key.join("/");

  try {
    assertSafeKey(key);
  } catch (err) {
    if (err instanceof UnsafeKeyError) {
      return new NextResponse("Bad request", { status: 400 });
    }
    throw err;
  }

  // Defensa en profundidad: el path resuelto debe quedar DENTRO de uploadsRoot.
  const root = path.resolve(uploadsRoot());
  const resolved = path.resolve(root, key);
  if (!resolved.startsWith(root + path.sep)) {
    return new NextResponse("Bad request", { status: 400 });
  }

  let buffer: Buffer;
  try {
    buffer = await readFile(resolved);
  } catch {
    // ENOENT (o EISDIR/EACCES): se responde 404, nunca 500.
    return new NextResponse("Not found", { status: 404 });
  }

  // Content-Type por magic bytes (jpeg/png/webp) o fallback genérico.
  const contentType = detectImageType(buffer) ?? "application/octet-stream";

  // BodyInit no acepta Buffer<ArrayBufferLike> directamente; se envuelve en
  // Uint8Array (view sobre el mismo buffer, sin copia).
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
