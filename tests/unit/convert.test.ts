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

  it("trabaja con exactitud decimal (sin errores de punto flotante)", () => {
    // 0.1 * 3 = 0.3 exacto en decimal.js
    expect(usdToBs("0.1", "3").toString()).toBe("0.3");
    expect(usdToBs(0.1, 3).toString()).toBe("0.3");
  });

  it("rechaza montos negativos y tasas <= 0", () => {
    expect(() => usdToBs("-1", "746.63")).toThrow(RangeError);
    expect(() => usdToBs("10", "0")).toThrow(RangeError);
    expect(() => usdToBs("10", "-5")).toThrow(RangeError);
  });
});
