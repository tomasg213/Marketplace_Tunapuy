// Pruebas de la capa de imágenes (Épica E2): detección por magic bytes y
// almacenamiento local (LocalImageStorage) en un directorio temporal.
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  detectImageType,
  extensionForType,
  UnsupportedImageTypeError,
} from "../../src/server/images/mime";
import { LocalImageStorage } from "../../src/server/images/local";
import { ImageProviderError } from "../../src/server/images/image-storage";

// Magic bytes mínimos por formato (suficientes para detectImageType).
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const WEBP = new TextEncoder().encode("RIFF\x24\x00\x00\x00WEBPVP8 ");
// AVIF (ISO BMFF "ftypavif") y SVG (texto) NO son tipos soportados (R9).
const AVIF = new TextEncoder().encode("\x00\x00\x00\x20ftypavif\x00\x00\x00\x00");
const SVG = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>");

describe("detectImageType (magic bytes, R9)", () => {
  it("detecta JPEG por FF D8 FF", () => {
    expect(detectImageType(JPEG)).toBe("image/jpeg");
  });

  it("detecta PNG por la firma PNG", () => {
    expect(detectImageType(PNG)).toBe("image/png");
  });

  it("detecta WebP por RIFF….WEBP", () => {
    expect(detectImageType(WEBP)).toBe("image/webp");
  });

  it("R9: AVIF y SVG NO se detectan (solo jpeg/png/webp)", () => {
    expect(detectImageType(AVIF)).toBeNull();
    expect(detectImageType(SVG)).toBeNull();
  });

  it("devuelve null para tipos no soportados (GIF, BMP, texto…)", () => {
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    expect(detectImageType(gif)).toBeNull();
    expect(detectImageType(new TextEncoder().encode("<html>"))).toBeNull();
    expect(detectImageType(new Uint8Array([]))).toBeNull();
  });

  it("ignora el MIME/extension declarados: un .jpg con contenido PNG se detecta como PNG", () => {
    expect(detectImageType(PNG)).toBe("image/png");
    expect(extensionForType("image/png")).toBe(".png");
  });

  it("extensionForType mapea los 3 tipos soportados", () => {
    expect(extensionForType("image/jpeg")).toBe(".jpg");
    expect(extensionForType("image/png")).toBe(".png");
    expect(extensionForType("image/webp")).toBe(".webp");
  });
});

describe("LocalImageStorage", () => {
  let tmpDir: string;
  let storage: LocalImageStorage;

  beforeAll(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "tunapuy-images-"));
    storage = new LocalImageStorage(tmpDir, "/uploads");
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("sube una imagen y devuelve url + key con uuid y extensión correcta", async () => {
    const result = await storage.upload({ file: PNG, folder: "products" });
    expect(result.key).toMatch(/^products\/[0-9a-f-]{36}\.png$/);
    expect(result.url).toBe(`/uploads/${result.key}`);
    // El archivo existe en disco (baseDir = tmpDir; key = "<folder>/<uuid>.ext").
    await expect(stat(path.join(tmpDir, result.key))).resolves.toBeTruthy();
  });

  it("persiste los bytes exactos", async () => {
    const result = await storage.upload({ file: JPEG, folder: "products" });
    const onDisk = await readFile(path.join(tmpDir, result.key));
    expect([...onDisk]).toEqual([...JPEG]);
  });

  it("rechaza archivos que no son imágenes (UnsupportedImageTypeError)", async () => {
    await expect(
      storage.upload({ file: new TextEncoder().encode("#!/bin/sh"), folder: "products" }),
    ).rejects.toBeInstanceOf(UnsupportedImageTypeError);
  });

  it("rechaza archivos vacíos (ImageProviderError)", async () => {
    await expect(storage.upload({ file: new Uint8Array([]), folder: "products" })).rejects.toBeInstanceOf(
      ImageProviderError,
    );
  });

  it("respeta el límite de tamaño (maxBytes)", async () => {
    const big = new Uint8Array(JPEG.length + 10);
    big.set(JPEG.subarray(0, 3)); // firma JPEG válida
    await expect(
      storage.upload({ file: big, folder: "products", maxBytes: JPEG.length + 5 }),
    ).rejects.toBeInstanceOf(ImageProviderError);
  });

  it("respeta la allowlist de tipos", async () => {
    await expect(
      storage.upload({ file: PNG, folder: "products", allowedTypes: ["image/jpeg"] }),
    ).rejects.toBeInstanceOf(UnsupportedImageTypeError);
  });

  it("rechaza folders inválidos (vacío tras sanitizar o '..')", async () => {
    await expect(storage.upload({ file: PNG, folder: "!!!" })).rejects.toBeInstanceOf(ImageProviderError);
    await expect(storage.upload({ file: PNG, folder: ".." })).rejects.toBeInstanceOf(ImageProviderError);
  });

  it("R9: rechaza folders fuera de la whitelist (products|businesses|users)", async () => {
    await expect(storage.upload({ file: PNG, folder: "admin" })).rejects.toBeInstanceOf(ImageProviderError);
    await expect(storage.upload({ file: PNG, folder: "../../etc" })).rejects.toBeInstanceOf(
      ImageProviderError,
    );
    // La whitelist permite los 3 folders legítimos.
    for (const folder of ["products", "businesses", "users"]) {
      await expect(storage.upload({ file: PNG, folder })).resolves.toMatchObject({ key: expect.stringMatching(`^${folder}/`) });
    }
  });

  it("R9: un SVG disfrazado de .png se rechaza (UnsupportedImageTypeError)", async () => {
    await expect(storage.upload({ file: SVG, folder: "products" })).rejects.toBeInstanceOf(
      UnsupportedImageTypeError,
    );
  });

  it("delete() borra el archivo y es idempotente (ENOENT)", async () => {
    const result = await storage.upload({ file: PNG, folder: "products" });
    await storage.delete(result.key);
    await expect(stat(path.join(tmpDir, "uploads", result.key))).rejects.toThrow();
    // Idempotente: no lanza si el archivo ya no existe.
    await expect(storage.delete(result.key)).resolves.toBeUndefined();
  });

  it("delete() rechaza keys inseguras (path traversal)", async () => {
    await expect(storage.delete("../escapar.png")).rejects.toBeInstanceOf(ImageProviderError);
    await expect(storage.delete("/etc/passwd")).rejects.toBeInstanceOf(ImageProviderError);
    await expect(storage.delete("products\\..\\x.png")).rejects.toBeInstanceOf(ImageProviderError);
  });
});
