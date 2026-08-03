// /cuenta — Ajustes de cuenta y negocio (cliente).
//
// - Edición inline de perfil: nombre, email opcional y avatar (upload a
//   `/api/uploads` folder=users). El teléfono es SOLO LECTURA (login OTP).
// - Tarjeta "Mi negocio": edición inline si existe (logo + datos), o el mismo
//   formulario en modo alta si no existe (createBusiness).
// - Las server actions `updateUserProfileAction` / `updateBusinessAction`
//   viven en `@/server/cuenta/actions` (las crea el backend; aquí se importan).
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, Pencil, Phone, Plus, Store } from "lucide-react";
import { createBusiness } from "@/server/business/actions";
import { updateBusinessAction, updateUserProfileAction } from "@/server/cuenta/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LogoutButton } from "./logout-button";

export interface CuentaBusiness {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  phoneNumber?: string | null;
  logoUrl?: string | null;
}

export interface CuentaSettingsUser {
  id: string;
  name: string;
  phoneNumber: string;
  role: string;
  slug: string;
  businessId: string | null;
  avatarUrl: string | null;
  email?: string | null;
  business?: CuentaBusiness | null;
}

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB (mismo límite que el backend)

function validateImage(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return "Formato no válido: usa JPG, PNG o WebP";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return "El archivo supera el máximo de 5 MB";
  }
  return null;
}

async function uploadImage(
  file: File,
  folder: "users" | "businesses",
  businessId?: string,
): Promise<{ url: string; key: string }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", folder);
  if (folder === "businesses" && businessId) {
    formData.append("businessId", businessId);
  }
  const res = await fetch("/api/uploads", { method: "POST", body: formData });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "No se pudo subir la imagen");
  }
  return (await res.json()) as { url: string; key: string };
}

