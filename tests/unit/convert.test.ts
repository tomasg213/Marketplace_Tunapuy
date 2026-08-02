import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { usdToBs } from "../../src/server/rate/convert";

describe("usdToBs", () => {
  it("convierte 25.00 USD con tasa 746.6297 → Bs 18.665,74", () => {
    const result = usdToBs("25.00", "746.6297");
    expect(result).toBeInstanceOf(Decimal);
    // 25 * 746.6297 = 18.665,7425 → redondeado HALF_UP a 2 decimales
    expect(result.toString()).toBe("18665.74");
    expect(result.eq(new Decimal("18665.74"))).toBe(true);
  });

  it("redondea HALF_UP a 2 decimales", () => {
    // 1.00 * 0.005 = 0.005 → 0.01 (half up: se aleja de cero)
    expect(usdToBs("1.00", "0.005").toString()).toBe("0.01");
    // 1.00 * 0.0049 = 0.0049 → 0.00 (Decimal.toString() trunca ceros: usamos toFixed)
    expect(usdToBs("1.00", "0.0049").toFixed(2)).toBe("0.00");
  });

  it("redondea HALF_UP también en la frontera de 2 decimales", () => {
    // 2.345 → 2.35 (el 5 en la 3ª cifra empuja hacia arriba)
    expect(usdToBs("2.345", "1").toString()).toBe("2.35");
    // 2.344 → 2.34 (por debajo de la frontera)
    expect(usdToBs("2.344", "1").toString()).toBe("2.34");
    // 0.015 → 0.02 ; 0.014 → 0.01
    expect(usdToBs("0.015", "1").toString()).toBe("0.02");
    expect(usdToBs("0.014", "1").toFixed(2)).toBe("0.01");
    // casos negativos del valor no aplican (monto siempre >= 0),
    // pero la tasa con decimales debe respetar el mismo criterio.
    expect(usdToBs("1", "2.345").toString()).toBe("2.35");
  });

  it("trabaja con exactitud decimal (sin errores de punto flotante)", () => {
    // 0.1 * 3 = 0.3 exacto en decimal.js
    expect(usdToBs("0.1", "3").toString()).toBe("0.3");
    expect(usdToBs(0.1, 3).toString()).toBe("0.3");
  });

  it("convierte el monto 0", () => {
    const result = usdToBs("0", "746.6297");
    expect(result.toString()).toBe("0");
    expect(result.toFixed(2)).toBe("0.00");
  });

  it("convierte montos grandes sin perder precisión", () => {
    // 1.000.000 USD × 746.6297 = 746.629.700,00 Bs
    expect(usdToBs("1000000", "746.6297").toString()).toBe("746629700");
    // Cerca del máximo de Decimal(10,2): 99.999.999,99 USD
    expect(usdToBs("99999999.99", "746.6297").toFixed(2)).toBe("74662969992.53");
  });

  it("acepta Decimal como entrada (compatibilidad con Prisma.Decimal)", () => {
    const usd = new Decimal("25.00");
    const rate = new Decimal("746.6297");
    expect(usdToBs(usd, rate).toString()).toBe("18665.74");
  });

  it("rechaza montos negativos y tasas <= 0", () => {
    expect(() => usdToBs("-1", "746.63")).toThrow(RangeError);
    expect(() => usdToBs("10", "0")).toThrow(RangeError);
    expect(() => usdToBs("10", "-5")).toThrow(RangeError);
  });
});
