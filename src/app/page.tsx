// Home (/): buscador → chips categorías → destacados → recientes → footer con tasa BCV.
// Server Component: calcula el precio en Bs con la tasa BCV cacheada
// (docs/architecture.md §3.3) y envía al cliente strings ya formateados.
import type { Metadata } from "next";
import { ArrowRight, Search } from "lucide-react";
import { CategoryChips } from "@/components/CategoryChips";
import { ProductCard, type ProductCardProduct } from "@/components/product/ProductCard";
import { Input } from "@/components/ui/input";
import { PRODUCTS_PER_HOME } from "@/lib/constants";
import { formatBs } from "@/lib/format";
import { db, Prisma } from "@/server/db";
import { usdToBs } from "@/server/rate/convert";
import { getBcvRate, type BcvRate } from "@/server/rate/rate.service";

// La home lee la tasa BCV y la BD en cada request (no prerenderizar).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tunapuy — Vitrina local",
  description:
    "Descubre productos y negocios locales: comida, ropa, zapatos, perfume, automotriz y licor.",
};

const productIncludes = {
  category: true,
  images: { take: 1, orderBy: { position: "asc" as const } },
  business: { select: { name: true } },
  seller: { select: { name: true } },
} as const;

type HomeProduct = Prisma.ProductGetPayload<{ include: typeof productIncludes }>;

function toCardProduct(product: HomeProduct, rate: BcvRate | null): ProductCardProduct {
  const offerUsd =
    product.offerPriceUsd && product.offerPriceUsd.lessThan(product.priceUsd)
      ? product.offerPriceUsd
      : null;
  const effectiveUsd = offerUsd ?? product.priceUsd;
  const priceBs = rate ? usdToBs(effectiveUsd, rate.usdToBs) : null;

  return {
    slug: product.slug,
    title: product.title,
    imageUrl: product.images[0]?.url ?? "/placeholder.svg",
    imageAlt: product.images[0]?.alt ?? product.title,
    priceUsd: product.priceUsd,
    offerPriceUsd: offerUsd,
    priceBs,
    phoneNumber: product.phoneNumber,
    sellerName: product.business?.name ?? product.seller?.name,
  };
}

export default async function HomePage() {
  let rate: BcvRate | null = null;
  try {
    rate = await getBcvRate();
  } catch {
    rate = null; // sin tasa: se oculta el precio en Bs
  }

  const [categories, featured, recent] = await Promise.all([
    db.category.findMany({ orderBy: { position: "asc" } }),
    db.product.findMany({
      where: { status: "ACTIVE", isFeatured: true },
      orderBy: { featuredOrder: "asc" },
      include: productIncludes,
    }),
    db.product.findMany({
      where: { status: "ACTIVE", isFeatured: false },
      orderBy: { publishedAt: "desc" },
      take: PRODUCTS_PER_HOME,
      include: productIncludes,
    }),
  ]);

  const showMockBanner = process.env.NEXT_PUBLIC_SHOW_MOCK_BANNER === "true";

  return (
    <main id="main-content" className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-10 lg:pb-12">
      {showMockBanner && (
        <p className="mb-6 rounded-md border border-dashed border-amber-500 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Entorno de demostración — los datos mostrados son ficticios.
        </p>
      )}

      <section aria-label="Buscar productos" className="mb-8">
        <form action="/buscar" method="get" role="search" className="relative">
          <label htmlFor="home-search" className="sr-only">
            Buscar productos y negocios
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="home-search"
            name="q"
            type="search"
            placeholder="Buscar productos y negocios…"
            autoComplete="off"
            className="bg-muted pr-14 pl-11"
          />
          <button
            type="submit"
            aria-label="Buscar"
            className="absolute top-1/2 right-1 flex size-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ArrowRight aria-hidden="true" className="size-5" />
          </button>
        </form>
      </section>

      <section id="categorias" aria-labelledby="categories-heading" className="mb-10 scroll-mt-6">
        <h2 id="categories-heading" className="mb-3 text-xl font-bold tracking-tight">
          Categorías
        </h2>
        <CategoryChips categories={categories} />
      </section>

      {featured.length > 0 && (
        <section aria-labelledby="featured-heading" className="mb-10">
          <h2 id="featured-heading" className="mb-4 text-xl font-bold tracking-tight">
            Destacados
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {featured.map((product) => (
              <ProductCard key={product.id} product={toCardProduct(product, rate)} />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="products-heading">
        <h2 id="products-heading" className="mb-4 text-xl font-bold tracking-tight">
          Productos recientes
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {recent.map((product) => (
            <ProductCard key={product.id} product={toCardProduct(product, rate)} />
          ))}
        </div>
      </section>

      <footer className="mt-12 border-t border-border pt-6">
        <p data-testid="rate-info" className="text-sm text-muted-foreground">
          {rate ? (
            <>
              Tasa BCV del día:{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {formatBs(rate.usdToBs)}
              </span>{" "}
              por US$ 1,00{" "}
              <span className="text-xs">(origen: {rate.origin})</span>
            </>
          ) : (
            "Tasa BCV no disponible."
          )}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          © {new Date().getFullYear()} Tunapuy · Vitrina de productos locales.
        </p>
      </footer>
    </main>
  );
}
