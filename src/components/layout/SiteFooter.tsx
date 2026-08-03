// Footer desktop (≥lg) con tasa BCV del día, fecha y enlaces legales
// (docs/design-system.md §6). Se oculta en móvil (la BottomNav lo sustituye).
// La tasa se calcula server-side; si no hay fuente, se informa la ausencia.
import { formatBs } from "@/lib/format";
import { formatDateLong } from "@/lib/time";
import { getBcvRate, type BcvRate } from "@/server/rate/rate.service";

const LEGAL_LINKS = [
  { href: "/terminos", label: "Términos" },
  { href: "/privacidad", label: "Privacidad" },
  { href: "/contacto", label: "Contacto" },
];

export async function SiteFooter() {
  let rate: BcvRate | null = null;
  try {
    rate = await getBcvRate();
  } catch {
    rate = null;
  }

  return (
    <footer className="hidden border-t border-border bg-card lg:block">
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <p data-testid="rate-info" className="text-sm text-muted-foreground">
          {rate ? (
            <>
              Tasa BCV del día:{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {formatBs(rate.usdToBs)}
              </span>{" "}
              por US$ 1,00 <span className="text-xs">(origen: {rate.origin})</span>
            </>
          ) : (
            "Tasa BCV no disponible."
          )}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Fecha: {formatDateLong(new Date())}
        </p>
        <nav aria-label="Enlaces legales" className="mt-4">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="inline-flex min-h-8 items-center rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <p className="mt-4 text-xs text-muted-foreground">
          © {new Date().getFullYear()} Tunapuy · Vitrina de productos locales.
        </p>
      </div>
    </footer>
  );
}
