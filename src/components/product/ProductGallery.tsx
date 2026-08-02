"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export type ProductGalleryImage = {
  url: string;
  alt?: string | null;
};

/**
 * Galería básica (docs/design-system.md §6): imagen principal 4:3, contador
 * y thumbnails. Sin autoplay ni carrusel automático (regla WCAG).
 */
export function ProductGallery({
  images,
  title,
}: {
  images: ProductGalleryImage[];
  title: string;
}) {
  const [index, setIndex] = useState(0);
  const current = images[Math.min(index, images.length - 1)];

  return (
    <figure>
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element -- fotos del seed son locales (/placeholder.svg); next/image requiere config de dominios remotos (E1) */}
        <img
          src={current.url}
          alt={current.alt ?? title}
          className="h-full w-full object-cover"
        />
        <figcaption className="sr-only">
          {current.alt ?? title} — imagen {index + 1} de {images.length}
        </figcaption>
        <span className="absolute top-3 right-3 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white tabular-nums">
          {index + 1} / {images.length}
        </span>
      </div>

      {images.length > 1 && (
        <ul className="mt-3 flex flex-wrap gap-2" role="list">
          {images.map((image, i) => {
            const selected = i === index;
            return (
              <li key={image.url + i}>
                <button
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Ver imagen ${i + 1} de ${images.length}: ${image.alt ?? title}`}
                  aria-current={selected}
                  className={cn(
                    "flex size-14 items-center justify-center overflow-hidden rounded-md border-2 transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                    selected
                      ? "border-primary"
                      : "border-transparent hover:border-border",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- misma razón que arriba */}
                  <img src={image.url} alt="" className="h-full w-full object-cover" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </figure>
  );
}
