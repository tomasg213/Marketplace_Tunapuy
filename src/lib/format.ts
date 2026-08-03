// Formateo de precios (docs/architecture.md §3.3).
// - USD: `$25.00` — separador decimal con punto, miles con coma (en-US).
// - Bs:  `Bs. 18.665,74` — miles con punto, decimal con coma (es-VE).
// Módulo puro (sin dependencias de servidor/BD): lo usa también el cliente
// cuando recibe números ya calculados desde el Server Component.
import Decimal from "decimal.js";

export type CurrencyCode = "USD" | "VES";

/**
 * Formatea un monto como USD. `25` → `$25.00`, `1250.5` → `$1,250.50`.
 */
export function formatUsd(value: Decimal.Value): string {
  const amount = toNumber(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

/**
 * Formatea un monto como bolívares. `18665.7425` → `Bs. 18.665,74`.
 */
export function formatBs(value: Decimal.Value): string {
  const amount = toNumber(value);
  const formatted = new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `Bs. ${formatted}`;
}

/**
 * Formatea un precio según la moneda. Función principal del módulo.
 * `formatPrice(25, "USD")` → `$25.00`; `formatPrice(18665.7425, "VES")` → `Bs. 18.665,74`.
 */
export function formatPrice(value: Decimal.Value, currency: CurrencyCode): string {
  return currency === "USD" ? formatUsd(value) : formatBs(value);
}

function toNumber(value: Decimal.Value): number {
  return new Decimal(value).toNumber();
}
