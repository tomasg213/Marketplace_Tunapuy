// CategoryPicker — selector multi-categoría del formulario de publicación.
//
// - Chips/pills toggleables con checkbox nativo oculto (sr-only) dentro de un
//   <label>: foco visible con focus-within, Tab/Espacio gratis (WCAG).
// - Máximo 3 categorías; mantiene el orden de selección (el primero = principal).
"use client";

import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const MAX_CATEGORIES = 3;

export interface CategoryPickerProps<T extends string> {
  categories: { slug: T; name: string }[];
  selected: T[];
  onChange: (selected: T[]) => void;
  error?: string | null;
}

export function CategoryPicker<T extends string>({
  categories,
  selected,
  onChange,
  error,
}: CategoryPickerProps<T>) {
  const atLimit = selected.length >= MAX_CATEGORIES;
  const firstCheckboxRef = useRef<HTMLInputElement | null>(null);
  const errorId = "category-picker-error";

  useEffect(() => {
    if (error) firstCheckboxRef.current?.focus();
  }, [error]);

  function handleToggle(slug: T) {
    if (selected.includes(slug)) {
      onChange(selected.filter((s) => s !== slug));
    } else if (!atLimit) {
      onChange([...selected, slug]);
    }
  }

  return (
    <fieldset
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : "category-picker-hint"}
      className={cn(
        "rounded-md border p-3",
        error ? "border-destructive" : "border-transparent",
      )}
    >
      <legend className="text-sm font-medium">Categorías *</legend>

      <div className="mt-3 flex flex-wrap gap-2">
        {categories.map((category, index) => {
          const isSelected = selected.includes(category.slug);
          const isDisabled = !isSelected && atLimit;
          return (
            <label
              key={category.slug}
              className={cn(
                "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors select-none focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground",
                isDisabled && "cursor-not-allowed opacity-50",
              )}
            >
              <input
                ref={index === 0 ? firstCheckboxRef : undefined}
                type="checkbox"
                className="sr-only"
                checked={isSelected}
                disabled={isDisabled}
                onChange={() => handleToggle(category.slug)}
                aria-invalid={error ? true : undefined}
                aria-label={
                  isSelected ? `${category.name} (seleccionada)` : `${category.name} (no seleccionada)`
                }
              />
              <Check
                aria-hidden="true"
                className={cn(
                  "size-4 shrink-0 transition-opacity",
                  isSelected ? "opacity-100" : "opacity-0",
                )}
              />
              <span>{category.name}</span>
            </label>
          );
        })}
      </div>

      <div className="mt-3 space-y-1 text-sm">
        <p id="category-picker-hint" className="text-muted-foreground">
          Elige hasta 3 categorías. La primera será la principal.
        </p>
        <p aria-live="polite" className="font-medium text-muted-foreground">
          {selected.length} de {MAX_CATEGORIES} seleccionadas
        </p>
        {atLimit && (
          <p className="font-medium text-muted-foreground">
            Límite alcanzado: puedes elegir hasta {MAX_CATEGORIES} categorías.
          </p>
        )}
      </div>

      {error && (
        <p id={errorId} role="alert" className="mt-2 text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
