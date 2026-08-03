// Pruebas de utilidades de slugs (src/lib/slug.ts) — Épica E2.
// Cubre: slugify (kebab-case, sin acentos), slugifyName (alias legacy E0),
// uniqueSlug (dedupe "-2", "-3", …) usado por el backfill de User.slug y por
// el slug de producto generado del título.
import { describe, expect, it } from "vitest";
import { slugify, slugifyName, uniqueSlug } from "../../src/lib/slug";

describe("slugify", () => {
  it("convierte a kebab-case ASCII en minúsculas", () => {
    expect(slugify("Arepa Reina Pepiada")).toBe("arepa-reina-pepiada");
    expect(slugify("Empanadas de Carne")).toBe("empanadas-de-carne");
  });

  it("elimina acentos (NFD)", () => {
    expect(slugify("Árbol de Navidad")).toBe("arbol-de-navidad");
    expect(slugify("José María")).toBe("jose-maria");
  });

  it("colapsa separadores repetidos y recorta extremos", () => {
    expect(slugify("  Pan   con   Jamón  ")).toBe("pan-con-jamon");
    expect(slugify("--Hola--Mundo--")).toBe("hola-mundo");
  });

  it("elimina caracteres no alfanuméricos", () => {
    expect(slugify("Precio: $25.00 (oferta!)")).toBe("precio-25-00-oferta");
    expect(slugify("Café #3")).toBe("cafe-3");
  });

  it("normaliza 'ñ' a 'n' (descomposición NFD)", () => {
    expect(slugify("ñ")).toBe("n");
    expect(slugify("Ñandú")).toBe("nandu");
  });

  it("devuelve 'item' si el resultado queda vacío", () => {
    expect(slugify("")).toBe("item");
    expect(slugify("!!!")).toBe("item");
    expect(slugify("😀")).toBe("item");
  });

  it("trunca a 80 caracteres sin dejar guiones finales", () => {
    const long = "x".repeat(120);
    expect(slugify(long).length).toBeLessThanOrEqual(80);
    expect(slugify(`${long}---`).endsWith("-")).toBe(false);
  });
});

describe("slugifyName (legacy E0)", () => {
  it("es un alias de slugify (compatibilidad con vendedores/[slug] previo)", () => {
    expect(slugifyName("Ana Pérez")).toBe(slugify("Ana Pérez"));
  });
});

describe("uniqueSlug", () => {
  it("devuelve el slug base si está libre", () => {
    expect(uniqueSlug("arepa", [])).toBe("arepa");
    expect(uniqueSlug("arepa", ["empanada"])).toBe("arepa");
  });

  it("añade -2 si el base está tomado", () => {
    expect(uniqueSlug("arepa", ["arepa"])).toBe("arepa-2");
  });

  it("incrementa el sufijo hasta encontrar uno libre", () => {
    expect(uniqueSlug("arepa", ["arepa", "arepa-2", "arepa-3"])).toBe("arepa-4");
  });

  it("tolera nombres repetidos en el batch (backfill): misma base → sufijos únicos", () => {
    const taken = new Set<string>();
    const slugA = uniqueSlug("Usuario 1234", taken);
    taken.add(slugA);
    const slugB = uniqueSlug("Usuario 1234", taken);
    expect(slugA).toBe("usuario-1234");
    expect(slugB).toBe("usuario-1234-2");
  });
});
