// Utilidades de slugs (kebab-case, sin acentos) — compartidas por cliente y servidor.
//
// E0: `/vendedores/[slug]` derivaba el slug de User.name (slugifyName) porque el
// schema aún no tenía User.slug. E2 añade `User.slug` (único) y estos helpers
// pasan a generar slugs deterministas + dedupe para el backfill y el registro.

/**
 * Slugify genérico (kebab-case): normaliza a ASCII (quita acentos), minúsculas,
 * dígitos y guiones. Ej.: "Arepa Reina Pepiada" → "arepa-reina-pepiada".
 */
export function slugify(input: string): string {
  const slug = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return slug || "item";
}

/**
 * Alias histórico (E0): /vendedores/[slug] y tarjetas usaban slugifyName.
 * Mantenido por compatibilidad; el código nuevo debe usar User.slug.
 */
export function slugifyName(name: string): string {
  return slugify(name);
}

/**
 * Slug único dado un base: si el base ya está tomado, añade sufijo `-2`, `-3`, …
 * `existing` son los slugs YA reservados (de la BD o del batch en curso).
 */
export function uniqueSlug(base: string, existing: Iterable<string>): string {
  const taken = new Set(existing);
  const candidate = slugify(base);
  if (!taken.has(candidate)) return candidate;
  let suffix = 2;
  while (taken.has(`${candidate}-${suffix}`)) suffix += 1;
  return `${candidate}-${suffix}`;
}
