// /vendedores/[slug] — Perfil de vendedor persona (Épica E1).
// User no tiene columna slug en el schema E0: el slug se deriva de User.name
// (slugifyName). Limitación conocida (colisiones de nombre) → User.slug único
// en una migración futura; para el volumen local del MVP el lookup es válido.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/product/ProductCard";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { slugifyName } from "@/lib/slug";
import { db } from "@/server/db";
import { cardIncludes, toCardProduct } from "@/server/products/queries";
import { getBcvRate, type BcvRate } from "@/server/rate/rate.service";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const user = await findSellerBySlug(slug);
  return { title: user?.name ? `Vendedor: ${user.name}` : "Vendedor no encontrado" };
}

export default async function SellerProfilePage({ params }: { params: Params }) {
  const { slug } = await params;

  let rate: BcvRate | null = null;
  try {
    rate = await getBcvRate();
  } catch {
    rate = null;
  }

  const seller = await findSellerBySlug(slug);
  if (!seller) notFound();

  return (
    <main id="main-content" className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-10 lg:pb-12">
      <section aria-label="Perfil del vendedor" className="mb-8 flex items-center gap-4">
        <Avatar size="lg" className="size-16">
          <AvatarImage src={seller.avatarUrl ?? undefined} alt={seller.name} />
          <AvatarFallback className="text-lg">{initials(seller.name)}</AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{seller.name}</h1>
          <p className="text-sm text-muted-foreground">
            {seller.products.length}{" "}
            {seller.products.length === 1 ? "publicación activa" : "publicaciones activas"}
          </p>
        </div>
      </section>

      <section aria-labelledby="seller-products-heading">
        <h2 id="seller-products-heading" className="mb-4 text-xl font-bold tracking-tight">
          Publicaciones
        </h2>
        {seller.products.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {seller.products.map((product) => (
              <ProductCard key={product.id} product={toCardProduct(product, rate)} />
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
            Este vendedor aún no tiene publicaciones activas.
          </p>
        )}
      </section>
    </main>
  );
}

async function findSellerBySlug(slug: string) {
  const sellers = await db.user.findMany({
    where: { products: { some: { status: "ACTIVE" } } },
    include: {
      products: {
        where: { status: "ACTIVE" },
        orderBy: { publishedAt: "desc" },
        include: cardIncludes,
      },
    },
  });
  return sellers.find((seller) => slugifyName(seller.name) === slug) ?? null;
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}
