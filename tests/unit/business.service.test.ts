// Pruebas de integración del servicio de negocios (business/service.ts) contra
// una BD PostgreSQL AISLADA (tunapuy_test_business; distinta de la de products,
// users y auth para evitar carreras entre archivos de test).
//
// Cubre: createBusiness (crea negocio, un negocio por cuenta, slug generado con
// dedupe, teléfono obligatorio) y updateBusiness (renombrar NO regenera el slug
// — permalink estable, slug explícito ajeno → conflict, slug propio → OK,
// inexistente → not found, descripción/teléfono nullish) y la verificación del
// re-export de BusinessOwnershipError desde products/service (fuente única).

import { execFileSync } from "node:child_process";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL_BUSINESS ??
  "postgresql://postgres:postgres@localhost:5432/tunapuy_test_business";

// Env ANTES de importar los módulos (db.ts crea el cliente con DATABASE_URL).
process.env.DATABASE_URL = TEST_DATABASE_URL;

const repoRoot = path.resolve(__dirname, "../..");
const bin = (name: string) => path.join(repoRoot, "node_modules", ".bin", name);

const PHONE_A = "+580000020001"; // dueño de negocio A
const PHONE_B = "+580000020002"; // dueño de negocio B

let db: typeof import("../../src/server/db");
let businessService: typeof import("../../src/server/business/service");

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
  // Dos usuarios con slug único (columna NOT NULL desde E2).
  userA = await db.db.user.create({
    data: { phoneNumber: PHONE_A, name: "Ana Ventas", slug: "ana-ventas" },
  });
  userB = await db.db.user.create({
    data: { phoneNumber: PHONE_B, name: "Bruno Ventas", slug: "bruno-ventas" },
  });
}