function initials(name?: string | null): string {
  const words = (name ?? "").trim().split(/\s+/);
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

export function CuentaSettings({ user }: { user: CuentaSettingsUser }) {
  const router = useRouter();
  const [editing, setEditing] = useState<"profile" | "business" | null>(null);

  const roleLabel = user.role === "SELLER" ? "Vendedor" : "Comprador";
  const business = user.business ?? null;

  function closeEditor() {
    setEditing(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-4">
        <Avatar size="lg">
          <AvatarImage src={user.avatarUrl ?? undefined} alt={user.name} />
          <AvatarFallback>{initials(user.name)}</AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{user.name}</h1>
          <p className="text-sm text-muted-foreground">
            {user.phoneNumber} · {roleLabel}
          </p>
        </div>
      </header>

      {editing === "profile" ? (
        <ProfileForm
          initialName={user.name}
          initialEmail={user.email ?? ""}
          initialAvatarUrl={user.avatarUrl}
          phoneNumber={user.phoneNumber}
          onCancel={() => setEditing(null)}
          onSaved={closeEditor}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Datos personales</CardTitle>
            <CardAction>
              <Button variant="outline" size="sm" onClick={() => setEditing("profile")}>
                <Pencil aria-hidden="true" className="size-3.5" />
                Editar
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground">Nombre</p>
              <p className="text-sm font-medium">{user.name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="text-sm">{user.email || "Sin email registrado"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Teléfono</p>
              <p className="text-sm">{user.phoneNumber}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {editing === "business" ? (
        <BusinessForm
          mode="edit"
          initial={business}
          onCancel={() => setEditing(null)}
          onSaved={closeEditor}
        />
      ) : business ? (
        <Card>
          <CardHeader>
            <CardTitle>Mi negocio</CardTitle>
            <CardAction>
              <Button variant="outline" size="sm" onClick={() => setEditing("business")}>
                <Pencil aria-hidden="true" className="size-3.5" />
                Editar
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-3">
              <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                {business.logoUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- logo local o subido */
                  <img
                    src={business.logoUrl}
                    alt={`Logo de ${business.name}`}
                    className="size-full rounded-full object-cover"
                  />
                ) : (
                  <Store aria-hidden="true" className="size-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{business.name}</p>
                {business.description && (
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                    {business.description}
                  </p>
                )}
                {business.phoneNumber && (
                  <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone aria-hidden="true" className="size-3" />
                    {business.phoneNumber}
                  </p>
                )}
              </div>
            </div>
            <Link
              href={`/negocios/${business.slug}`}
              className="mt-4 inline-flex min-h-11 items-center rounded-sm text-sm font-semibold text-primary underline-offset-4 transition-colors hover:underline focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Ver perfil público →
            </Link>
          </CardContent>
        </Card>
      ) : (
        <BusinessForm
          mode="create"
          initial={null}
          onCancel={() => setEditing(null)}
          onSaved={closeEditor}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Más</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <nav aria-label="Acciones de cuenta" className="divide-y divide-border">
            <Link
              href="/mis-publicaciones"
              className="flex items-center justify-between gap-4 px-4 py-4 text-sm transition-colors hover:bg-muted"
            >
              <span className="font-medium">Mis publicaciones</span>
              <span className="text-muted-foreground">→</span>
            </Link>
            <Link
              href="/vender"
              className="flex items-center justify-between gap-4 px-4 py-4 text-sm transition-colors hover:bg-muted"
            >
              <span className="inline-flex items-center gap-2 font-medium">
                <Plus aria-hidden="true" className="size-4 text-muted-foreground" />
                Publicar un producto
              </span>
              <span className="text-muted-foreground">→</span>
            </Link>
          </nav>
        </CardContent>
      </Card>

      <div>
        <LogoutButton />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Datos personales
// ---------------------------------------------------------------------------

function ProfileForm({
  initialName,
  initialEmail,
  initialAvatarUrl,
  phoneNumber,
  onCancel,
  onSaved,
}: {
  initialName: string;
  initialEmail: string;
  initialAvatarUrl: string | null;
  phoneNumber: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;
    const validationError = validateImage(file);
    if (validationError) {
      setAvatarError(validationError);
      setAvatarFile(null);
      setAvatarPreview(null);
      return;
    }
    setAvatarError(null);
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("El nombre es obligatorio");
      return;
    }
    if (avatarFile) {
      const validationError = validateImage(avatarFile);
      if (validationError) {
        setAvatarError(validationError);
        return;
      }
    }
    setSaving(true);
    try {
      let avatarUrl: string | null | undefined = avatarFile ? undefined : initialAvatarUrl;
      if (avatarFile) {
        const uploaded = await uploadImage(avatarFile, "users");
        avatarUrl = uploaded.url;
      }
      const result = await updateUserProfileAction({
        name: trimmedName,
        email: email.trim() ? email.trim() : null,
        avatarUrl,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Perfil actualizado");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el perfil");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Editar datos personales</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="flex items-center gap-4">
            <Avatar size="lg">
              <AvatarImage
                src={avatarPreview ?? initialAvatarUrl ?? undefined}
                alt="Foto de perfil"
              />
              <AvatarFallback>{initials(initialName)}</AvatarFallback>
            </Avatar>
            <div>
              <label
                htmlFor="profile-avatar"
                className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-sm border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
              >
                <Camera aria-hidden="true" className="size-4" />
                Cambiar foto
              </label>
              <input
                id="profile-avatar"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={handleAvatarChange}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                JPG, PNG o WebP, máx 5 MB
              </p>
            </div>
          </div>

          {avatarError && (
            <p role="alert" className="text-sm text-destructive">
              {avatarError}
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="profile-name">Nombre *</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              aria-invalid={error ? true : undefined}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-email">Email</Label>
            <Input
              id="profile-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Opcional"
              autoComplete="email"
            />
          </div>

          <div className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            Tu teléfono ({phoneNumber}) es tu método de inicio de sesión y no se puede cambiar
            desde aquí.
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
            <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Negocio (alta / edición)
// ---------------------------------------------------------------------------

function BusinessForm({
  mode,
  initial,
  onCancel,
  onSaved,
}: {
  mode: "create" | "edit";
  initial: CuentaBusiness | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [phone, setPhone] = useState(initial?.phoneNumber ?? "");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    return () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
    };
  }, [logoPreview]);

  function handleLogoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;
    const validationError = validateImage(file);
    if (validationError) {
      setLogoError(validationError);
      setLogoFile(null);
      setLogoPreview(null);
      return;
    }
    setLogoError(null);
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setError("El nombre debe tener al menos 2 caracteres");
      return;
    }
    // En modo alta el backend exige el teléfono del negocio (schema actual).
    if (mode === "create" && !phone.trim()) {
      setError("El teléfono del negocio es obligatorio");
      return;
    }
    if (logoFile) {
      const validationError = validateImage(logoFile);
      if (validationError) {
        setLogoError(validationError);
        return;
      }
    }
    setSaving(true);
    try {
      let businessId: string;
      if (mode === "create") {
        const result = await createBusiness({
          name: trimmedName,
          description: description.trim() || undefined,
          phoneNumber: phone.trim(),
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        businessId = result.id;
      } else {
        businessId = initial?.id ?? "";
      }

      let logoUrl: string | null | undefined = mode === "edit" ? initial?.logoUrl : undefined;
      if (logoFile) {
        const uploaded = await uploadImage(logoFile, "businesses", businessId);
        logoUrl = uploaded.url;
      }

      const update = await updateBusinessAction({
        name: trimmedName,
        description: description.trim() ? description.trim() : null,
        phoneNumber: phone.trim() ? phone.trim() : null,
        logoUrl,
      });
      if (!update.ok) {
        setError(update.error);
        return;
      }

      toast.success(mode === "create" ? "Negocio creado" : "Negocio actualizado");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el negocio");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === "create" ? "Crea tu negocio" : "Editar negocio"}</CardTitle>
        {mode === "create" && (
          <CardDescription>
            Muestra tu marca y centraliza tus publicaciones.
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="flex items-center gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
              {logoPreview ?? initial?.logoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element -- logo local o subido */
                <img
                  src={logoPreview ?? initial?.logoUrl ?? ""}
                  alt="Logo del negocio"
                  className="size-full rounded-full object-cover"
                />
              ) : (
                <Store aria-hidden="true" className="size-5 text-muted-foreground" />
              )}
            </div>
            <div>
              <label
                htmlFor="business-logo"
                className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-sm border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
              >
                <Camera aria-hidden="true" className="size-4" />
                Cambiar logo
              </label>
              <input
                id="business-logo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={handleLogoChange}
              />
              <p className="mt-1 text-xs text-muted-foreground">JPG, PNG o WebP, máx 5 MB</p>
            </div>
          </div>

          {logoError && (
            <p role="alert" className="text-sm text-destructive">
              {logoError}
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="business-name">Nombre *</Label>
            <Input
              id="business-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              maxLength={120}
              aria-invalid={error ? true : undefined}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="business-description">Descripción</Label>
            <Textarea
              id="business-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe tu negocio…"
              rows={4}
              maxLength={1000}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="business-phone">
              Teléfono (E.164){mode === "create" ? " *" : ""}
            </Label>
            <Input
              id="business-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+584120000000"
              required={mode === "create"}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando…" : mode === "create" ? "Crear negocio" : "Guardar cambios"}
            </Button>
            <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
