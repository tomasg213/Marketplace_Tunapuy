// Regla de negocio del precio en Bs (docs/architecture.md §3.3):
// el equivalente en Bs se calcula SIEMPRE sobre `priceUsd` (precio regular),
// NUNCA sobre la oferta — la oferta es un descuento SOLO por pago en divisas
// (USD); pagar en bolívares no aplica el descuento.
import Decimal from "decimal.js";
import { beforeAll, describe, expect, it } from "vitest";

// `queries.ts` importa `@/server/db` (crea el cliente con DATABASE_URL); se
// setea ANTES del import dinámico. No se ejecuta ninguna query contra la BD.
process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/tunapuy_test_pricing";

let queries: typeof import("../../src/server/products/queries");

beforeAll(async () => {
  queries = await import("../../src/server/products/queries");
});

const RATE = new Decimal("746.6297");
const rate = { usdToBs: RATE } as const;

function product(priceUsd: string, offerPriceUsd: string | null) {
  return {
    id: "p1",
    slug: "producto-test",
    title: "Producto Test",
    description: null,
    priceUsd: new Decimal(priceUsd),
    offerPriceUsd: offerPriceUsd !== null ? new Decimal(offerPriceUsd) : null,
    phoneNumber: "+580000000001",
    status: "ACTIVE",
    isFeatured: false,
    featuredOrder: 0,
    publishedAt: new Date(),
    sellerId: "s1",
    businessId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    categories: [],
    images: [],
    business: null,
    seller: { name: "Vendedor Test", slug: "vendedor-test" },
  } as unknown as Parameters<typeof queries.toCardProduct>[0];
}

describe("productPriceBs — Bs siempre sobre el precio regular", () => {
  it("con oferta: convierte priceUsd, NO el precio de oferta", () => {
    const bs = queries.productPriceBs(product("25.00", "20.00"), rate);
    // 25 × 746.6297 = 18665.74 (la oferta daría 14932.59).
    expect(bs!.toString()).toBe("18665.74");
  });

  it("sin oferta: convierte priceUsd", () => {
    const bs = queries.productPriceBs(product("25.00", null), rate);
    expect(bs!.toString()).toBe("18665.74");
  });

  it("sin tasa (rate null): devuelve null (se oculta el Bs)", () => {
    expect(queries.productPriceBs(product("25.00", "20.00"), null)).toBeNull();
  });
});

describe("toCardProduct — priceBs coherente en la tarjeta", () => {
  it("con oferta: el principal USD es la oferta, pero el Bs es el precio regular", () => {
    const card = queries.toCardProduct(product("25.00", "20.00"), rate as never);
    expect(card.priceUsd.toString()).toBe("25");
    expect(card.offerPriceUsd!.toString()).toBe("20");
    // Bs = 25 × tasa (NO 20 × tasa).
    expect(card.priceBs!.toString()).toBe("18665.74");
  });

  it("sin oferta: principal y Bs sobre el mismo precio", () => {
    const card = queries.toCardProduct(product("25.00", null), rate as never);
    expect(card.priceBs!.toString()).toBe("18665.74");
  });
});
