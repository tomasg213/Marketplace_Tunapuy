// /cuenta — Página de cuenta (épica "Perfiles editables").
//
// Server Component protegido: resuelve el usuario autenticado y delega la UI
// interactiva en `CuentaSettings` (cliente). El backend expone (en paralelo)
// `user.email` y `user.business`; mientras tanto la página es robusta: los
// campos son opcionales y la UI muestra fallbacks ("Sin email registrado",
// tarjeta "Crea tu negocio").
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { CuentaSettings, type CuentaSettingsUser } from "./cuenta-settings";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Mi cuenta",
  description: "Tu cuenta en Tunapuy.",
};

export default async function CuentaPage() {
  // Cast controlado contra el contrato de integración: `PublicUser` del
  // backend aún no incluye `email` ni `business` completo (migración en
  // paralelo); el cast simula el shape futuro y mantiene los campos opcionales.
  const user = (await getCurrentUser()) as CuentaSettingsUser | null;
  if (!user) redirect("/login?next=/cuenta");

  return (
    <main id="main-content" className="mx-auto w-full max-w-2xl flex-1 px-4 pt-6 pb-10 lg:pb-12">
      <CuentaSettings user={user} />
    </main>
  );
}
