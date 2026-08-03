// /categorias — Grilla de todas las categorías del marketplace (épica
// "Categorías multi"). Server Component: lee las categorías de la BD.
import type { Metadata } from "next";
import Link from "next/link";
import { Tag } from "lucide-react";
import { CATEGORY_ICONS } from "@/components/CategoryChips";
import type { CategorySlug } from "@/lib/constants";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Categorías",
  description: "Explora todas las categorías del catálogo de Tunapuy.",
};

export default async function CategoriasPage() {
  const categories = await db.category.findMany({ orderBy: { position: "asc" } });

  return (
    <main id="main-content" className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-10 lg:pb-12">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Categorías</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Explora el catálogo por categoría.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {categories.map((category) => {
          const Icon = CATEGORY_ICONS[category.slug as CategorySlug] ?? Tag;
          return (
            <Link
              key={category.id}
              href={`/buscar?categoria=${category.slug}`}
              className="group flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-5 text-center transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon aria-hidden="true" className="size-6" />
              </span>
              <span className="text-sm font-semibold">{category.name}</span>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
