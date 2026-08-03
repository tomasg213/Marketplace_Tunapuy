// /vender — Alta de publicación (Épica E2, formulario mínimo funcional).
//
// El designer construirá el stepper de 4 pasos del design-system; aquí queda la
// capa de datos completa end-to-end: server component protegido + formulario
// que usa la server action `createProduct` y, si hay imagen, la sube vía
// `/api/uploads` (magic bytes + almacenamiento local).
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { CATEGORIES } from "@/lib/constants";
import { ProductForm } from "./product-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Vender",
  description: "Publica tu primer producto en Tunapuy.",
};

export default async function VenderPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/vender");

  return (
    <main id="main-content" className="mx-auto w-full max-w-2xl flex-1 px-4 pt-6 pb-10 lg:pb-12">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Publica un producto</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Paso 1 de 4 (los siguientes pasos los construye el designer). Publica ahora y edítalo
          desde “Mis publicaciones”.
        </p>
      </header>

      <ProductForm
        categories={CATEGORIES.map((c) => ({ slug: c.slug, name: c.name }))}
        defaultPhoneNumber={user.phoneNumber}
      />
    </main>
  );
}
