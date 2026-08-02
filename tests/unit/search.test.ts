// Pruebas de las utilidades puras de /buscar (src/lib/search.ts).
// - toSingleSearchParam: params repetidos de Next.js (?q=a&q=b) no deben tirar 500.
// - escapeLikeWildcards: "%" y "_" no deben actuar como comodines de ILIKE.

import { describe, expect, it } from "vitest";
import { escapeLikeWildcards, toSingleSearchParam } from "../../src/lib/search";

describe("toSingleSearchParam", () => {
  it("devuelve el string tal cual cuando viene un único valor", () => {
    expect(toSingleSearchParam("arepa")).toBe("arepa");
    expect(toSingleSearchParam("")).toBe("");
  });

  it("toma el primer valor cuando Next.js entrega un array (?q=a&q=b)", () => {
    expect(toSingleSearchParam(["a", "b"])).toBe("a");
    expect(toSingleSearchParam(["comida", "ropa"])).toBe("comida");
  });

  it("devuelve undefined cuando el parámetro no está presente", () => {
    expect(toSingleSearchParam(undefined)).toBeUndefined();
  });

  it("maneja arrays vacíos sin romper", () => {
    expect(toSingleSearchParam([])).toBeUndefined();
  });
});

describe("escapeLikeWildcards", () => {
  it("escapa % y _ para que no matcheen todo", () => {
    expect(escapeLikeWildcards("%")).toBe("\\%");
    expect(escapeLikeWildcards("_")).toBe("\\_");
    expect(escapeLikeWildcards("100%")).toBe("100\\%");
    expect(escapeLikeWildcards("a_b")).toBe("a\\_b");
  });

  it("escapa la barra invertida y no toca texto normal", () => {
    expect(escapeLikeWildcards("\\")).toBe("\\\\");
    expect(escapeLikeWildcards("arepa")).toBe("arepa");
    expect(escapeLikeWildcards("Arepa Reina Pepiada")).toBe("Arepa Reina Pepiada");
    expect(escapeLikeWildcards("")).toBe("");
  });

  it("combina caracteres especiales en una sola cadena", () => {
    expect(escapeLikeWildcards("%_a\\b%")).toBe("\\%\\_a\\\\b\\%");
  });
});