beforeAll(async () => {
  admin = new Client({
    connectionString: TEST_DATABASE_URL.replace("/tunapuy_test_business", "/postgres"),
  });
  await admin.connect();
  await resetDb();

  db = await import("../../src/server/db");
  businessService = await import("../../src/server/business/service");
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

describe("createBusiness", () => {
  it("crea un negocio con slug generado del nombre y datos completos", async () => {
    const result = await businessService.createBusiness(userA.id, {
      name: "Arepera Ana",
      description: "Arepas y desayunos",
      phoneNumber: PHONE_A,
    });
    expect(result.slug).toBe("arepera-ana");
    const biz = await db.db.business.findUniqueOrThrow({ where: { id: result.id } });
    expect(biz.name).toBe("Arepera Ana");
    expect(biz.description).toBe("Arepas y desayunos");
    expect(biz.phoneNumber).toBe(PHONE_A);
    expect(biz.ownerId).toBe(userA.id);
  });

  it("un negocio por cuenta: el segundo create falla con BusinessValidationError", async () => {
    await businessService.createBusiness(userA.id, { name: "Mi Negocio", phoneNumber: PHONE_A });
    await expect(
      businessService.createBusiness(userA.id, { name: "Otro Negocio", phoneNumber: PHONE_A }),
    ).rejects.toMatchObject({
      name: "BusinessValidationError",
      message: "Ya tienes un negocio creado",
    });
  });

  it("dedupe de slug con nombres repetidos (ana-ventas, ana-ventas-2)", async () => {
    const first = await businessService.createBusiness(userA.id, {
      name: "Ana Ventas",
      phoneNumber: PHONE_A,
    });
    const second = await businessService.createBusiness(userB.id, {
      name: "Ana Ventas",
      phoneNumber: PHONE_B,
    });
    expect(first.slug).toBe("ana-ventas");
    expect(second.slug).toBe("ana-ventas-2");
  });

  it("el teléfono del negocio es obligatorio", async () => {
    await expect(
      businessService.createBusiness(userA.id, { name: "Sin Teléfono" } as never),
    ).rejects.toMatchObject({ name: "BusinessValidationError" });
  });
});

describe("updateBusiness", () => {
  it("renombrar NO regenera el slug (permalink estable)", async () => {
    const created = await businessService.createBusiness(userA.id, {
      name: "Nombre Viejo",
      phoneNumber: PHONE_A,
    });
    expect(created.slug).toBe("nombre-viejo");

    await businessService.updateBusiness(userA.id, { name: "Nombre Nuevo" });

    const biz = await db.db.business.findUniqueOrThrow({ where: { id: created.id } });
    expect(biz.name).toBe("Nombre Nuevo");
    expect(biz.slug).toBe("nombre-viejo");
  });

  it("slug explícito en uso por OTRO negocio → BusinessSlugConflictError", async () => {
    await businessService.createBusiness(userA.id, {
      name: "Negocio A",
      slug: "slug-tomado",
      phoneNumber: PHONE_A,
    });
    await businessService.createBusiness(userB.id, { name: "Negocio B", phoneNumber: PHONE_B });

    await expect(
      businessService.updateBusiness(userB.id, { slug: "slug-tomado" }),
    ).rejects.toMatchObject({ name: "BusinessSlugConflictError" });
  });

  it("slug explícito propio → OK (el dueño puede reasignarlo)", async () => {
    const created = await businessService.createBusiness(userA.id, {
      name: "Mi Negocio",
      phoneNumber: PHONE_A,
    });
    const updated = await businessService.updateBusiness(userA.id, {
      slug: "mi-slug-personalizado",
    });
    expect(updated.id).toBe(created.id);
    expect(updated.slug).toBe("mi-slug-personalizado");
  });

  it("negocio inexistente → BusinessNotFoundError", async () => {
    await expect(
      businessService.updateBusiness(userA.id, { name: "Sin Negocio" }),
    ).rejects.toMatchObject({ name: "BusinessNotFoundError" });
  });

  it("descripción y teléfono nullish se guardan como null", async () => {
    const created = await businessService.createBusiness(userA.id, {
      name: "Con Datos",
      description: "Descripción",
      phoneNumber: PHONE_A,
    });

    await businessService.updateBusiness(userA.id, { description: null, phoneNumber: null });

    const biz = await db.db.business.findUniqueOrThrow({ where: { id: created.id } });
    expect(biz.description).toBeNull();
    expect(biz.phoneNumber).toBeNull();
  });

  it("logoUrl: string propio se guarda y null lo limpia sin error", async () => {
    const created = await businessService.createBusiness(userA.id, {
      name: "Con Logo",
      phoneNumber: PHONE_A,
    });

    // string → upload propio se persiste. businessLogoUrlSchema exige URL
    // absoluta (`.url()`), así que se usa la URL absoluta del mismo origen
    // (APP_URL default http://localhost:3000).
    await businessService.updateBusiness(userA.id, {
      logoUrl: "http://localhost:3000/uploads/businesses/logo-nuevo.webp",
    });
    const withLogo = await db.db.business.findUniqueOrThrow({ where: { id: created.id } });
    expect(withLogo.logoUrl).toBe("http://localhost:3000/uploads/businesses/logo-nuevo.webp");

    // null → limpia SIN error.
    await businessService.updateBusiness(userA.id, { logoUrl: null });
    const cleared = await db.db.business.findUniqueOrThrow({ where: { id: created.id } });
    expect(cleared.logoUrl).toBeNull();
  });

  it("logoUrl inválida (javascript:) → ImagePolicyError (no persiste)", async () => {
    // Defensa en profundidad (H1-SEC): el zod acepta `javascript:` como URL
    // válida; la política de imágenes en el SERVICIO la rechaza con error
    // controlado y NO persiste nada.
    const created = await businessService.createBusiness(userA.id, {
      name: "Sin Logo",
      phoneNumber: PHONE_A,
    });

    await expect(
      businessService.updateBusiness(userA.id, { logoUrl: "javascript:alert(1)" }),
    ).rejects.toMatchObject({ name: "ImagePolicyError" });

    const biz = await db.db.business.findUniqueOrThrow({ where: { id: created.id } });
    expect(biz.logoUrl).toBeNull();
  });

  it("BusinessOwnershipError se re-exporta desde products/service (fuente única)", async () => {
    const productsService = await import("../../src/server/products/service");
    expect(productsService.BusinessOwnershipError).toBe(
      businessService.BusinessOwnershipError,
    );
  });
});
