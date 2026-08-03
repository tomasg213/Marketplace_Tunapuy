// /buscar — Resultados de búsqueda y filtro por categoría (Épica E1).
// Server Component: lee ?q= y ?categoria=, consulta la BD y calcula el Bs
// con la tasa BCV cacheada. Corrige el bug B1 (chips → /buscar daba 404).
import type { Metadata } from "next";
import { ArrowRight, Search } from "lucide-react";
import { CategoryChips } from "@/components/CategoryChips";
import { ProductCard } from "@/components/product/ProductCard";
import { Input } from "@/components/ui/input";
import { escapeLikeWildcards, toSingleSearchParam } from "@/lib/search";
import { db, Prisma } from "@/server/db";
import { cardIncludes, toCardProduct } from "@/server/products/queries";
import { getBcvRate, type BcvRate } from "@/server/rate/rate.service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Buscar",
  description: "Busca productos y negocios del catálogo de Tunapuy.",
};

// Next.js entrega string | string[] cuando el parámetro se repite (?q=a&q=b):
// normalizamos a un único string para no tirar 500 (bug E1).
type SearchParams = Promise<{ q?: string | string[]; categoria?: string | string[] }>;

export default async function BuscarPage({ searchParams }: { searchParams: SearchParams }) {
  const { q: rawQ, categoria: rawCategoria } = await searchParams;
  const q = toSingleSearchParam(rawQ)?.trim() ?? "";
  const categoria = toSingleSearchParam(rawCategoria)?.trim() ?? "";

  let rate: BcvRate | null = null;
  try {
    rate = await getBcvRate();
  } catch {
    rate = null;
  }

  const where: Prisma.ProductWhereInput = {
    status: "ACTIVE",
    // Multi-categoría (épica E3): el filtro pasa por la tabla puente
    // ProductCategory (antes era la relación directa `category`, que ya no existe).
    ...(categoria ? { categories: { some: { category: { slug: categoria } } } } : {}),
    ...(q
      ? {
          OR: [
            // Escapamos % y _ para que no actúen como comodines de ILIKE
            // (buscar "%" o "_" no debe devolver todo el catálogo).
            { title: { contains: escapeLikeWildcards(q), mode: "insensitive" } },
            { description: { contains: escapeLikeWildcards(q), mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [categories, activeCategory, products] = await Promise.all([
    db.category.findMany({ orderBy: { position: "asc" } }),
    categoria
      ? db.category.findUnique({ where: { slug: categoria } })
      : Promise.resolve(null),
    db.product.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      include: cardIncludes,
    }),
  ]);

  const categoryName = activeCategory?.name ?? (categoria || null);
  const hasFilters = Boolean(q || categoria);

  return (
    <main id="main-content" className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-10 lg:pb-12">
      <section aria-label="Buscar productos" className="mb-6">
        <form action="/buscar" method="get" role="search" className="relative">
          <label htmlFor="search-input" className="sr-only">
            Buscar productos
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="search-input"
            name="q"
            type="search"
            placeholder="¿Qué estás buscando?"
            defaultValue={q}
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

      <section aria-label="Filtrar por categoría" className="mb-8">
        <CategoryChips categories={categories} activeSlug={categoria} />
      </section>

      <h1 className="mb-4 text-xl font-bold tracking-tight">
        {q ? `Resultados para "${q}"` : categoryName ? `Categoría: ${categoryName}` : "Todos los productos"}
      </h1>

      {products.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={toCardProduct(product, rate)} />
          ))}
        </div>
      ) : (
        <EmptyState
          message={
            categoryName
              ? `Aún no hay publicaciones de ${categoryName.toLowerCase()}.`
              : hasFilters
                ? "Aún no hay publicaciones que coincidan con tu búsqueda."
                : "Aún no hay publicaciones."
          }
        />
      )}
    </main>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center"
    >
      <p className="text-base text-muted-foreground">{message}</p>
      <a
        href="/vender"
        className="inline-flex min-h-11 items-center justify-center rounded-sm bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        ¡Sé el primero en vender!
      </a>
    </div>
  );
}
