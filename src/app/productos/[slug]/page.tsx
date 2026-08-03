// /productos/[slug] — Detalle de producto (Épica E1 + Categorías multi).
// Server Component force-dynamic: la tasa BCV es dinámica; el Bs. se
// calcula SIEMPRE server-side (docs/architecture.md §3.3).
import type { Metadata } from "next";
import { Image as ImageIcon, Store } from "lucide-react";
import { notFound } from "next/navigation";
import { PriceDisplay } from "@/components/PriceDisplay";
import { RateInfo } from "@/components/RateInfo";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { ProductGallery } from "@/components/product/ProductGallery";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatBs, formatUsd } from "@/lib/format";
import { formatDateLong, formatRelativeTime } from "@/lib/time";
import { db } from "@/server/db";
import { detailIncludes, effectivePriceUsd, productPriceBs } from "@/server/products/queries";
import { getBcvRate, type BcvRate } from "@/server/rate/rate.service";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const product = await db.product.findUnique({
    where: { slug },
    select: { title: true, description: true },
  });
  if (!product) return { title: "Producto no encontrado" };
  return { title: product.title, description: product.description ?? undefined };
}

export default async function ProductDetailPage({ params }: { params: Params }) {
  const { slug } = await params;

  const [product, rate] = await Promise.all([
    db.product.findUnique({ where: { slug }, include: detailIncludes }),
    getBcvRateSafe(),
  ]);

  if (!product || product.status !== "ACTIVE") notFound();

  const effectiveUsd = effectivePriceUsd(product);
  const hasOffer = product.offerPriceUsd !== null && product.offerPriceUsd.lessThan(product.priceUsd);
  // Bs SIEMPRE sobre el precio regular (la oferta es solo por pago en divisas).
  const priceBs = productPriceBs(product, rate);

  const sellerName = product.business?.name ?? product.seller?.name;
  const sellerHref = product.business?.slug
    ? `/negocios/${product.business.slug}`
    : `/vendedores/${product.seller.slug}`;

  const publishedAt = product.publishedAt ?? product.createdAt;
  const waMessage = `Hola, me interesa "${product.title}" por ${formatUsd(effectiveUsd)} de ${sellerName}`;

  // Categorías ordenadas por position asc (el include ya ordena; el sort es
  // defensivo). Si `product.categories` está vacío (backwards-compat) no se
  // renderiza nada y el breadcrumb queda Inicio > Título.
  const categories = product.categories.slice().sort((a, b) => a.position - b.position);
  const primaryCategory = categories[0]?.category ?? null;

  return (
    <main
      id="main-content"
      className="mx-auto w-full max-w-5xl flex-1 px-4 pt-4 pb-44 lg:pb-32"
    >
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Inicio</BreadcrumbLink>
          </BreadcrumbItem>
          {primaryCategory && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href={`/buscar?categoria=${primaryCategory.slug}`}>
                  {primaryCategory.name}
                </BreadcrumbLink>
              </BreadcrumbItem>
            </>
          )}
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{product.title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-label="Galería del producto">
          {product.images.length > 0 ? (
            <ProductGallery
              images={product.images.map((image) => ({ url: image.url, alt: image.alt }))}
              title={product.title}
            />
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 via-muted to-accent/25">
              <ImageIcon aria-hidden="true" className="size-12 text-muted-foreground" />
              <span className="sr-only">Sin imagen disponible</span>
            </div>
          )}
        </section>

        <section aria-label="Información del producto" className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            Publicado {formatRelativeTime(publishedAt)}
          </p>

          <h1 className="text-2xl leading-tight font-bold tracking-tight">{product.title}</h1>

          {categories.length > 0 && (
            <div
              role="group"
              aria-label="Categorías del producto"
              className="flex flex-wrap items-center gap-2"
            >
              {categories.map((rel, index) => {
                const isPrimary = index === 0;
                return (
                  <a
                    key={rel.category.slug}
                    href={`/buscar?categoria=${rel.category.slug}`}
                    aria-label={
                      isPrimary ? `Categoría principal: ${rel.category.name}` : rel.category.name
                    }
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                      isPrimary
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    {rel.category.name}
                  </a>
                );
              })}
            </div>
          )}

          <PriceDisplay
            principal={effectiveUsd}
            bs={priceBs}
            oferta={hasOffer ? product.priceUsd : null}
            variante="detail"
          />

          {rate && (
            <RateInfo
              text={buildRateText(rate)}
              disclaimer={
                rate.origin === "fallback" || rate.origin === "stale"
                  ? `Tasa de referencia (origen: ${rate.origin}). Puede diferir de la tasa oficial del día.`
                  : null
              }
            />
          )}

          {product.description && (
            <div className="mt-2">
              <h2 className="mb-1 text-sm font-semibold text-muted-foreground">Descripción</h2>
              <p className="text-sm leading-relaxed whitespace-pre-line">{product.description}</p>
            </div>
          )}

          <div className="mt-2 flex items-center gap-3">
            <Avatar size="lg">
              <AvatarImage src={product.seller.avatarUrl ?? undefined} alt={sellerName ?? undefined} />
              <AvatarFallback>{initials(sellerName)}</AvatarFallback>
            </Avatar>
            <a
              href={sellerHref}
              className="inline-flex min-h-11 items-center rounded-sm text-sm font-semibold text-primary underline-offset-4 transition-colors hover:underline focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {sellerName}
            </a>
          </div>

          {product.business && (
            <Card className="gap-3 p-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
                  {product.business.logoUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element -- logos del seed son locales */
                    <img
                      src={product.business.logoUrl}
                      alt={`Logo de ${product.business.name}`}
                      className="size-full rounded-full object-cover"
                    />
                  ) : (
                    <Store aria-hidden="true" className="size-5 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-bold">{product.business.name}</p>
                  {product.business.description && (
                    <p className="text-xs text-muted-foreground">
                      {product.business.description}
                    </p>
                  )}
                </div>
              </div>
              {product.business.phoneNumber && (
                <WhatsAppButton
                  phoneNumber={product.business.phoneNumber}
                  sellerName={product.business.name}
                  message={`¡Hola! Me interesa "${product.title}" de ${product.business.name} en Tunapuy. ¿Sigue disponible?`}
                  className="w-full"
                />
              )}
            </Card>
          )}
        </section>
      </div>

      <div
        role="region"
        aria-label="Contacto del anuncio"
        className="fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-40 border-t border-border bg-card/95 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 lg:bottom-0 lg:pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4">
          <div className="hidden shrink-0 lg:block">
            <p className="text-xs text-muted-foreground">Precio</p>
            <p className="text-lg leading-tight font-bold tabular-nums text-price-primary">
              {formatUsd(effectiveUsd)}
            </p>
          </div>
          <WhatsAppButton
            phoneNumber={product.phoneNumber}
            sellerName={sellerName}
            message={waMessage}
            size="lg"
            className="w-full"
          >
            Contactar por WhatsApp
          </WhatsAppButton>
        </div>
      </div>
    </main>
  );
}

async function getBcvRateSafe(): Promise<BcvRate | null> {
  try {
    return await getBcvRate();
  } catch {
    return null; // sin tasa: se oculta el Bs y la info de tasa
  }
}

function buildRateText(rate: BcvRate): string {
  const perUsd = `(${formatBs(rate.usdToBs)}/USD)`;
  return rate.fetchedAt
    ? `Equivalente según tasa BCV del ${formatDateLong(rate.fetchedAt)} ${perUsd}`
    : `Equivalente según tasa BCV ${perUsd}`;
}

function initials(name?: string | null): string {
  const words = (name ?? "").trim().split(/\s+/);
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}
