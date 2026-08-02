// Conversión USD → Bs (docs/architecture.md §3.3).
// Solo server-side: el Server Component calcula el Bs y envía al cliente
// la cadena formateada (o el número + tasa), nunca el cómputo.
import Decimal from "decimal.js";

/**
 * Convierte un monto en USD a Bs multiplicando por la tasa.
 * Redondeo a 2 decimales con HALF_UP (round half away from zero).
 *
 * Ej.: usdToBs("25.00", "746.6297") → 18665.74 (Decimal)
 */
export function usdToBs(usd: Decimal.Value, rate: Decimal.Value): Decimal {
  const amount = new Decimal(usd);
  const tasa = new Decimal(rate);

  if (amount.isNegative()) {
    throw new RangeError("usdToBs: el monto en USD no puede ser negativo");
  }
  if (tasa.isNegative() || tasa.isZero()) {
    throw new RangeError("usdToBs: la tasa debe ser positiva");
  }

  return amount.mul(tasa).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}
