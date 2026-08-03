// Pruebas de los validadores de productos (src/server/products/validators.ts).
// Reglas (roadmap E1 + épica E3): priceUsd > 0, offerPriceUsd opcional < priceUsd,
// phoneNumber E.164, categorySlugs ∈ 13 categorías (1–3 por producto), slug kebab-case.

import { describe, expect, it } from "vitest";
import { CATEGORIES } from "../../src/lib/constants";
import {
  categorySlugSchema,
  createProductSchema,
  e164PhoneSchema,
  priceUsdSchema,
  productSlugSchema,
  productStatusSchema,
} from "../../src/server/products/validators";

describe("priceUsdSchema", () => {
  it("acepta montos > 0 (número o string)", () => {
    expect(priceUsdSchema.parse(25)).toBe(25);
    expect(priceUsdSchema.parse("25.50")).toBe(25.5);
    expect(priceUsdSchema.parse("0.01")).toBe(0.01);
    expect(priceUsdSchema.parse("99999999.99")).toBe(99_999_999.99);
  });

  it("rechaza 0, negativos, vacíos y no numéricos", () => {
    expect(() => priceUsdSchema.parse(0)).toThrow();
    expect(() => priceUsdSchema.parse(-5)).toThrow();
    expect(() => priceUsdSchema.parse("")).toThrow();
    expect(() => priceUsdSchema.parse("abc")).toThrow();
    expect(() => priceUsdSchema.parse(null)).toThrow();
  });

  it("rechaza montos que desbordan Decimal(10,2)", () => {
    expect(() => priceUsdSchema.parse("100000000")).toThrow();
    expect(() => priceUsdSchema.parse("100000000.00")).toThrow();
  });
});

describe("e164PhoneSchema (R6: solo teléfonos venezolanos)", () => {
  it("acepta E.164 venezolanos: +58412…, mocks +58 000… y formato local 0412…", () => {
    expect(e164PhoneSchema.parse("+584120000000")).toBe("+584120000000");
    expect(e164PhoneSchema.parse("+580000000001")).toBe("+580000000001");
    // El formato local 0412… se normaliza a +58412… (R6).
    expect(e164PhoneSchema.parse("04121234567")).toBe("+584121234567");
  });

  it("rechaza sin '+', con letras, muy corto o muy largo", () => {
    expect(() => e164PhoneSchema.parse("584120000000")).toThrow();
    expect(() => e164PhoneSchema.parse("+58412abc")).toThrow();
    expect(() => e164PhoneSchema.parse("+58412")).toThrow();
    expect(() => e164PhoneSchema.parse("+58412000000000000")).toThrow();
    expect(() => e164PhoneSchema.parse("")).toThrow();
  });

  it("R6: rechaza prefijos de país que NO son Venezuela (+1, +34, +0…)", () => {
    expect(() => e164PhoneSchema.parse("+12345678901")).toThrow();
    expect(() => e164PhoneSchema.parse("+34123456789")).toThrow();
    expect(() => e164PhoneSchema.parse("+0123456789")).toThrow();
  });
});

describe("categorySlugSchema", () => {
  it("acepta las 13 categorías fijas", () => {
    for (const cat of CATEGORIES) {
      expect(categorySlugSchema.parse(cat.slug)).toBe(cat.slug);
    }
  });

  it("rechaza slugs desconocidos o vacíos", () => {
    expect(() => categorySlugSchema.parse("nope")).toThrow();
    expect(() => categorySlugSchema.parse("")).toThrow();
  });
});

describe("productSlugSchema", () => {
  it("acepta kebab-case válido", () => {
    expect(productSlugSchema.parse("camisa-lino-azul-marino")).toBe("camisa-lino-azul-marino");
    expect(productSlugSchema.parse("aceite-10w30")).toBe("aceite-10w30");
  });

  it("rechaza mayúsculas, espacios y símbolos", () => {
    expect(() => productSlugSchema.parse("Camisa Lino")).toThrow();
    expect(() => productSlugSchema.parse("camisa_lino")).toThrow();
    expect(() => productSlugSchema.parse("--camisa")).toThrow();
    expect(() => productSlugSchema.parse("")).toThrow();
  });
});

describe("productStatusSchema", () => {
  it("acepta los 5 estados definidos", () => {
    for (const s of ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED", "SOLD"]) {
      expect(productStatusSchema.parse(s)).toBe(s);
    }
  });

  it("rechaza estados no definidos", () => {
    expect(() => productStatusSchema.parse("draft")).toThrow();
    expect(() => productStatusSchema.parse("DELETED")).toThrow();
  });
});

describe("createProductSchema (priceUsd + offerPriceUsd)", () => {
  const base = {
    slug: "camisa-lino",
    title: "Camisa de lino azul",
    categorySlugs: ["ropa"],
    priceUsd: "25.00",
    phoneNumber: "+584120000000",
  };

  it("acepta producto sin oferta (offerPriceUsd null o ausente)", () => {
    expect(createProductSchema.parse(base).offerPriceUsd).toBeUndefined();
    expect(
      createProductSchema.parse({ ...base, offerPriceUsd: null }).offerPriceUsd,
    ).toBeNull();
  });

  it("acepta oferta menor que el precio regular", () => {
    const parsed = createProductSchema.parse({ ...base, offerPriceUsd: "18.99" });
    expect(parsed.offerPriceUsd).toBe(18.99);
  });

  it("rechaza oferta >= precio regular (igual o mayor)", () => {
    expect(() => createProductSchema.parse({ ...base, offerPriceUsd: "25.00" })).toThrow(
      /debe ser menor/,
    );
    expect(() => createProductSchema.parse({ ...base, offerPriceUsd: "30.00" })).toThrow(
      /debe ser menor/,
    );
  });

  it("rechaza oferta negativa o no numérica", () => {
    expect(() => createProductSchema.parse({ ...base, offerPriceUsd: "-5" })).toThrow();
    expect(() => createProductSchema.parse({ ...base, offerPriceUsd: "abc" })).toThrow();
  });

  it("rechaza categoría fuera de las 13 fijas", () => {
    expect(() => createProductSchema.parse({ ...base, categorySlugs: ["nope"] })).toThrow();
  });

  it("E3: exige 1–3 categorías (vacío y 4 rechazados)", () => {
    expect(() => createProductSchema.parse({ ...base, categorySlugs: [] })).toThrow(
      /al menos una/,
    );
    expect(() =>
      createProductSchema.parse({
        ...base,
        categorySlugs: ["comida", "ropa", "zapatos", "perfume"],
      }),
    ).toThrow(/Máximo 3/);
  });

  it("rechaza teléfono sin '+'" , () => {
    expect(() => createProductSchema.parse({ ...base, phoneNumber: "584120000000" })).toThrow();
  });

  it("R10: asigna status DRAFT por defecto (nunca ACTIVE por omisión)", () => {
    expect(createProductSchema.parse(base).status).toBe("DRAFT");
    expect(createProductSchema.parse({ ...base, status: "ACTIVE" }).status).toBe("ACTIVE");
  });
});
