// /login — Acceso por teléfono + código OTP (Épica E2).
//
// Implementación mínima y funcional de la capa de datos (el designer construirá
// la UI final con el patrón del design-system): paso 1 pide el teléfono,
// paso 2 verifica el código y crea la sesión. En dev (OTP_PROVIDER=dev) el
// código llega por consola del servidor y la API lo devuelve como `devCode`
// para el UX de desarrollo (nunca en producción).
"use client";

import { Suspense, useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-40" />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/mis-publicaciones";

  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [requested, setRequested] = useState(false);

  const requestCode = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setError(null);
      setLoading(true);
      try {
        const res = await fetch("/api/auth/request", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ phoneNumber }),
        });
        const body = (await res.json()) as { error?: string; devCode?: string | null };
        if (!res.ok) {
          setError(body.error ?? "No se pudo enviar el código");
          return;
        }
        setDevCode(body.devCode ?? null);
        setRequested(true);
      } catch {
        setError("Error de red. Intenta de nuevo");
      } finally {
        setLoading(false);
      }
    },
    [phoneNumber],
  );

  const verifyCode = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setError(null);
      setLoading(true);
      try {
        const res = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ phoneNumber, code, redirectTo: next }),
        });
        const body = (await res.json()) as { error?: string; redirectTo?: string };
        if (!res.ok) {
          setError(body.error ?? "No se pudo verificar el código");
          return;
        }
        // Navegación al destino original (deep-link). Usamos una navegación
        // completa (`window.location.assign`) y no `router.push`: el cliente
        // prefetchó `/vender` (o `/mis-publicaciones`) mientras no había sesión
        // y el middleware respondió 307; el App Router cachea ese redirect y
        // al navegar con `router.push` resuelve el redirect cacheado a la
        // URL de login (no navega, no dispara ninguna request). Con
        // `location.assign` se fuerza una petición nueva con la cookie de
        // sesión ya establecida y el middleware deja pasar.
        const destination = body.redirectTo ?? "/mis-publicaciones";
        window.location.assign(destination);
      } catch {
        setError("Error de red. Intenta de nuevo");
      } finally {
        setLoading(false);
      }
    },
    [phoneNumber, code, next],
  );

  return (
    <main id="main-content" className="mx-auto w-full max-w-md flex-1 px-4 pt-10 pb-10 lg:pb-12">
      <div className="mb-8">
        <div className="mb-3 flex size-11 items-center justify-center rounded-md bg-primary/10 text-primary">
          <MessageSquare aria-hidden="true" className="size-5" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          {requested ? "Ingresa el código" : "Inicia sesión en Tunapuy"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Te enviamos un código por WhatsApp. Sin contraseñas.
        </p>
      </div>

      {!requested ? (
        <form onSubmit={requestCode} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="login-phone">Teléfono (con código de país)</Label>
            <Input
              id="login-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+584120000000"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              required
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "login-error" : undefined}
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={loading || phoneNumber.length < 7}>
              {loading ? "Enviando…" : "Enviar código"}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="login-code">Código de 6 dígitos</Label>
            <Input
              id="login-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              required
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "login-error" : undefined}
            />
          </div>

          {devCode && (
            <p className="rounded-md border border-dashed border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
              Modo desarrollo: tu código es{" "}
              <strong className="tabular-nums" data-testid="otp-dev-code">
                {devCode}
              </strong>{" "}
              (solo aparece con OTP_PROVIDER=dev).
            </p>
          )}

          {error && (
            <p id="login-error" role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setRequested(false)}
              className="inline-flex min-h-11 items-center gap-1 rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              Cambiar teléfono
            </button>
            <Button type="submit" disabled={loading || code.length !== 6}>
              {loading ? "Verificando…" : "Entrar"}
            </Button>
          </div>
        </form>
      )}
    </main>
  );
}
