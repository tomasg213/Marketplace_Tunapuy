import type { Metadata } from "next";
// Fuentes servidas localmente vía Fontsource (sin descarga en build desde
// fonts.gstatic.com): el entorno de CI/dev no tiene acceso al CDN de Google
// Fonts y `next/font/google` hacía fallar `npm run build`. Mismo tipo de
// letra (Inter / Geist Mono) que antes, autohospedada.
import "@fontsource-variable/inter";
import "@fontsource-variable/geist-mono";
import { BottomNav } from "@/components/BottomNav";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Tunapuy — Vitrina local",
    template: "%s | Tunapuy",
  },
  description:
    "Descubre productos y negocios locales en Tunapuy: comida, ropa, zapatos, perfume, automotriz y licor.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className="h-full antialiased [--font-inter:'Inter_Variable'] [--font-geist-mono:'Geist_Mono_Variable']"
    >
      <body className="flex min-h-full flex-col pb-24 lg:pb-0">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-sm focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
        >
          Saltar al contenido
        </a>
        <SiteHeader />
        <div className="flex-1">{children}</div>
        <SiteFooter />
        <BottomNav />
      </body>
    </html>
  );
}
