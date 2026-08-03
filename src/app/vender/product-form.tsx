// Formulario de alta de publicación (Épica E2) — cliente.
//
// - Usa la server action `createProduct` (validación + ownership en el servidor).
// - Categorías múltiples (1–3) con `CategoryPicker`; la primera = principal.
// - Si hay imagen seleccionada, la sube después por `POST /api/uploads`
//   (multipart; el dueño se valida con la sesión). En success redirige a
//   /mis-publicaciones.
"use client";

import { useCallback, useState } from "react";
import { ImagePlus } from "lucide-react";
import type { CategorySlug } from "@/lib/constants";
import { createProduct, type ProductActionResult } from "@/server/products/actions";
import { CategoryPicker } from "@/components/CategoryPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface ProductFormProps {
  categories: { slug: CategorySlug; name: string }[];
  defaultPhoneNumber: string;
}

export function ProductForm({ categories, defaultPhoneNumber }: ProductFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categorySlugs, setCategorySlugs] = useState<CategorySlug[]>([]);
  const [priceUsd, setPriceUsd] = useState("");
  const [offerPriceUsd, setOfferPriceUsd] = useState("");
  const [phoneNumber, setPhoneNumber] = useState(defaultPhoneNumber);
  const [file, setFile] = useState<File | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setError(null);
      if (categorySlugs.length === 0) {
        setCategoryError("Elige al menos una categoría.");
        return;
      }
      setCategoryError(null);
      setLoading(true);
      try {
        const result: ProductActionResult = await createProduct({
          title,
          description: description.trim() || undefined,
          categorySlugs,
          priceUsd: Number(priceUsd),
          offerPriceUsd: offerPriceUsd.trim() ? Number(offerPriceUsd) : null,
          phoneNumber,
          status: "ACTIVE",
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }

        if (file) {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("folder", "products");
          formData.append("productId", result.id);
          const uploadRes = await fetch("/api/uploads", { method: "POST", body: formData });
          if (!uploadRes.ok) {
            const body = (await uploadRes.json()) as { error?: string };
            setError(body.error ?? "El producto se creó, pero la imagen no se pudo subir");
            return;
          }
        }

        // Navegación completa al dashboard (no `router.push` + `refresh`):
        // el `refresh` justo después del `push` cancela la navegación del App
        // Router (observado en e2e, igual que en /login) y se queda en /vender.
        // Con `window.location.assign` se fuerza una request nueva que el
        // middleware deja pasar con la sesión ya establecida.
        window.location.assign("/mis-publicaciones");
      } catch {
        setError("Error de red. Intenta de nuevo");
      } finally {
        setLoading(false);
      }
    },
    [title, description, categorySlugs, priceUsd, offerPriceUsd, phoneNumber, file],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="product-title">Título *</Label>
        <Input
          id="product-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ej. Empanadas caseras de queso"
          required
          minLength={3}
          maxLength={120}
          aria-invalid={error ? true : undefined}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="product-description">Descripción</Label>
        <Textarea
          id="product-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe tu producto, condiciones, forma de entrega…"
          rows={4}
          maxLength={2000}
        />
      </div>

      <CategoryPicker
        categories={categories}
        selected={categorySlugs}
        onChange={(selected) => {
          setCategorySlugs(selected);
          setCategoryError(null);
        }}
        error={categoryError}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="product-price">Precio (USD) *</Label>
          <Input
            id="product-price"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            value={priceUsd}
            onChange={(e) => setPriceUsd(e.target.value)}
            placeholder="25.00"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="product-offer">Precio de oferta (USD)</Label>
          <Input
            id="product-offer"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            value={offerPriceUsd}
            onChange={(e) => setOfferPriceUsd(e.target.value)}
            placeholder="Opcional"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="product-phone">Teléfono de contacto (E.164) *</Label>
        <Input
          id="product-phone"
          type="tel"
          inputMode="tel"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="product-image">Foto del producto</Label>
        <label
          htmlFor="product-image"
          className="flex min-h-24 cursor-pointer items-center justify-center gap-2 rounded-sm border border-dashed border-border bg-muted/40 px-4 text-sm text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
        >
          <ImagePlus aria-hidden="true" className="size-5" />
          {file ? file.name : "Selecciona una imagen (JPG, PNG o WebP, máx 5 MB)"}
        </label>
        <input
          id="product-image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={loading || !title || !priceUsd}>
          {loading ? "Publicando…" : "Publicar producto"}
        </Button>
      </div>
    </form>
  );
}
