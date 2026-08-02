// Validación de variables de entorno al arrancar (docs/architecture.md §5).
// Fail-fast: si falta lo crítico (DATABASE_URL), el proceso falla temprano
// en lugar de propagar errores raros. Solo se importa desde el servidor.
import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatoria"),

  // Tasa BCV (dolarapi)
  BCV_RATE_API_URL: z
    .string()
    .url()
    .default("https://ve.dolarapi.com/v1/dolares/oficial"),
  BCV_RATE_TTL_HOURS: z.coerce.number().int().positive().default(6),
  BCV_RATE_TTL_MEMORY_MINUTES: z.coerce.number().int().positive().default(10),
  BCV_RATE_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  BCV_RATE_FALLBACK: z.string().optional().default(""),
});

export const env = EnvSchema.parse(process.env);

export type Env = z.infer<typeof EnvSchema>;
