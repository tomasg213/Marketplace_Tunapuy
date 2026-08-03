import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    // Env por defecto ANTES de cargar módulos: `env.ts` valida fail-fast y
    // `db.ts` crea el cliente con DATABASE_URL. Los tests que usan BD aisladas
    // sobreescriben DATABASE_URL en tiempo de módulo (antes del import dinámico).
    env: {
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/tunapuy_test_default",
      AUTH_SECRET: "test-secret-0123456789abcdefghijklmnopqrstuv",
      NODE_ENV: "development",
    },
  },
});
