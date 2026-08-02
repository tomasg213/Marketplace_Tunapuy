// Pruebas del seed (prisma/seed.ts) contra una BD PostgreSQL AISLADA.
//
// Aislamiento (regla: tests deterministas, sin tocar datos de dev):
//   - Usa TEST_DATABASE_URL (o deriva tunapuy_test de DATABASE_URL).
//   - Crea la BD de prueba, corre `prisma migrate deploy` y el seed N veces.
//   - Al terminar, DROP DATABASE de la BD de prueba.
//
// Requiere un PostgreSQL disponible (docker-compose o local) y el binario de
// `prisma`/`tsx` (node_modules/.bin). No golpea ninguna API externa.

import { execFileSync } from "node:child_process";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/tunapuy_test";

const repoRoot = path.resolve(__dirname, "../..");
const bin = (name: string) => path.join(repoRoot, "node_modules", ".bin", name);

function dbNameFromUrl(url: string): string {
  return new URL(url).pathname.replace(/^\//, "");
}

/** URL de administración (conecta a la BD 'postgres' para crear/borrar). */
function adminUrl(url: string): string {
  const u = new URL(url);
  u.pathname = "/postgres";
  return u.toString();
}

let admin: Client;

function runSeed(mode: "mock" | "real"): void {
  execFileSync(bin("tsx"), ["prisma/seed.ts"], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL, DATA_MODE: mode },
    stdio: "pipe",
  });
}

function runMigrations(): void {
  execFileSync(bin("prisma"), ["migrate", "deploy"], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "pipe",
  });
}

async function resetDb(): Promise<void> {
  const name = dbNameFromUrl(TEST_DATABASE_URL);
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${name}"`);
  runMigrations();
}

async function tableCount(table: string): Promise<number> {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  try {
    await client.connect();
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM "${table}"`,
    );
    return rows[0].n;
  } finally {
    await client.end();
  }
}

async function counts() {
  const [categories, products, users, businesses] = await Promise.all([
    tableCount("Category"),
    tableCount("Product"),
    tableCount("User"),
    tableCount("Business"),
  ]);
  return { categories, products, users, businesses };
}

async function productsPerCategory(): Promise<Record<string, number>> {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  try {
    await client.connect();
    const { rows } = await client.query<{ slug: string; n: number }>(
      `SELECT c.slug AS slug, count(p.id)::int AS n
         FROM "Category" c
         LEFT JOIN "Product" p ON p."categoryId" = c.id
        GROUP BY c.slug`,
    );
    return Object.fromEntries(rows.map((r) => [r.slug, r.n]));
  } finally {
    await client.end();
  }
}

beforeAll(async () => {
  admin = new Client({ connectionString: adminUrl(TEST_DATABASE_URL) });
  await admin.connect();
  await resetDb();
}, 240_000);

afterAll(async () => {
  const name = dbNameFromUrl(TEST_DATABASE_URL);
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.end();
}, 60_000);

describe("seed — DATA_MODE=mock (BD aislada)", () => {
  it("es idempotente: 2 ejecuciones → mismos conteos (6 categorías, 13 productos)", async () => {
    runSeed("mock");
    const first = await counts();
    runSeed("mock");
    const second = await counts();
    expect(second).toEqual(first);
    expect(first).toEqual({ categories: 6, products: 13, users: 6, businesses: 6 });
  }, 240_000);

  it("crea ≥1 producto por cada categoría fija", async () => {
    const perCat = await productsPerCategory();
    for (const slug of ["comida", "ropa", "zapatos", "perfume", "automotriz", "licor"]) {
      expect(perCat[slug] ?? 0, `categoría ${slug} sin productos`).toBeGreaterThanOrEqual(1);
    }
    // Automotriz tiene 3 (incluye 1 borrador DRAFT); las demás 2.
    expect(perCat.automotriz).toBeGreaterThanOrEqual(2);
  }, 60_000);
});

describe("seed — DATA_MODE=real (BD aislada)", () => {
  it("no crea datos ficticios y también es idempotente", async () => {
    await resetDb();
    runSeed("real");
    const first = await counts();
    runSeed("real");
    const second = await counts();
    expect(second).toEqual(first);
    // Solo el catálogo base: categorías; cero vendedores/productos/negocios ficticios.
    expect(first).toEqual({ categories: 6, products: 0, users: 0, businesses: 0 });
  }, 240_000);
});
