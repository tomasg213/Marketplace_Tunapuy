import Decimal from "decimal.js";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

type PriceDisplayProps = {
  /** Precio efectivo en USD (la oferta si existe, si no el precio regular). */
  principal: Decimal.Value;
  /** Equivalente en Bs del PRECIO REGULAR (la oferta es solo por pago en divisas), calculado server-side; null si no hay tasa BCV. */
  bs?: Decimal.Value | null;
  /** Precio original (antes de oferta). Se muestra tachado si el descuento es >= 10%. */
  oferta?: Decimal.Value | null;
  variante?: "card" | "detail";
  className?: string;
};

export function PriceDisplay({
  principal,
  bs,
  oferta,
  variante = "card",
  className,
}: PriceDisplayProps) {
  const effectiveUsd = new Decimal(principal);
  const original = oferta != null ? new Decimal(oferta) : null;
  const discount =
    original && original.gt(effectiveUsd)
      ? Math.round((1 - effectiveUsd.toNumber() / original.toNumber()) * 100)
      : 0;
  const showOffer = original !== null && original.gt(effectiveUsd) && discount >= 10;

  const bsNumber = bs != null ? new Decimal(bs).toNumber() : null;
  const ariaLabel = buildAriaLabel(
    effectiveUsd.toNumber(),
    showOffer ? original!.toNumber() : null,
    bsNumber,
  );
  const mainSize = variante === "card" ? "text-[20px]" : "text-2xl";
  const subSize = variante === "card" ? "text-[13px]" : "text-sm";

  return (
    <div data-testid="price-block" className={cn("text-left", className)}>
      <p className="sr-only">{ariaLabel}</p>
      <div aria-hidden="true" className="flex flex-col gap-1">
        {showOffer && original ? (
          <>
            <p className="flex flex-wrap items-center gap-2">
              <span
                data-testid="price-usd"
                className={cn("font-bold tracking-tight tabular-nums text-price-sale", mainSize)}
              >
                {formatPrice(effectiveUsd, "USD")}
              </span>
              <Badge variant="offer">−{discount}%</Badge>
            </p>
            <p
              className={cn(
                "font-normal line-through tabular-nums text-price-strikethrough",
                subSize,
              )}
            >
              {formatPrice(original, "USD")}
            </p>
          </>
        ) : (
          <p
            data-testid="price-usd"
            className={cn("font-bold tracking-tight tabular-nums text-price-primary", mainSize)}
          >
            {formatPrice(effectiveUsd, "USD")}
          </p>
        )}
        {bsNumber !== null && (
          <p
            data-testid="price-bs"
            className={cn("font-medium tabular-nums text-muted-foreground", subSize)}
          >
            {formatPrice(bs!, "VES")}
          </p>
        )}
      </div>
    </div>
  );
}

function buildAriaLabel(principal: number, original: number | null, bs: number | null): string {
  // Regla de negocio §3.3: el Bs es SIEMPRE el equivalente del PRECIO REGULAR
  // (la oferta es un descuento solo por pago en divisas).
  const base =
    original !== null
      ? `Precio en oferta: ${spokenAmount(principal, "dólar")}. Precio anterior: ${spokenAmount(
          original,
          "dólar",
        )}.`
      : `Precio: ${spokenAmount(principal, "dólar")}.`;
  return bs !== null
    ? `${base} Equivalente en bolívares${
        original !== null ? " (precio regular)" : ""
      }: ${spokenAmount(bs, "bolívar")}.`
    : base;
}

/** "22" → "22 dólares"; "3.5" → "3 dólares con 50 céntimos". */
function spokenAmount(value: number, unit: "dólar" | "bolívar"): string {
  const fixed = value.toFixed(2);
  const whole = Number(fixed.slice(0, fixed.length - 3));
  const cents = Number(fixed.slice(-2));
  const unitLabel = `${unit}${whole === 1 ? "" : "es"}`;
  const centsLabel = cents > 0 ? ` con ${cents} céntimo${cents === 1 ? "" : "s"}` : "";
  return `${groupThousands(whole)} ${unitLabel}${centsLabel}`;
}

/** "16214" → "16 mil 214"; "1250000" → "1 millón 250 mil". */
function groupThousands(value: number): string {
  let rest = Math.floor(value);
  const parts: string[] = [];
  let level = 0;
  while (rest > 0) {
    const chunk = rest % 1000;
    if (chunk > 0) {
      const name =
        level === 1
          ? "mil"
          : level === 2
            ? chunk === 1
              ? "millón"
              : "millones"
            : level === 3
              ? "mil millones"
              : "";
      parts.unshift(name ? `${chunk} ${name}` : String(chunk));
    }
    rest = Math.floor(rest / 1000);
    level++;
  }
  return parts.length ? parts.join(" ") : "0";
}
