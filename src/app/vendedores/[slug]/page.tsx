// /vendedores/[slug] — Perfil de vendedor persona (Épica E1, actualizado E2).
// E2: lookup por `User.slug` (único, backfill aplicado). Mejora: un usuario con
// role SELLER pero sin publicaciones activas renderiza su perfil con estado
// vacío (200, no 404). Las cuentas BUYER no se exponen (404).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/product/ProductCard";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { USER_ROLE } from "@/lib/constants";
import { db } from "@/server/db";
import { cardIncludes, toCardProduct } from "@/server/products/queries";
import { getBcvRate, type BcvRate } from "@/server/rate/rate.service";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const user = await db.user.findUnique({
    where: { slug },
    select: { name: true, role: true },
  });
  const visible = user && user.role === USER_ROLE.SELLER;
  return { title: visible ? `Vendedor: ${user.name}` : "Vendedor no encontrado" };
}

export default async function SellerProfilePage({ params }: { params: Params }) {
  const { slug } = await params;

  let rate: BcvRate | null = null;
  try {
    rate = await getBcvRate();
  } catch {
    rate = null;
  }

  const seller = await db.user.findUnique({
    where: { slug },
    include: {
      products: {
        where: { status: "ACTIVE" },
        orderBy: { publishedAt: "desc" },
        include: cardIncludes,
      },
    },
  });

  // Solo perfiles SELLER: las cuentas BUYER (que no publican) no se exponen.
  if (!seller || seller.role !== USER_ROLE.SELLER) notFound();

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
          <div
            role="status"
            className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center"
          >
            <p className="text-base text-muted-foreground">
              Este vendedor aún no tiene publicaciones activas.
            </p>
            <a
              href="/vender"
              className="inline-flex min-h-11 items-center justify-center rounded-sm bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              ¿Quieres vender aquí?
            </a>
          </div>
        )}
      </section>
    </main>
  );
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}
