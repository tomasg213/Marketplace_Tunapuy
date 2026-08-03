// Home (/): buscador → chips categorías → destacados → recientes.
// Server Component: calcula el precio en Bs con la tasa BCV cacheada
// (docs/architecture.md §3.3) y envía al cliente strings ya formateados.
// El footer con la tasa BCV y enlaces vive en el layout (SiteFooter, ≥lg).
import type { Metadata } from "next";
import { ArrowRight, Search } from "lucide-react";
import { CategoryChips } from "@/components/CategoryChips";
import { ProductCard } from "@/components/product/ProductCard";
import { Input } from "@/components/ui/input";
import { PRODUCTS_PER_HOME } from "@/lib/constants";
import { db } from "@/server/db";
import {
  cardIncludes,
  toCardProduct,
  type CardProduct,
} from "@/server/products/queries";
import { getBcvRate, type BcvRate } from "@/server/rate/rate.service";

// La home lee la tasa BCV y la BD en cada request (no prerenderizar).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tunapuy — Vitrina local",
  description:
    "Descubre productos y negocios locales: comida, ropa, zapatos, perfume, automotriz y licor.",
};

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
      include: cardIncludes,
    }),
    db.product.findMany({
      where: { status: "ACTIVE", isFeatured: false },
      orderBy: { publishedAt: "desc" },
      take: PRODUCTS_PER_HOME,
      include: cardIncludes,
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
        <CategoryChips categories={categories} showAll />
      </section>

      {featured.length > 0 && (
        <section aria-labelledby="featured-heading" className="mb-10">
          <h2 id="featured-heading" className="mb-4 text-xl font-bold tracking-tight">
            Destacados
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {featured.map((product: CardProduct) => (
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
          {recent.map((product: CardProduct) => (
            <ProductCard key={product.id} product={toCardProduct(product, rate)} />
          ))}
        </div>
      </section>
    </main>
  );
}
