// Singleton de Prisma Client (docs/architecture.md §1.1).
// Prisma 7 exige un driver adapter (`@prisma/adapter-pg`).
// SOLO importable desde Server Components / Route Handlers / scripts (seed).
import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL no está definida (revisa tu .env)");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const db: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

// En dev, reutiliza la misma instancia entre recargas de Next.js (hot reload).
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
