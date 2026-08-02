import { describe, expect, it } from "vitest";
import { formatBs, formatPrice, formatUsd } from "../../src/lib/format";

describe("formatUsd", () => {
  it("formatea 25 → $25.00 (decimal con punto)", () => {
    expect(formatUsd(25)).toBe("$25.00");
  });

  it("usa coma para miles y punto para decimales", () => {
    expect(formatUsd(1250.5)).toBe("$1,250.50");
  });

  it("acepta strings y Decimal", () => {
    expect(formatUsd("25.00")).toBe("$25.00");
  });
});

describe("formatBs", () => {
  it("formatea 18665.7425 → Bs. 18.665,74 (punto en miles, coma en decimales)", () => {
    expect(formatBs(18665.7425)).toBe("Bs. 18.665,74");
  });

  it("usa punto para miles y coma para decimales", () => {
    expect(formatBs(1250.5)).toBe("Bs. 1.250,50");
  });

  it("redondea a 2 decimales al formatear", () => {
    expect(formatBs(10.999)).toBe("Bs. 11,00");
  });
});

describe("formatPrice", () => {
  it("elige el formato según la moneda", () => {
    expect(formatPrice(25, "USD")).toBe("$25.00");
    expect(formatPrice(18665.7425, "VES")).toBe("Bs. 18.665,74");
  });
});
