// Pruebas de integración del CRUD de productos (products/service.ts) contra una
// BD PostgreSQL AISLADA (tunapuy_test_products; distinta de la del seed y de la
// de auth para evitar carreras entre archivos de test).
//
// Cubre (docs/architecture.md §11.5): validación, ownership (solo el dueño),
// slug generado del título con dedupe, publishedAt al publicar, paso a SELLER,
// estados (incluye SOLD), filtros de /mis-publicaciones, business ownership y
// borrado.

import { execFileSync } from "node:child_process";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CATEGORIES, PRODUCT_STATUS, USER_ROLE } from "../../src/lib/constants";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL_PRODUCTS ??
  "postgresql://postgres:postgres@localhost:5432/tunapuy_test_products";

// Env ANTES de importar los módulos (db.ts crea el cliente con DATABASE_URL).
process.env.DATABASE_URL = TEST_DATABASE_URL;

const repoRoot = path.resolve(__dirname, "../..");
const bin = (name: string) => path.join(repoRoot, "node_modules", ".bin", name);

const PHONE_A = "+580000020001"; // vendedor
const PHONE_B = "+580000020002"; // otro usuario (sin ser dueño)

let db: typeof import("../../src/server/db");
let service: typeof import("../../src/server/products/service");

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
  // Categorías fijas (idempotente).
  for (const category of CATEGORIES) {
    await db.db.category.upsert({
      where: { slug: category.slug },
      update: {},
      create: { slug: category.slug, name: category.name, position: category.position },
    });
  }

  // Dos usuarios con slug único (columna NOT NULL desde E2).
  userA = await db.db.user.create({
    data: { phoneNumber: PHONE_A, name: "Ana Vendedora", role: USER_ROLE.SELLER, slug: "ana-vendedora" },
  });
  userB = await db.db.user.create({
    data: { phoneNumber: PHONE_B, name: "Bruno Comprador", role: USER_ROLE.BUYER, slug: "bruno-comprador" },
  });
}

