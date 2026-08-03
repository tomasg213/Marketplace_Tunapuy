// Pruebas de integración del servicio de perfil de usuario
// (users/profile-service.ts) contra una BD PostgreSQL AISLADA
// (tunapuy_test_users; distinta de la de products, business y auth para evitar
// carreras entre archivos de test).
//
// Cubre: cambiar name/email, email null limpia, email undefined no toca,
// avatarUrl string/null/undefined (null limpia SIN error), email duplicado de
// otro usuario → EmailConflictError y name inválido → UserProfileValidationError.

import { execFileSync } from "node:child_process";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL_USERS ??
  "postgresql://postgres:postgres@localhost:5432/tunapuy_test_users";

// Env ANTES de importar los módulos (db.ts crea el cliente con DATABASE_URL).
process.env.DATABASE_URL = TEST_DATABASE_URL;

const repoRoot = path.resolve(__dirname, "../..");
const bin = (name: string) => path.join(repoRoot, "node_modules", ".bin", name);

const PHONE_A = "+580000020001";
const PHONE_B = "+580000020002";
const EMAIL_A = "ana@example.com";
const EMAIL_B = "bruno@example.com";

let db: typeof import("../../src/server/db");
let profileService: typeof import("../../src/server/users/profile-service");

let admin: Client;
let userA: { id: string };
let userB: { id: string };

function dbNameFromUrl(url: string): string {
  return new URL(url).pathname.replace(/^\//, "");
}

async function resetDb(): Promise<void> {
  const name = dbNameFromUrl(TEST_DATABASE_URL);
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${name}"`);
  execFileSync(bin("prisma"), ["migrate", "deploy"], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "pipe",
  });
}

async function seedBase(): Promise<void> {
  userA = await db.db.user.create({
    data: { phoneNumber: PHONE_A, name: "Ana Vendedora", email: EMAIL_A, slug: "ana-test" },
  });
  userB = await db.db.user.create({
    data: { phoneNumber: PHONE_B, name: "Bruno Comprador", email: EMAIL_B, slug: "bruno-test" },
  });
}

beforeAll(async () => {
  admin = new Client({
    connectionString: TEST_DATABASE_URL.replace("/tunapuy_test_users", "/postgres"),
  });
  await admin.connect();
  await resetDb();

  db = await import("../../src/server/db");
  profileService = await import("../../src/server/users/profile-service");
}, 240_000);

afterAll(async () => {
  const name = dbNameFromUrl(TEST_DATABASE_URL);
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.end();
}, 60_000);

beforeEach(async () => {
  // Estado limpio y determinista por test. Orden respetando FK:
  // Product (SetNull/Cascade) → Business (Restrict sobre User) → User.
  await db.db.product.deleteMany({});
  await db.db.business.deleteMany({});
  await db.db.user.deleteMany({});
  await seedBase();
});

describe("updateUserProfile", () => {
  it("cambia name y email", async () => {
    const updated = await profileService.updateUserProfile(userA.id, {
      name: "Ana Nueva",
      email: "ana-nueva@example.com",
    });
    expect(updated.id).toBe(userA.id);
    expect(updated.name).toBe("Ana Nueva");
    expect(updated.email).toBe("ana-nueva@example.com");
  });

  it("email: null limpia el email", async () => {
    const updated = await profileService.updateUserProfile(userA.id, {
      name: "Ana Vendedora",
      email: null,
    });
    expect(updated.email).toBeNull();
  });

  it("email: undefined no toca el email", async () => {
    const updated = await profileService.updateUserProfile(userA.id, { name: "Ana Vendedora" });
    expect(updated.email).toBe(EMAIL_A);
  });

  it("avatarUrl: string se guarda y null lo limpia sin error", async () => {
    await db.db.user.update({
      where: { id: userA.id },
      data: { avatarUrl: "/uploads/users/avatar-viejo.webp" },
    });

    // string → se persiste.
    const withImage = await profileService.updateUserProfile(userA.id, {
      name: "Ana Vendedora",
      avatarUrl: "/uploads/users/avatar-nuevo.webp",
    });
    expect(withImage.avatarUrl).toBe("/uploads/users/avatar-nuevo.webp");

    // null → limpia SIN error (el bug OLD lanzaba aquí).
    const cleared = await profileService.updateUserProfile(userA.id, {
      name: "Ana Vendedora",
      avatarUrl: null,
    });
    expect(cleared.avatarUrl).toBeNull();

    const row = await db.db.user.findUniqueOrThrow({ where: { id: userA.id } });
    expect(row.avatarUrl).toBeNull();
  });

  it("avatarUrl externa → ImagePolicyError (no persiste)", async () => {
    // Defensa en profundidad (H1-SEC): la política de imágenes vive en el
    // SERVICIO. Una URL externa pasa el zod (formato URL válido) pero el
    // servicio la rechaza con mensaje específico y NO persiste nada.
    await expect(
      profileService.updateUserProfile(userA.id, {
        name: "Ana Vendedora",
        avatarUrl: "https://evil.com/x.jpg",
      }),
    ).rejects.toMatchObject({ name: "ImagePolicyError" });

    const row = await db.db.user.findUniqueOrThrow({ where: { id: userA.id } });
    expect(row.avatarUrl).toBeNull();
  });

  it("email duplicado de otro usuario → EmailConflictError", async () => {
    await expect(
      profileService.updateUserProfile(userB.id, { name: "Bruno", email: EMAIL_A }),
    ).rejects.toMatchObject({ name: "EmailConflictError" });
  });

  it("name inválido → UserProfileValidationError", async () => {
    await expect(
      profileService.updateUserProfile(userA.id, { name: "X" }),
    ).rejects.toMatchObject({ name: "UserProfileValidationError" });
  });
});
