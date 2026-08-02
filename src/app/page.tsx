// Home (/): vitrina con las 6 categorías y productos recientes.
// Server Component: calcula el precio en Bs con la tasa BCV cacheada
// (docs/architecture.md §3.3) y envía al cliente strings ya formateados.
// El diseño fino (PriceDisplay, cards, etc.) lo hará `designer`.
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { PRODUCTS_PER_HOME } from "@/lib/constants";
import { formatBs, formatUsd } from "@/lib/format";
import { db } from "@/server/db";
import { usdToBs } from "@/server/rate/convert";
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

  const [categories, products] = await Promise.all([
    db.category.findMany({ orderBy: { position: "asc" } }),
    db.product.findMany({
      where: { status: "ACTIVE" },
      orderBy: { publishedAt: "desc" },
      take: PRODUCTS_PER_HOME,
      include: {
        category: true,
        images: { take: 1, orderBy: { position: "asc" } },
      },
    }),
  ]);

  const showMockBanner = process.env.NEXT_PUBLIC_SHOW_MOCK_BANNER === "true";

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      {showMockBanner && (
        <p className="mb-6 rounded-md border border-dashed border-amber-500 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Entorno de demostración — los datos mostrados son ficticios.
        </p>
      )}

      <section aria-labelledby="categories-heading" className="mb-10">
        <h2 id="categories-heading" className="text-xl font-semibold">
          Categorías
        </h2>
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
          {categories.map((category) => (
            <li key={category.id}>
              <a
                href={`/categorias/${category.slug}`}
                className="flex h-full flex-col items-center gap-1 rounded-lg border p-4 text-center text-sm font-medium hover:bg-muted"
              >
                <span aria-hidden="true">{category.icon ?? "•"}</span>
                <span>{category.name}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="products-heading">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="products-heading" className="text-xl font-semibold">
            Productos recientes
          </h2>
          {rate && (
            <p className="text-xs text-muted-foreground" data-testid="rate-info">
              Tasa: {rate.usdToBs.toString()} (origen: {rate.origin})
            </p>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => {
            const offerUsd =
              product.offerPriceUsd && product.offerPriceUsd.lessThan(product.priceUsd)
                ? product.offerPriceUsd
                : null;
            const effectiveUsd = offerUsd ?? product.priceUsd;
            const priceBs = rate ? usdToBs(effectiveUsd, rate.usdToBs) : null;

            return (
              <div key={product.id} data-testid="product-card">
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle className="text-base leading-snug">
                      {product.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <p className="text-lg font-semibold" data-testid="price-usd">
                      {formatUsd(effectiveUsd)}
                    </p>
                    {priceBs ? (
                      <p className="text-sm text-muted-foreground" data-testid="price-bs">
                        {formatBs(priceBs)}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground" data-testid="price-bs">
                        Bs. no disponible
                      </p>
                    )}
                    {offerUsd && (
                      <p className="text-xs text-muted-foreground line-through">
                        Antes: {formatUsd(product.priceUsd)}
                      </p>
                    )}
                  </CardContent>
                  <CardFooter>
                    <Badge variant="secondary">{product.category.name}</Badge>
                  </CardFooter>
                </Card>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
