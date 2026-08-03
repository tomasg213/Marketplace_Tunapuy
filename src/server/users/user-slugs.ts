// Backfill de `User.slug` para usuarios existentes (Épica E2).
//
// `User.slug` (único) se añadió en la migración `add_user_slug` como columna
// nullable (para que Postgres permita múltiples NULL) y se rellena aquí con
// slugify + dedupe. Después, la migración `user_slug_required` la pasa a
// NOT NULL. La función es idempotente: solo toca usuarios con slug NULL.
import type { PrismaClient } from "../../../generated/prisma/client";
import { uniqueSlug } from "../../lib/slug";

/**
 * Asigna slugs únicos a todos los usuarios con `slug = NULL`.
 * Devuelve el número de usuarios actualizados. Idempotente.
 */
export async function backfillUserSlugs(db: PrismaClient): Promise<number> {
  // Una sola lectura y el filtrado en JS (evita la sintaxis `{ equals: null }`
  // del cliente generado y es más legible para un backfill puntual).
  const users = await db.user.findMany({ select: { id: true, name: true, slug: true } });
  const pending = users.filter((user) => user.slug === null);

  const taken = new Set<string>();
  for (const row of users) {
    if (row.slug) taken.add(row.slug);
  }

  let updated = 0;
  for (const user of pending) {
    const slug = uniqueSlug(user.name, taken);
    await db.user.update({ where: { id: user.id }, data: { slug } });
    taken.add(slug);
    updated += 1;
  }
  return updated;
}
