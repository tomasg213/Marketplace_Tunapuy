// /negocios/[slug] — Perfil de negocio (Épica E1).
// Business sí tiene slug único; el botón WhatsApp usa el teléfono del negocio
// (docs/design-system.md §6: perfil de negocio con WhatsApp propio).
import type { Metadata } from "next";
import { Store } from "lucide-react";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/product/ProductCard";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { db } from "@/server/db";
import { cardIncludes, toCardProduct } from "@/server/products/queries";
import { getBcvRate, type BcvRate } from "@/server/rate/rate.service";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const business = await db.business.findUnique({ where: { slug }, select: { name: true } });
  return { title: business?.name ? `Negocio: ${business.name}` : "Negocio no encontrado" };
}

export default async function BusinessProfilePage({ params }: { params: Params }) {
  const { slug } = await params;

  let rate: BcvRate | null = null;
  try {
    rate = await getBcvRate();
  } catch {
    rate = null;
  }

  const business = await db.business.findUnique({
    where: { slug },
    include: {
      products: {
        where: { status: "ACTIVE" },
        orderBy: { publishedAt: "desc" },
        include: cardIncludes,
      },
    },
  });

  if (!business) notFound();

  return (
    <main id="main-content" className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-10 lg:pb-12">
      <section aria-label="Perfil del negocio" className="mb-8">
        <div className="flex items-start gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
            {business.logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element -- logos del seed son locales */
              <img
                src={business.logoUrl}
                alt={`Logo de ${business.name}`}
                className="size-full object-cover"
              />
            ) : (
              <Store aria-hidden="true" className="size-7 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight">{business.name}</h1>
            {business.description && (
              <p className="mt-1 text-sm text-muted-foreground">{business.description}</p>
            )}
            <p className="mt-2 text-sm text-muted-foreground">
              {business.products.length}{" "}
              {business.products.length === 1 ? "publicación activa" : "publicaciones activas"}
            </p>
          </div>
        </div>
        {business.phoneNumber && (
          <WhatsAppButton
            phoneNumber={business.phoneNumber}
            sellerName={business.name}
            message={`¡Hola! Me interesa lo que publican en "${business.name}" en Tunapuy.`}
            className="mt-4 w-full sm:w-auto sm:min-w-64"
          />
        )}
      </section>

      <section aria-labelledby="business-products-heading">
        <h2 id="business-products-heading" className="mb-4 text-xl font-bold tracking-tight">
          Publicaciones
        </h2>
        {business.products.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {business.products.map((product) => (
              <ProductCard key={product.id} product={toCardProduct(product, rate)} />
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
            Este negocio aún no tiene publicaciones activas.
          </p>
        )}
      </section>
    </main>
  );
}