beforeAll(async () => {
  admin = new Client({ connectionString: TEST_DATABASE_URL.replace("/tunapuy_test_products", "/postgres") });
  await admin.connect();
  await resetDb();

  db = await import("../../src/server/db");
  service = await import("../../src/server/products/service");
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

describe("createProductRecord", () => {
  it("crea un producto ACTIVE con slug generado del título y publishedAt", async () => {
    const { product } = await service.createProductRecord(userA.id, {
      title: "Empanadas de Queso",
      categorySlugs: ["comida"],
      priceUsd: 3.5,
      phoneNumber: PHONE_A,
      status: "ACTIVE",
    });
    expect(product.slug).toBe("empanadas-de-queso");
    expect(product.status).toBe(PRODUCT_STATUS.ACTIVE);
    expect(product.publishedAt).toBeInstanceOf(Date);
    expect(product.priceUsd.toString()).toBe("3.5");
    expect(product.sellerId).toBe(userA.id);
  });

  it("crea un borrador DRAFT sin publishedAt", async () => {
    const { product } = await service.createProductRecord(userA.id, {
      title: "Borrador en proceso",
      categorySlugs: ["ropa"],
      priceUsd: 10,
      phoneNumber: PHONE_A,
      status: "DRAFT",
    });
    expect(product.status).toBe(PRODUCT_STATUS.DRAFT);
    expect(product.publishedAt).toBeNull();
  });

  it("deduplica slugs con títulos repetidos (x, x-2, x-3)", async () => {
    const base = "Chicha de Arroz";
    const first = await service.createProductRecord(userA.id, {
      title: base, categorySlugs: ["comida"], priceUsd: 2, phoneNumber: PHONE_A, status: "DRAFT",
    });
    const second = await service.createProductRecord(userA.id, {
      title: base, categorySlugs: ["comida"], priceUsd: 2, phoneNumber: PHONE_A, status: "DRAFT",
    });
    expect(first.product.slug).toBe("chicha-de-arroz");
    expect(second.product.slug).toBe("chicha-de-arroz-2");
  });

  it("respeta un slug explícito si se provee", async () => {
    const { product } = await service.createProductRecord(userA.id, {
      title: "Mi producto",
      slug: "mi-producto-personalizado",
      categorySlugs: ["licor"],
      priceUsd: 20,
      phoneNumber: PHONE_A,
      status: "DRAFT",
    });
    expect(product.slug).toBe("mi-producto-personalizado");
  });

  it("valida el precio de oferta (debe ser menor al regular)", async () => {
    await expect(
      service.createProductRecord(userA.id, {
        title: "Oferta inválida",
        categorySlugs: ["comida"],
        priceUsd: 10,
        offerPriceUsd: 12,
        phoneNumber: PHONE_A,
        status: "ACTIVE",
      }),
    ).rejects.toMatchObject({ name: "ProductValidationError" });
  });

  it("valida precio ≤ 0", async () => {
    await expect(
      service.createProductRecord(userA.id, {
        title: "Gratis",
        categorySlugs: ["comida"],
        priceUsd: 0,
        phoneNumber: PHONE_A,
        status: "ACTIVE",
      }),
    ).rejects.toMatchObject({ name: "ProductValidationError" });
  });

  it("rechaza una categoría desconocida", async () => {
    await expect(
      service.createProductRecord(userA.id, {
        title: "Categoría rara",
        categorySlugs: ["mascotas"] as never,
        priceUsd: 5,
        phoneNumber: PHONE_A,
        status: "DRAFT",
      }),
    ).rejects.toMatchObject({ name: "ProductValidationError" });
  });
});

describe("updateProductRecord", () => {
  it("solo el dueño puede editar (ownership)", async () => {
    const { product } = await service.createProductRecord(userA.id, {
      title: "Propiedad de Ana", categorySlugs: ["comida"], priceUsd: 5, phoneNumber: PHONE_A, status: "DRAFT",
    });
    await expect(
      service.updateProductRecord(userB.id, product.id, { title: "Robado" }),
    ).rejects.toMatchObject({ name: "ProductOwnershipError" });
  });

  it("edita parcialmente y cambia a SOLD", async () => {
    const { product } = await service.createProductRecord(userA.id, {
      title: "Antes", categorySlugs: ["comida"], priceUsd: 5, phoneNumber: PHONE_A, status: "ACTIVE",
    });
    const { product: updated } = await service.updateProductRecord(userA.id, product.id, {
      title: "Después",
      status: PRODUCT_STATUS.SOLD,
    });
    expect(updated.title).toBe("Después");
    expect(updated.status).toBe(PRODUCT_STATUS.SOLD);
    // SOLD no borra la fecha de publicación ni la vuelve a tocar.
    expect(updated.publishedAt).not.toBeNull();
  });

  it("not found: id inexistente", async () => {
    await expect(
      service.updateProductRecord(userA.id, "id-que-no-existe", { title: "Xxx" }),
    ).rejects.toMatchObject({ name: "ProductNotFoundError" });
  });
});

describe("setProductStatusRecord", () => {
  it("publicar un borrador fija publishedAt y promueve al usuario a SELLER", async () => {
    const { product } = await service.createProductRecord(userB.id, {
      title: "Desde comprador", categorySlugs: ["zapatos"], priceUsd: 30, phoneNumber: PHONE_B, status: "DRAFT",
    });
    expect(product.publishedAt).toBeNull();

    await service.setProductStatusRecord(userB.id, product.id, PRODUCT_STATUS.ACTIVE);

    const published = await db.db.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(published.status).toBe(PRODUCT_STATUS.ACTIVE);
    expect(published.publishedAt).toBeInstanceOf(Date);

    const user = await db.db.user.findUniqueOrThrow({ where: { id: userB.id } });
    expect(user.role).toBe(USER_ROLE.SELLER);
  });

  it("solo el dueño cambia el estado", async () => {
    const { product } = await service.createProductRecord(userA.id, {
      title: "Estado de Ana", categorySlugs: ["perfume"], priceUsd: 9, phoneNumber: PHONE_A, status: "DRAFT",
    });
    await expect(
      service.setProductStatusRecord(userB.id, product.id, PRODUCT_STATUS.ACTIVE),
    ).rejects.toMatchObject({ name: "ProductOwnershipError" });
  });
});

describe("business ownership", () => {
  it("permite publicar bajo el negocio propio y rechaza negocios ajenos", async () => {
    const businessA = await db.db.business.create({
      data: {
        slug: "negocio-de-ana",
        name: "Negocio de Ana",
        phoneNumber: PHONE_A,
        ownerId: userA.id,
      },
    });

    const ok = await service.createProductRecord(userA.id, {
      title: "Del negocio propio",
      categorySlugs: ["comida"],
      priceUsd: 5,
      phoneNumber: PHONE_A,
      status: "ACTIVE",
      businessId: businessA.id,
    });
    expect(ok.product.businessId).toBe(businessA.id);

    await expect(
      service.createProductRecord(userB.id, {
        title: "Del negocio ajeno",
        categorySlugs: ["comida"],
        priceUsd: 5,
        phoneNumber: PHONE_B,
        status: "DRAFT",
        businessId: businessA.id,
      }),
    ).rejects.toMatchObject({ name: "BusinessOwnershipError" });
  });
});

describe("R10: estados, transiciones y slug único", () => {
  it("un producto sin status se crea como DRAFT (nunca ACTIVE por omisión)", async () => {
    const { product } = await service.createProductRecord(userA.id, {
      title: "Sin estado explícito",
      categorySlugs: ["comida"],
      priceUsd: 5,
      phoneNumber: PHONE_A,
    });
    expect(product.status).toBe(PRODUCT_STATUS.DRAFT);
    expect(product.publishedAt).toBeNull();
  });

  it("R10: un producto ARCHIVED no es editable salvo reactivación", async () => {
    const { product } = await service.createProductRecord(userA.id, {
      title: "A archivar", categorySlugs: ["comida"], priceUsd: 5, phoneNumber: PHONE_A, status: "ACTIVE",
    });
    await service.setProductStatusRecord(userA.id, product.id, PRODUCT_STATUS.ARCHIVED);

    // Editar contenido de un archivado → ProductValidationError.
    await expect(
      service.updateProductRecord(userA.id, product.id, { title: "Editado" }),
    ).rejects.toMatchObject({ name: "ProductValidationError" });

    // Solo el status (reactivación) está permitido.
    await service.updateProductRecord(userA.id, product.id, { status: PRODUCT_STATUS.ACTIVE });
    const reactivated = await db.db.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(reactivated.status).toBe(PRODUCT_STATUS.ACTIVE);
  });

  it("R10: transiciones inválidas se rechazan (ARCHIVED → PAUSED)", async () => {
    const { product } = await service.createProductRecord(userA.id, {
      title: "Transición", categorySlugs: ["comida"], priceUsd: 5, phoneNumber: PHONE_A, status: "DRAFT",
    });
    await service.setProductStatusRecord(userA.id, product.id, PRODUCT_STATUS.ARCHIVED);
    await expect(
      service.setProductStatusRecord(userA.id, product.id, PRODUCT_STATUS.PAUSED),
    ).rejects.toMatchObject({ name: "ProductValidationError" });
  });

  it("R10: colisión de slug explícito → ProductSlugConflictError (409)", async () => {
    await service.createProductRecord(userA.id, {
      title: "Primero", slug: "mi-slug", categorySlugs: ["comida"], priceUsd: 5, phoneNumber: PHONE_A,
    });
    await expect(
      service.createProductRecord(userA.id, {
        title: "Segundo", slug: "mi-slug", categorySlugs: ["comida"], priceUsd: 5, phoneNumber: PHONE_A,
      }),
    ).rejects.toMatchObject({ name: "ProductSlugConflictError" });
  });
});

describe("deleteProductRecord y getMyProducts", () => {
  it("elimina solo el dueño (borrado del registro)", async () => {
    const { product } = await service.createProductRecord(userA.id, {
      title: "A borrar", categorySlugs: ["comida"], priceUsd: 5, phoneNumber: PHONE_A, status: "DRAFT",
    });
    await expect(service.deleteProductRecord(userB.id, product.id)).rejects.toMatchObject({
      name: "ProductOwnershipError",
    });
    await service.deleteProductRecord(userA.id, product.id);
    await expect(db.db.product.findUnique({ where: { id: product.id } })).resolves.toBeNull();
  });

  it("getMyProducts filtra por estado y solo del usuario", async () => {
    const draft = await service.createProductRecord(userA.id, {
      title: "Draft de Ana", categorySlugs: ["automotriz"], priceUsd: 100, phoneNumber: PHONE_A, status: "DRAFT",
    });
    const active = await service.createProductRecord(userA.id, {
      title: "Activa de Ana", categorySlugs: ["comida"], priceUsd: 5, phoneNumber: PHONE_A, status: "ACTIVE",
    });
    await service.createProductRecord(userB.id, {
      title: "De Bruno", categorySlugs: ["comida"], priceUsd: 5, phoneNumber: PHONE_B, status: "ACTIVE",
    });

    const onlyActive = await service.getMyProducts(userA.id, PRODUCT_STATUS.ACTIVE);
    expect(onlyActive.map((p) => p.id)).toEqual([active.product.id]);

    const all = await service.getMyProducts(userA.id, "ALL");
    expect(all.map((p) => p.id).sort()).toEqual([draft.product.id, active.product.id].sort());
  });
});
