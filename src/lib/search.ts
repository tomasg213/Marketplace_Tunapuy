// Utilidades puras para la página /buscar (Épica E1).
// - toSingleSearchParam: normaliza searchParams de Next.js (string | string[])
//   ante parámetros repetidos (?q=a&q=b → no debe tirar 500).
// - escapeLikeWildcards: escapa comodines de LIKE/ILIKE de PostgreSQL
//   (% y _) para que buscar "%" o "_" no devuelva todo el catálogo.
// Módulo puro: se testea en tests/unit/search.test.ts.

export function toSingleSearchParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function escapeLikeWildcards(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
