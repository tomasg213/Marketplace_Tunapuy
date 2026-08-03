// Script único de backfill de `User.slug` (Épica E2).
//
// Uso: `npx tsx prisma/backfill-user-slugs.ts`
//   → asigna slugs únicos (slugify + dedupe) a todos los usuarios con slug NULL.
//   → idempotente: ejecutable N veces; después corre la migración
//     `user_slug_required` (NOT NULL + unique) que ya está versionada.
//
// En dev: `npm run db:migrate` (o `prisma migrate deploy`) + este script.
// En CI/prod: `prisma migrate deploy` + este script antes de arrancar (el seed
// de DATA_MODE=mock ya rellena slugs de los vendedores ficticios).
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { backfillUserSlugs } from "../src/server/users/user-slugs";

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL no está definida (revisa tu .env)");
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const updated = await backfillUserSlugs(prisma);
    console.log(`Backfill de User.slug completado: ${updated} usuario(s) actualizado(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Backfill falló:", err);
  process.exitCode = 1;
});
