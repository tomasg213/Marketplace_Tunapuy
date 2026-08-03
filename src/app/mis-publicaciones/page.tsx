// /mis-publicaciones — Dashboard del vendedor (Épica E2).
//
// Server component protegido (defensa en profundidad: el middleware ya redirige,
// la página re-valida la sesión). Lista los productos del usuario agrupados por
// estado (Activas / Agotadas / Borradores / Otras) usando `getMyProducts()`.
// El designer construirá la UI final del dashboard; aquí queda la capa de datos
// y una lista mínima funcional.
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Package } from "lucide-react";
import { getCurrentUser } from "@/server/auth/session";
import { getMyProducts, type MyProductsStatusFilter } from "@/server/products/service";
import { PRODUCT_STATUS, type ProductStatus } from "@/lib/constants";import { formatUsd } from "@/lib/format";
import { formatRelativeTime } from "@/lib/time";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Mis publicaciones",
  description: "Administra tus publicaciones en Tunapuy.",
};

const STATUS_GROUPS: { key: string; label: string; status: MyProductsStatusFilter }[] = [
  { key: "active", label: "Activas", status: PRODUCT_STATUS.ACTIVE },
  { key: "sold", label: "Agotadas", status: PRODUCT_STATUS.SOLD },
  { key: "draft", label: "Borradores", status: PRODUCT_STATUS.DRAFT },
  { key: "other", label: "Pausadas / Archivadas", status: "ALL" },
];

export default async function MyPublicationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/mis-publicaciones");

  const [active, sold, draft, other] = await Promise.all([
    getMyProducts(user.id, PRODUCT_STATUS.ACTIVE),
    getMyProducts(user.id, PRODUCT_STATUS.SOLD),
    getMyProducts(user.id, PRODUCT_STATUS.DRAFT),
    getMyProducts(user.id, "ALL"),
  ]);
  const all = [...active, ...sold, ...draft, ...other];
  const publishedCount = all.filter((p) => p.status !== PRODUCT_STATUS.DRAFT).length;

  return (
    <main id="main-content" className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-10 lg:pb-12">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mis publicaciones</h1>
          <p className="text-sm text-muted-foreground">
            {publishedCount} {publishedCount === 1 ? "publicación publicada" : "publicaciones publicadas"}
            {all.length > 0 && ` · ${all.length} en total`}
          </p>
        </div>
        <Link
          href="/vender"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-sm bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Plus aria-hidden="true" className="size-4" />
          Nueva publicación
        </Link>
      </header>

      {all.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-8">
          {STATUS_GROUPS.map((group) => {
            const items =
              group.key === "other"
                ? other.filter((p) => p.status === PRODUCT_STATUS.PAUSED || p.status === PRODUCT_STATUS.ARCHIVED)
                : group.key === "active"
                  ? active
                  : group.key === "sold"
                    ? sold
                    : draft;
            if (items.length === 0) return null;
            return (
              <section key={group.key} aria-labelledby={`group-${group.key}`}>
                <h2 id={`group-${group.key}`} className="mb-3 text-lg font-bold tracking-tight">
                  {group.label}{" "}
                  <span className="text-sm font-medium text-muted-foreground">({items.length})</span>
                </h2>
                <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                  {items.map((product) => (
                    <li key={product.id} className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold" data-testid="my-product-title">
                          {product.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatUsd(product.offerPriceUsd && product.offerPriceUsd.lessThan(product.priceUsd) ? product.offerPriceUsd : product.priceUsd)}
                          {product.publishedAt
                            ? ` · publicado ${formatRelativeTime(product.publishedAt)}`
                            : " · sin publicar"}
                        </p>
                      </div>
                      <StatusBadge status={product.status as ProductStatus} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}

function StatusBadge({ status }: { status: ProductStatus }) {
  const label: Record<ProductStatus, string> = {
    ACTIVE: "Activa",
    SOLD: "Agotada",
    DRAFT: "Borrador",
    PAUSED: "Pausada",
    ARCHIVED: "Archivada",
  };
  return (
    <Badge variant={status === PRODUCT_STATUS.SOLD ? "secondary" : "offer"}>{label[status]}</Badge>
  );
}

function EmptyState() {
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center"
    >
      <Package aria-hidden="true" className="size-10 text-muted-foreground" />
      <p className="text-base text-muted-foreground">Aún no tienes publicaciones.</p>
      <Link
        href="/vender"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-sm bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Plus aria-hidden="true" className="size-4" />
        Publica tu primer producto
      </Link>
    </div>
  );
}
