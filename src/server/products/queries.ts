// Queries de catálogo compartidas entre home, /buscar y los perfiles (E1).
// Los Server Components usan estos includes para no duplicar el shape de datos.
import type { ProductCardProduct } from "@/components/product/ProductCard";
import { Prisma } from "@/server/db";
import { usdToBs } from "@/server/rate/convert";
import type { BcvRate } from "@/server/rate/rate.service";
import { slugifyName } from "@/lib/slug";

/** Para grillas de tarjetas: primera imagen + metadatos de vendedor/negocio. */
export const cardIncludes = {
  category: true,
  images: { take: 1, orderBy: { position: "asc" as const } },
  business: { select: { name: true, slug: true } },
  seller: { select: { name: true } },
} as const;

/** Para el detalle de producto: galería completa + negocio con datos de contacto. */
export const detailIncludes = {
  category: true,
  images: { orderBy: { position: "asc" as const } },
  business: {
    select: {
      name: true,
      slug: true,
      description: true,
      logoUrl: true,
      phoneNumber: true,
    },
  },
  seller: { select: { name: true, avatarUrl: true } },
} as const;

export type CardProduct = Prisma.ProductGetPayload<{ include: typeof cardIncludes }>;
export type DetailProduct = Prisma.ProductGetPayload<{ include: typeof detailIncludes }>;

/**
 * Precio efectivo en USD (la oferta si existe y es menor) → para Bs y WhatsApp.
 * Mismo criterio en todos los renders (docs/architecture.md §3.3).
 */
export function effectivePriceUsd(product: {
  priceUsd: Prisma.Decimal;
  offerPriceUsd: Prisma.Decimal | null;
}): Prisma.Decimal {
  const offer = product.offerPriceUsd;
  return offer && offer.lessThan(product.priceUsd) ? offer : product.priceUsd;
}

export function toCardProduct(product: CardProduct, rate: BcvRate | null): ProductCardProduct {
  const effectiveUsd = effectivePriceUsd(product);
  const priceBs = rate ? usdToBs(effectiveUsd, rate.usdToBs) : null;
  const sellerName = product.business?.name ?? product.seller?.name;

  return {
    slug: product.slug,
    title: product.title,
    imageUrl: product.images[0]?.url ?? "/placeholder.svg",
    imageAlt: product.images[0]?.alt ?? product.title,
    priceUsd: product.priceUsd,
    offerPriceUsd: product.offerPriceUsd,
    priceBs,
    phoneNumber: product.phoneNumber,
    sellerName,
    sellerHref: product.business?.slug
      ? `/negocios/${product.business.slug}`
      : product.seller?.name
        ? `/vendedores/${slugifyName(product.seller.name)}`
        : undefined,
  };
}
