# Roadmap — Marketplace_Tunapuy (épicas E0–E5)

> Documento de planificación de épicas. Las épicas las desglosa y delega el `product-manager`.
> Estado: E0 implementado. E1 en curso (auth OTP + publicaciones). E3 "Perfiles editables"
> avanzado con refactor de capa de servicio + endurecimiento de seguridad (2026-08-03).
> Pendiente de commit por pasos y de las siguientes épicas.

---

## Última sesión (2026-08-03) — Refactor capa de servicio + fix de caída

**Incidente:** la web devolvía HTTP 500 en todas las rutas por colisión de nombres en
`src/server/business/actions.ts` (`createBusiness` importado del servicio y declarado como
server action → error de compilación Turbopack). Corregido con alias en las importaciones.

**Refactor completado (perfiles editables, E3):**
- Lógica de negocio extraída de las server actions a una capa de servicios:
  `src/server/business/service.ts` (create/updateBusiness con errores propios) y
  `src/server/users/profile-service.ts` (updateUserProfile).
- `cuenta/actions.ts` quedó como capa fina "use server" (auth + traducción de errores).
- Eliminado el `updateBusinessAction` duplicado; `business/actions.ts` solo expone `createBusiness`.
- Bug corregido: `avatarUrl`/`logoUrl` con `null` (limpiar imagen) ya no lanzan error.
- Defensa en profundidad (dictamen security): la política de imágenes
  (`assertUploadedImageUrl`, solo `/uploads/<folder>/` de nuestro origen) se aplica ahora en
  el servicio (`ImagePolicyError`), no solo en la acción. Bloques incluyen `javascript:`,
  `data:` y URLs externas (zod `.url()` NO bloquea `javascript:` por sí solo).
- Restaurado `.trim()` en el email; test flaky de `rate-limit.test.ts` estabilizado (windowMs 1000).
- Cobertura: +19 tests de integración nuevos (business.service, profile-service, política de
  imágenes). Suite total: 207 unit + 29 E2E en verde; tsc/lint/build limpios.

**Verificaciones:** `npm run test` 207/207 · `npm run test:e2e` 29/29 · `tsc --noEmit` 0 ·
`lint` 0 errores · home/buscar/login 200 · `/cuenta` 307 sin sesión.

---

## E0 — Scaffold y vitrina local (base)

**Objetivo:** dejar el proyecto en pie con la vitrina navegable usando datos mock.

- Scaffold Next.js (App Router) + TypeScript + Tailwind v4 + shadcn/ui. ✅
- Prisma 7: schema (User, Business, Category, Product, ProductImage, RateCache, OtpCode),
  migración inicial, seed controlado por `DATA_MODE` (mock/real). ✅
- PostgreSQL en dev y prod (docker-compose postgres:16 / gestionado). ✅
- Servicio de tasa BCV (`rate.service.ts` + `convert.ts`) con caché híbrida y fallback. ✅
- Auth: modelo y capa OTP (teléfono + código, `OtpCode.codeHash`) — flujo funcional en E1. ✅
- Páginas: `/` implementada; `/categorias/[slug]`, `/productos/[slug]`, `/vendedores/[slug]`,
  `/negocios/[slug]`, `/vender`, `/mis-publicaciones`, `/auth/*` en E1/E2.
- Precio en Bs calculado en render (Server Component) con `PriceDisplay` (designer). ✅ (cálculo)
- Testing: Vitest (convert, format, otp-utils) + Playwright smoke de home. ✅
- Env: `.env.example`, validación con zod en `src/server/env.ts`. ✅

**Definición de hecho:** cumplida — build y lint verdes; home muestra categorías + recientes
con Bs calculado y datos mock; Vitest 24/24 y E2E smoke en verde.

---

## E1 — Cuentas y publicaciones (auth OTP + CRUD del vendedor)

**Objetivo:** que una persona o negocio publique y gestione sus productos.

- Auth **OTP por teléfono** (decisión E0): rutas `/api/auth/otp/request` y `/verify`,
  sesión con cookie httpOnly firmada; revisión obligatoria de `security-reviewer` antes de
  implementar el envío real por WhatsApp (Meta Cloud API).
