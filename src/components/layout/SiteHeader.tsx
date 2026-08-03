"use client";

import { Search, Store } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/", label: "Inicio" },
  { href: "/#categorias", label: "Categorías" },
  { href: "/vender", label: "Vender" },
  { href: "/cuenta", label: "Cuenta" },
];

/**
 * Header desktop (≥lg) (docs/design-system.md §6): logo, buscador compacto
 * y navegación. Se oculta en móvil (la BottomNav lo sustituye).
 */
export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 hidden border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:block">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-6 px-4">
        <Link
          href="/"
          aria-label="Tunapuy — Inicio"
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-sm font-bold tracking-tight text-primary focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Store className="size-6" aria-hidden="true" />
          <span className="text-lg">Tunapuy</span>
        </Link>

        <form action="/buscar" method="get" role="search" className="relative max-w-xs flex-1">
          <label htmlFor="header-search" className="sr-only">
            Buscar productos
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            id="header-search"
            name="q"
            type="search"
            placeholder="¿Qué estás buscando?"
            autoComplete="off"
            className="h-10 w-full rounded-sm border border-input bg-muted pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </form>

        <nav aria-label="Navegación principal" className="ml-auto">
          <ul className="flex items-center gap-1">
            {NAV_LINKS.map((link) => {
              const active =
                link.href !== "/#categorias" && pathname === link.href;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-sm px-3 text-sm font-medium transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                      active
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
