import Decimal from "decimal.js";
import { PriceDisplay } from "@/components/PriceDisplay";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type ProductCardProduct = {
  slug: string;
  title: string;
  imageUrl?: string | null;
  imageAlt?: string | null;
  priceUsd: Decimal.Value;
  offerPriceUsd?: Decimal.Value | null;
  priceBs?: Decimal.Value | null;
  phoneNumber: string;
  sellerName?: string | null;
  /** Ruta al perfil del vendedor (persona o negocio). */
  sellerHref?: string;
};

export function ProductCard({
  product,
  className,
}: {
  product: ProductCardProduct;
  className?: string;
}) {
  const priceUsd = new Decimal(product.priceUsd);
  const offerPriceUsd = product.offerPriceUsd != null ? new Decimal(product.offerPriceUsd) : null;
  const hasOffer = offerPriceUsd !== null && offerPriceUsd.lt(priceUsd);
  const discount = hasOffer
    ? Math.round((1 - offerPriceUsd!.toNumber() / priceUsd.toNumber()) * 100)
    : 0;
  const showOffer = hasOffer && discount >= 10;
  const effectiveUsd = hasOffer ? offerPriceUsd! : priceUsd;

  return (
    <Card data-testid="product-card" className={cn("h-full gap-3 pt-0", className)}>
      <a
        href={`/productos/${product.slug}`}
        className="block focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element -- fotos del seed son locales (/placeholder.svg); next/image requiere config de dominios remotos (E1) */}
          <img
            src={product.imageUrl ?? "/placeholder.svg"}
            alt={product.imageAlt ?? product.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300"
          />
          {showOffer && (
            <Badge
              variant="offer"
              className="absolute top-2 left-2 h-6 px-2.5 text-xs font-semibold"
            >
              OFERTA
            </Badge>
          )}
        </div>
        <h3 className="line-clamp-2 px-4 pt-3 text-sm leading-snug font-semibold text-foreground">
          {product.title}
        </h3>
      </a>

      <div className="px-4">
        <PriceDisplay
          principal={effectiveUsd}
          bs={product.priceBs ?? null}
          oferta={showOffer ? priceUsd : null}
          variante="card"
        />
      </div>

      <div className="px-4">
        <WhatsAppButton
          phoneNumber={product.phoneNumber}
          sellerName={product.sellerName ?? undefined}
          message={`¡Hola! Me interesa "${product.title}" en Tunapuy. ¿Sigue disponible?`}
          className="w-full"
        />
        {product.sellerName && (
          product.sellerHref ? (
            <a
              href={product.sellerHref}
              className="mt-2 inline-flex min-h-8 items-center rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {product.sellerName}
            </a>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">{product.sellerName}</p>
          )
        )}
      </div>
    </Card>
  );
}
