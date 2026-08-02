import {
  Car,
  Footprints,
  Shirt,
  SprayCan,
  Tag,
  UtensilsCrossed,
  Wine,
  type LucideIcon,
} from "lucide-react";
import type { CategorySlug } from "@/lib/constants";
import { cn } from "@/lib/utils";

const CATEGORY_ICONS: Record<CategorySlug, LucideIcon> = {
  comida: UtensilsCrossed,
  ropa: Shirt,
  zapatos: Footprints,
  perfume: SprayCan,
  automotriz: Car,
  licor: Wine,
};

export type CategoryChip = {
  slug: string;
  name: string;
  icon?: string | null;
};

export function CategoryChips({
  categories,
  className,
}: {
  categories: CategoryChip[];
  className?: string;
}) {
  return (
    <nav
      aria-label="Categorías"
      className={cn(
        "-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      <ul className="flex gap-2">
        {categories.map((category) => {
          const Icon = CATEGORY_ICONS[category.slug as CategorySlug] ?? Tag;
          return (
            <li key={category.slug} className="shrink-0">
              <a
                href={`/buscar?categoria=${category.slug}`}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-secondary px-4 text-sm font-medium text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span>{category.name}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
