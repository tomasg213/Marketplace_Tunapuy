// Configuración de Prisma (Prisma 7).
// Carga las variables de entorno desde `.env` y define dónde viven el esquema,
// las migraciones y el comando de seed. Más info: https://pris.ly/d/prisma-config
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Fallback local para que `prisma generate`/`migrate` funcionen sin .env.
    url: process.env["DATABASE_URL"] ?? "postgresql://postgres:postgres@localhost:5432/tunapuy",
  },
});