- Roles BUYER / SELLER / ADMIN (constantes TS + validación).
- Perfil de vendedor (persona) y de negocio (crear negocio vinculado a la cuenta).
- CRUD de publicaciones en `/mis-publicaciones`: crear, editar, pausar, archivar, eliminar.
- Validaciones de negocio: `priceUsd` > 0, `offerPriceUsd` opcional < `priceUsd`,
  `phoneNumber` E.164 obligatorio para publicar.
- Vista previa del precio en Bs al editar (usando tasa cacheada).

**Definición de hecho:** un vendedor registra su cuenta con teléfono + OTP, crea un negocio
(opcional) y publica productos; el proceso completo queda cubierto por pruebas E2E.

---

## E2 — Pulido de vitrina y SEO

**Objetivo:** hacer la vitrina rápida, visible y atractiva.

- SEO: `generateMetadata`/`generateStaticParams`, sitemap, Open Graph, JSON-LD de producto
  (con precio USD y Bs), `robots.txt`.
- Rendimiento: `next/image` con `remotePatterns` (S3), `loading.tsx`, ISR/`unstable_cache`
  para home y catálogos.
- Filtros y búsqueda por texto + categoría (SQL `LIKE`/`tsvector` según tamaño).
- Ordenamiento: destacados manuales (`featuredOrder`), recientes, precio (asc/desc).
- Preferencias del usuario: moneda de visualización (USD/Bs) si aplica.

**Definición de hecho:** Lighthouse ≥ 90 en móvil (home y producto); búsqueda y filtros operativos.

---

## E3 — Imágenes y operación del vendedor

**Objetivo:** gestión real de imágenes y herramientas de operación.

- Integración real del proveedor de imágenes (S3 o Cloudinary, decisión con `devops-engineer`)
  bajo el contrato `ImageStorage` de E0.
- Upload multi-imagen en el formulario de publicación (directo o vía API, según decisión),
  reordenar y eliminar imágenes, `alt` accesible.
- `LocalImageStorage` solo para dev; en prod, proveedor de nube con `IMAGE_PROVIDER`.
- Dashboard del vendedor: conteos (activas/pausadas), copiar link de WhatsApp, republicar.
- Métricas mínimas (opcional): clics al botón WhatsApp (evento server-side).

**Definición de hecho:** un vendedor publica un producto con fotos reales en prod y las
actualiza sin intervención del admin.

---

## E4 — Admin y moderación

**Objetivo:** gobierno del marketplace.

- Panel `/admin`: usuarios, negocios y productos (bloquear, destacar/desdestacar con
  `featuredOrder`, pausar contenido inapropiado).
- Flujo de reporte de un producto por parte del comprador (motivo + mensaje, revisión admin).
- Auditoría básica (log de acciones del admin sobre productos).
- Categorías gestionables (renombrar, ocultar) manteniendo el seed base.

**Definición de hecho:** el admin puede destacar y moderar contenido desde una UI con
seguimiento de cambios.

---

## E5 — Pagos y monetización (a definir)

**Objetivo:** (a validar con PM) modelo de monetización del marketplace.

- Candidato: Stripe (vinculado a AGENTS.md). Evaluar modelos: comisión por destacado,
  suscripción de vendedor, tarifas por publicación destacada.
- Nota: la vitrina NO tiene compra directa (el pago se realiza fuera de la plataforma vía
  WhatsApp); cualquier cobro de la plataforma debe ser explícito y revisado por
  `security-reviewer`.
- Webhooks, manejo de reembolsos y facturación si aplica.

**Definición de hecho:** flujo de pago/monetización operativo y auditado (a definir con PM).

---

## Criterios transversales

- Toda épica termina con `npm run lint`, `npm run build`, `npm run test` y `npm run test:e2e`
  en verde sobre `develop` (mock) antes de merge a `main`.
- Cambios de esquema → migración de Prisma versionada (`prisma migrate dev` / `migrate deploy`).
- Auth, pagos y datos personales → aprobación previa de `security-reviewer`.
- Decisiones técnicas nuevas → registro en `docs/`.
