// Slug de vendedor persona (docs/design-system.md §6: /vendedores/[slug]).
// User no tiene columna slug en el schema (E0): se deriva de User.name.
// Limitación conocida: colisiones de nombre → se resuelve en una migración futura
// (User.slug único). Para el volumen local del MVP el lookup en JS es aceptable.
export function slugifyName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
