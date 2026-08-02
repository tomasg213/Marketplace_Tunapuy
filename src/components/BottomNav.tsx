"use client";

import { Home, LayoutGrid, Package, Plus, User, type LucideIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/#categorias", label: "Categorías", icon: LayoutGrid },
  { href: "/vender", label: "Vender", icon: Plus },
  { href: "/mis-publicaciones", label: "Mis publicaciones", icon: Package },
  { href: "/cuenta", label: "Cuenta", icon: User },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card lg:hidden"
    >
      <div className="grid h-16 grid-cols-5 items-stretch px-1 pb-[env(safe-area-inset-bottom)]">
        {NAV_ITEMS.map((item) => {
          if (item.href === "/vender") {
            return (
              <div key={item.href} className="relative flex items-end justify-center">
                <a
                  href={item.href}
                  aria-label="Publicar un producto en venta"
                  className="absolute top-0 left-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background transition-colors hover:bg-primary/90 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <Plus className="size-6" aria-hidden="true" />
                </a>
                <span className="pb-1.5 text-[11px] font-semibold text-primary">Vender</span>
              </div>
            );
          }
          const active = isActive(pathname, item.href);
          return (
            <a
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-16 flex-col items-center justify-center gap-0.5 px-1 text-center text-[11px] leading-tight font-medium transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <item.icon className="size-5 shrink-0" aria-hidden="true" />
              <span>{item.label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href.startsWith("/#")) return false;
  return pathname === href;
}
