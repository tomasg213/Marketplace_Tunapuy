# Arquitectura técnica — Marketplace_Tunapuy (E0/E2)

> Documento de arquitectura para las épicas E0 (scaffold y vitrina local) y E2
> (auth OTP funcional + sesión, `User.slug` y CRUD del vendedor).
> Autor: `tech-architect`. Estado: **v3 — actualizado tras la implementación de
> E2** (auth OTP por teléfono funcional, sesión JWT con jose, `User.slug` único,
> CRUD del vendedor, imágenes local con magic bytes, business).
> Convención: documentación en español; código, variables y nombres en inglés.

---

## 0. Resumen ejecutivo

Marketplace **local de vitrina** (sin compra directa). Cada producto y cada negocio muestra un
botón "Escríbenos por WhatsApp" que abre `https://wa.me/<teléfono>` del vendedor.

- Stack: Next.js (App Router) + TypeScript, API routes propias, Prisma, Tailwind + shadcn/ui.
- Base de datos: **PostgreSQL en TODOS los entornos (dev y prod)** — decisión E0 confirmada
  (ver §2.5). En dev se levanta con Docker Compose (`docker-compose.yml`, postgres:16).
- Auth: **login por teléfono + código OTP** (cambio confirmado vs. v1). `User.phoneNumber` es el
  identificador único de login; `email` queda opcional; se eliminó `passwordHash`. Los códigos
  OTP se guardan hasheados (`OtpCode.codeHash`), nunca en texto plano.
- Sesión (E2): cookie `tunapuy_session` **httpOnly** con token JWT HS256 firmado con jose
  (`AUTH_SECRET`), TTL 30 días, `secure` en producción y `sameSite=lax`. Guard edge en
  `src/middleware.ts` para `/vender`, `/mis-publicaciones` y `/cuenta` → `/login?next=…`;
  server actions/route handlers re-validan con `requireAuth()` (defensa en profundidad).
- Identidad de vendedor (E2): `User.slug` **único y NOT NULL** (migración en 2 pasos + backfill).
  Las URLs públicas del perfil (`/vendedores/<slug>`) y las tarjetas usan `User.slug`, no
  `slugifyName(name)`.
- Prisma **ORM 7**: cliente generado con el nuevo provider `prisma-client` (TypeScript, sin motor
  Rust) y conexión vía driver adapter (`@prisma/adapter-pg`). Configuración en `prisma.config.ts`.
- Precios: `priceUsd` (obligatorio), `offerPriceUsd` (opcional) y precio en Bs. **calculado en
  render** con la tasa BCV cacheada (nunca almacenado).
- Tasa BCV: fuente `https://ve.dolarapi.com/v1/dolares/oficial` (verificada el 2026-08-02,
  devuelve `promedio` y `fechaActualizacion`), con caché híbrida (tabla `RateCache` + memoria
  con TTL) y fallback ante error.
- Mock vs real: **cero divergencia de código**. `develop` corre con `DATA_MODE=mock` (seed de
  datos ficticios); `main` corre con `DATA_MODE=real` (seed solo de catálogo base). El mismo
  binario se despliega en ambos ambientes.

---

## 1. Estructura del proyecto (App Router)

### 1.1 Árbol de carpetas propuesto

```
Marketplace_Tunapuy/
├── docker-compose.yml            # PostgreSQL 16 para dev local (puerto 5432, DB tunapuy)
├── prisma.config.ts              # config de Prisma 7 (schema, migraciones, seed, DATABASE_URL)
├── prisma/
│   ├── schema.prisma             # esquema canónico (PostgreSQL)
│   ├── seed.ts                   # seed controlado por DATA_MODE
│   └── migrations/
├── generated/prisma/             # cliente Prisma generado (gitignored; `prisma generate`)
├── src/
│   ├── app/
│   │   ├── layout.tsx            # root layout (Header, Footer, Nav)
│   │   ├── page.tsx              # /        — home: destacados + recientes + categorías
│   │   ├── loading.tsx
│   │   ├── not-found.tsx
│   │   ├── error.tsx
│   │   ├── categorias/
│   │   │   └── [slug]/page.tsx   # /categorias/comida  — listado filtrado
│   │   ├── productos/
│   │   │   └── [slug]/page.tsx   # /productos/<slug>   — detalle + botón WhatsApp
│   │   ├── negocios/
│   │   │   └── [slug]/page.tsx   # /negocios/<slug>    — perfil de negocio
│   │   ├── vendedores/
│   │   │   └── [slug]/page.tsx   # /vendedores/<slug>  — perfil de vendedor persona
│   │   ├── vender/
│   │   │   └── page.tsx          # /vender             — landing "vende aquí"
│   │   ├── mis-publicaciones/
│   │   │   ├── page.tsx          # /mis-publicaciones  — dashboard del vendedor
│   │   │   └── productos/
│   │   │       ├── nuevo/page.tsx          # crear publicación
│   │   │       └── [id]/editar/page.tsx    # editar publicación
│   │   ├── auth/
│   │   │   ├── iniciar-sesion/page.tsx
│   │   │   └── registrarse/page.tsx
│   │   └── api/
│   │       ├── rate/route.ts    # GET tasa BCV (uso interno/público puntual)
│   │       ├── products/route.ts            # CRUD de publicaciones (solo dueño)
│   │       ├── uploads/route.ts             # contrato de imágenes (E3)
│   │       └── auth/route.ts                # login/registro/sesión OTP
│   ├── components/
│   │   ├── ui/                  # shadcn/ui (button, card, badge, input, ...)
│   │   ├── layout/              # Header, Footer, CategoryNav
│   │   ├── home/                # FeaturedProducts, RecentProducts, CategoryGrid
│   │   └── product/             # ProductCard, PriceDisplay, WhatsAppButton
│   ├── lib/
│   │   ├── constants.ts         # CATEGORIES (6 fijas), PRODUCT_STATUS, RATE_SOURCE, TTLs
│   │   ├── format.ts            # formatPrice / formatUsd / formatBs ($25.00 / Bs. 18.665,74)
│   │   └── utils.ts             # cn() (shadcn)
│   └── server/                  # SOLO importable desde Server Components / Route Handlers
│       ├── db.ts                # PrismaClient singleton (Prisma 7 + adapter @prisma/adapter-pg)
│       ├── env.ts               # validación de env vars al arrancar (zod)
│       ├── auth/
│       │   ├── otp-provider.ts       # interfaz OtpProvider + factory getOtpProvider()
│       │   ├── otp-dev-provider.ts   # OTP_PROVIDER=dev: imprime el código en consola
│       │   ├── otp-whatsapp-provider.ts  # OTP_PROVIDER=whatsapp: Meta Cloud API (STUB E1)
│       │   └── otp-utils.ts          # generar/hashear/verificar código, expiración, intentos
│       ├── rate/
│       │   ├── rate.service.ts  # getBcvRate() con caché híbrida + fallback
│       │   └── convert.ts       # usdToBs() (Prisma.Decimal, round 2 HALF_UP)
│       ├── products/
│       │   ├── queries.ts       # listFeatured, listRecent, listByCategory, getBySlug
│       │   └── validators.ts    # zod schemas para crear/editar producto
│       ├── images/
│       │   └── image-storage.ts # interfaz ImageStorage (S3/Cloudinary/local)
│       └── auth/
│           └── session.ts       # crear/verificar sesión (jose + cookie httpOnly) — E1
├── tests/
│   ├── unit/                    # Vitest (convert, format, otp-utils)
│   └── e2e/                     # Playwright (smoke home)
├── docs/
│   ├── architecture.md          # este documento
│   └── roadmap.md               # épicas E0–E5
├── .env.example
├── vitest.config.ts
├── playwright.config.ts
├── package.json
└── tsconfig.json
```

### 1.2 Mapa de rutas de páginas

| Ruta | Página | Notas |
|---|---|---|
| `/` | Home | Destacados + Recientes + 6 categorías (server component) |
| `/categorias/[slug]` | Catálogo por categoría | slug ∈ {comida, ropa, zapatos, perfume, automotriz, licor} |
| `/productos/[slug]` | Detalle de producto | Fotos, precio USD, Bs calculado, oferta, botón WhatsApp |
| `/negocios/[slug]` | Perfil de negocio | Logo, descripción, productos, botón WhatsApp |
| `/vendedores/[slug]` | Perfil de vendedor persona | Sus productos publicados |
| `/vender` | Landing de vendedores | Cómo funciona, CTA a registro |
| `/mis-publicaciones` | Dashboard del vendedor | CRUD de sus productos (autenticado) |
| `/auth/iniciar-sesion` y `/auth/registrarse` | Login / registro | **Teléfono + código OTP** (sin contraseña) |

Reglas de rutas:

- **kebab-case** en URLs; `[slug]` human-readable y único (slug se genera del título + sufijo corto).
- Todas las páginas de catálogo son **Server Components** con `generateMetadata` (SEO) y
  `generateStaticParams` opcional para categorías (6, estáticas).
- `/mis-publicaciones/**` y `/api/products/**` exigen sesión activa (middleware o guard en el handler).

---

## 2. Modelo de datos (borrador de `schema.prisma`)

### 2.1 Decisiones de modelado

- **IDs**: `cuid()` (legible, sin dependencia de secuencias, seguro en seeds entre ambientes).
- **Dinero**: `Decimal(10,2)` para `priceUsd` y `offerPriceUsd`; `Decimal(14,4)` para la tasa.
  Prisma lo mapea a `DECIMAL` (precisión exacta en Postgres) y se trabaja con `Prisma.Decimal`
  (decimal.js). **No** usar `Float` (pérdida de precisión) ni centavos `Int`.
- **Enums**: se evitan en el esquema. El estado de producto y roles son `String` + uniones de
  constantes en TS (`lib/constants.ts`) validadas con zod.
- **Categorías**: modelo `Category` sembrado con las 6 fijas (upsert idempotente). Preferir tabla
  a enum de Prisma: permite icono, descripción, orden y traducciones futuras sin migraciones.
- **Auth OTP (decisión E0)**: `User.phoneNumber` es **UNIQUE** y es el identificador de login;
  `User.email` es **opcional (nullable)** y `User.passwordHash` fue **eliminado**. El código OTP
  se envía por proveedor (`getOtpProvider()` según `OTP_PROVIDER=dev|whatsapp`) y se persiste en
  `OtpCode` **solo como `codeHash`** (sha256 + salt por código), nunca en texto plano.
- **Producto ↔ vendedor**: polimorfismo relacional no existe; se resuelve con **dos claves**:
  `sellerId` (FK `User`, siempre presente, dueño de la cuenta) y `businessId` (FK `Business`
  nullable, si se publica bajo un negocio). El teléfono de WhatsApp del anuncio se define en
  `Product.phoneNumber` (copiado del vendedor o negocio al publicar, pero editable por anuncio).
- **Teléfonos**: siempre en **E.164** (`+584121234567`). Se normaliza al guardar y se convierte a
  formato `wa.me` sin `+` al renderizar (`https://wa.me/584121234567`). En datos mock se usan
  prefijos `+58 000...` (obviamente ficticios, sin contacto real).
- **"Destacado"**: `isFeatured Boolean` + `featuredOrder Int` (orden manual del admin). Índice
  `(isFeatured, featuredOrder)`.
- **"Recientes"**: `publishedAt DateTime?` (null en borrador) + índice `(status, publishedAt desc)`.
- **Imágenes**: tabla `ProductImage` (url, key único, alt, position) en lugar de `String[]`.
- **Borrado**: `onDelete: Cascade` en imágenes, `Restrict` en categoría y vendedor, `SetNull` en
  business.

### 2.2 Borrador completo de `prisma/schema.prisma`

```prisma
// prisma/schema.prisma
// Esquema canónico. Proveedor: PostgreSQL en TODOS los entornos.
// Prisma 7: cliente generado con provider "prisma-client" (output obligatorio)
// y conexión vía driver adapter (@prisma/adapter-pg). La URL vive en prisma.config.ts.

generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}

datasource db {
  provider = "postgresql"
}

// ---------------------------------------------------------------------------
// Tasa BCV (caché persistente)
// ---------------------------------------------------------------------------

model RateCache {
  id        String   @id @default(cuid())
  source    String   @unique // "dolarapi-oficial"
  usdToBs   Decimal  @db.Decimal(14, 4) // tasa promedio BCV (p.ej. 746.6297)
  fetchedAt DateTime // momento real del fetch (fechaActualizacion de la API)
  expiresAt DateTime // fetchedAt + TTL (renovación)
  updatedAt DateTime @updatedAt

  @@index([expiresAt])
}

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

model Category {
  id          String    @id @default(cuid())
  slug        String    @unique // comida | ropa | zapatos | perfume | automotriz | licor
  name        String // "Comida", "Ropa", ...
  description String?
  icon        String? // nombre del ícono (lucide-react)
  position    Int       @default(0) // orden de aparición en la home
  createdAt   DateTime  @default(now())
  products    Product[]

  @@index([position])
}

// ---------------------------------------------------------------------------
// Usuarios y vendedores
// ---------------------------------------------------------------------------

model User {
  id          String     @id @default(cuid())
  email       String?    @unique // OPCIONAL (cambio OTP)
  phoneNumber String     @unique // E.164, IDENTIFICADOR DE LOGIN (cambio OTP)
  name        String
  slug        String     @unique // slug público de vendedor (E2: NOT NULL, backfill)
  avatarUrl   String?
  role        String     @default("BUYER") // BUYER | SELLER | ADMIN (constantes TS)
  business    Business?
  products    Product[]  @relation("SellerProducts")
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  @@index([role])
}

model Business {
  id          String    @id @default(cuid())
  slug        String    @unique
  name        String
  description String?
  logoUrl     String?
  phoneNumber String? // E.164, contacto WhatsApp del negocio
  ownerId     String    @unique
  owner       User      @relation(fields: [ownerId], references: [id], onDelete: Restrict)
  products    Product[]
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([ownerId])
}

// ---------------------------------------------------------------------------
// Auth OTP por teléfono (cambio E0 confirmado)
// ---------------------------------------------------------------------------
// El código en texto plano NUNCA se persiste: solo `codeHash` (sha256 + salt por
// código, ver src/server/auth/otp-utils.ts). `attempts` cuenta verificaciones
// fallidas (se invalida al alcanzar OTP_MAX_ATTEMPTS). `consumedAt` marca el uso.

model OtpCode {
  id          String    @id @default(cuid())
  phoneNumber String // E.164 del teléfono que solicita el código
  codeHash    String // sha256(salt + codigo), con salt por código
  type        String // LOGIN | REGISTER (constantes TS)
  expiresAt   DateTime // createdAt + OTP_TTL_MINUTES
  attempts    Int       @default(0) // intentos de verificación fallidos
  consumedAt  DateTime? // momento de uso; null mientras esté pendiente
  createdAt   DateTime  @default(now())

  // búsqueda del último código pendiente por teléfono + tipo
  @@index([phoneNumber, type, createdAt(sort: Desc)])
  // limpieza periódica de códigos vencidos
  @@index([expiresAt])
}

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------

model Product {
  id            String         @id @default(cuid())
  slug          String         @unique
  title         String
  description   String?
  priceUsd      Decimal        @db.Decimal(10, 2) // precio principal (divisas), requerido
  offerPriceUsd Decimal?       @db.Decimal(10, 2) // precio de oferta en divisas (opcional)
  phoneNumber   String // E.164 del anuncio; botón WhatsApp wa.me/<número sin '+'>
  status        String         @default("ACTIVE") // DRAFT | ACTIVE | PAUSED | ARCHIVED
  isFeatured    Boolean        @default(false) // destacado en la home
  featuredOrder Int            @default(0) // 0 = primera posición
  publishedAt   DateTime? // fecha de publicación; null mientras sea borrador ("recientes")
  categoryId    String
  category      Category       @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  sellerId      String // dueño de la cuenta (siempre presente)
  seller        User           @relation("SellerProducts", fields: [sellerId], references: [id], onDelete: Cascade)
  businessId    String? // si se publica bajo un negocio
  business      Business?      @relation(fields: [businessId], references: [id], onDelete: SetNull)
  images        ProductImage[]
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt

  // "recientes"
  @@index([status, publishedAt(sort: Desc)])
  // "destacados"
  @@index([isFeatured, featuredOrder])
  // navegación por categoría y por vendedor
  @@index([categoryId, status])
  @@index([sellerId])
  @@index([businessId])
}

model ProductImage {
  id        String   @id @default(cuid())
  url       String
  key       String   @unique // object key (S3) / public_id (Cloudinary) para delete()
  alt       String?
  position  Int      @default(0)
  productId String
  product   Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  @@index([productId, position])
}
```

### 2.3 Flujo de auth OTP por teléfono (decisión E0)

```
[Registrarse]                         [Iniciar sesión]
 POST /api/auth/otp/request           POST /api/auth/otp/request
 body: { phoneNumber, type: "REGISTER" } | { phoneNumber, type: "LOGIN" }
   │                                    │
   ├─ 1. Validar phoneNumber (zod, normalizar a E.164, prefijo VE)
   ├─ 2. REGISTER: no debe existir User.phoneNumber → 409
   │      LOGIN: debe existir User.phoneNumber → 404 (sin revelar existencia)
   ├─ 3. Generar código (6 dígitos, OTP_CODE_LENGTH) y OTP_MAX_ATTEMPTS = 5
   ├─ 4. OtpCode { phoneNumber, codeHash: sha256(salt+codigo), type, expiresAt: now+TTL }
   │      (borrar códigos previos pendientes del mismo teléfono+type)
   └─ 5. getOtpProvider().send(phone, code, ttl)
            ├─ dev:      console.log (registro en desarrollo)
            └─ whatsapp: Meta Cloud API — STUB fail-closed en E0 (E1)

[Verificar]
 POST /api/auth/otp/verify
 body: { phoneNumber, code, type }
   ├─ 1. Buscar último OtpCode pendiente (no consumido) de phoneNumber+type
   ├─ 2. attempts >= OTP_MAX_ATTEMPTS o expiresAt < now → invalidar y rechazar (429/410)
   ├─ 3. verifyOtpCode(): hash(salt+code) === codeHash (timing-safe)
   │       └─ falla → attempts++ y rechazar (401)
   ├─ 4. éxito → consumedAt = now
   ├─ 5. login: firmar sesión httpOnly (jose) — implementación completa en E1
   └─ 6. REGISTER: crear User con role BUYER (y si aplica, Business) en la misma transacción
```

Reglas:

- El código en texto plano **nunca** se persiste ni se devuelve por API (en `dev` solo a consola).
- Un mismo código es de un solo uso (`consumedAt`); los intentos fallidos se acumulan en
  `attempts` y agotan la serie (re-solicitar genera un código nuevo).
- `expiresAt = createdAt + OTP_TTL_MINUTES` (5 min por defecto).
- La limpieza de códigos vencidos corre por job/trigger programado (E1) o en el propio request
  (se descartan por `expiresAt`, índice `@@index([expiresAt])`).

### 2.4 ¿Por qué `publishedAt` y no `createdAt` para "recientes"? — e índices

El borrador (DRAFT) no debe aparecer; "recientes" refleja cuándo el producto salió en vivo.
Además permite "republicar" (actualizar `publishedAt`) para reflotar un anuncio sin cambiar la
fecha de creación.

Los índices compuestos cubren los accesos de la home (`status + publishedAt desc`),
destacados (`isFeatured + featuredOrder`) y catálogo por categoría (`categoryId + status`).
Con datos reales (~cientos de miles de filas) todos los índices caben en memoria. `Product.phoneNumber`
**no** lleva índice: no es clave de búsqueda (el marketplace es de vitrina, no de directorio por
teléfono). En cambio `User.phoneNumber` sí es `@unique`: es el identificador de login OTP.

### 2.5 PostgreSQL en dev y prod — decisión confirmada (E0)

Se adopta **PostgreSQL también en desarrollo** (decisión D12 confirmada por el PM). En dev local se
levanta con `docker-compose.yml` (`postgres:16-alpine`, puerto 5432, DB `tunapuy`, user/pass
`postgres`) o con cualquier PostgreSQL local equivalente. Un solo esquema, `Decimal`/índices
consistentes, sin drift entre ambientes. Queda descartada la variante SQLite (y con ella el
`schema.sqlite.prisma` paralelo).

---

## 3. Servicio de tasa BCV

### 3.1 Fuente

- `GET https://ve.dolarapi.com/v1/dolares/oficial`
- Respuesta (verificada 2026-08-02):
  `{"moneda":"USD","fuente":"oficial","promedio":746.6297,"fechaActualizacion":"2026-07-31T00:00:00-04:00"}`
- El campo que usamos es `promedio`. El BCV publica la tasa 1 vez por día hábil, por eso la
  caché puede ser diaria (ver TTL).

### 3.2 Estrategia de caché — recomendación: **híbrida (tabla `RateCache` + memoria con TTL)**

```
getBcvRate()
 ├─ 1. ¿Memoria en proceso fresca (TTL, p.ej. 5–10 min)? → devolver (sin DB, sin red)
 ├─ 2. ¿RateCache en DB no expirado (TTL 6h)? → usar y poblar memoria → devolver
 ├─ 3. No: fetch a dolarapi (timeout 5s vía AbortController)
 │     ├─ éxito → upsert RateCache(source="dolarapi-oficial", usdToBs=promedio,
 │     │          fetchedAt, expiresAt = now + TTL) + poblar memoria → devolver
 │     └─ error → ¿hay fila en DB aunque sea vieja (stale)? → devolverla con warning
 │               └─ no → ¿BCV_RATE_FALLBACK configurado? → devolverlo marcado como fallback
 │                     └─ no → lanzar RateUnavailableError (la UI oculta el precio en Bs)
```

Justificación:

- **Memoria sola** no sirve: en Serverless/CI cada instancia es efímera y habría un fetch por
  cold start (efecto thundering herd).
- **DB sola** tampoco: cada render de la home haría una consulta a la base solo para la tasa.
- **Híbrida**: la DB es la fuente de verdad compartida entre instancias; la memoria es un
  cache de bolsillo por proceso (TTL corto, 5–10 min) que elimina lecturas de DB en el render.
- **TTL 6 h** (configurable con `BCV_RATE_TTL_HOURS`): la tasa oficial cambia 1×/día hábil;
  6 h de frescura garantizan que la Bs mostrada nunca tenga más de medio día de desfase y
  amortiza los fallos de red del provider. No se usa `stale-while-revalidate` agresivo para no
  mostrar tasas viejas; el `fallback` explícito cubre el caso degradado.
- El módulo vive en **`src/server/rate/`** (server-only), así un componente de servidor puede
  llamar a `getBcvRate()` sin filtrar nada al cliente.

### 3.3 Conversión USD → Bs (server-side)

- `usdToBs(usd, rate)` en `src/server/rate/convert.ts` (usa `decimal.js`, el mismo motor de
  `Prisma.Decimal`) → multiplicación exacta y `toDecimalPlaces(2, ROUND_HALF_UP)`.
- Formateo en `src/lib/format.ts` (módulo puro, importable también desde el cliente):
  - `formatUsd(25)` → `$25.00` (decimal con punto, miles con coma — `en-US`).
  - `formatBs(18665.7425)` → `Bs. 18.665,74` (miles con punto, decimal con coma — `es-VE`).
  - `formatPrice(value, "USD"|"VES")` elige según la moneda.
- La conversión **solo ocurre en el Server Component** de la página: el cliente recibe una
  cadena ya formateada (o el número + tasa si se decide por accesibilidad a11y, nunca el
  cómputo en el cliente).
- `PriceDisplay` (componente, lo implementa `designer`) recibe `{ priceUsd, offerPriceUsd?, priceBs }`
  ya calculados.
- Precio de oferta: si `offerPriceUsd` existe y `offerPriceUsd < priceUsd`, se muestra como
  precio vigente tachando el original (la lógica de "vigente" la decide el server con el
  mismo criterio en todos los renders).

---

## 4. Estrategia mock vs real (cero divergencia de código)

### 4.1 Principio

El código es **idéntico** en `develop` y `main`. La diferencia de datos la define el entorno:
la variable `DATA_MODE` (`mock` | `real`) controla qué siembra el seed y qué datos encuentra la
app. La app **no** ramifica su lógica por `DATA_MODE` (solo el seed y, opcionalmente, un banner
de "entorno de demostración" guiado por `NEXT_PUBLIC_SHOW_MOCK_BANNER`).

### 4.2 Flujo del seed (`prisma/seed.ts`)

```
prisma db seed   (config: prisma.config.ts → migrations.seed = "tsx prisma/seed.ts")
 ├─ Siempre: upsert de las 6 Category (idempotente, slug como clave natural)
 ├─ DATA_MODE === "mock" (develop):
 │    ├─ 6 vendedores ficticios (phoneNumber +58 000 000 00xx — OBVIAMENTE ficticios,
 │    │  emails @tunapuy.local; sin WhatsApp real) — upsert por phoneNumber
 │    ├─ 6 negocios ficticios (upsert por slug), 1 por categoría
 │    ├─ 13 productos de ejemplo (2 por categoría, 1 borrador DRAFT) con priceUsd/
 │    │  offerPriceUsd variados y fechas escalonadas (publishedAt = now - N horas)
 │    ├─ 3 productos destacados (isFeatured=true, featuredOrder 0-2)
 │    └─ 1 imagen placeholder local por producto (public/placeholder.svg)
 └─ DATA_MODE === "real" (main):
      └─ solo categorías (idempotente; sin productos ficticios)
```

- Idempotencia: `upsert` por slugs/phoneNumbers; se puede ejecutar N veces.
- Guard: el seed **nunca** borra datos existentes en `real` (no `deleteMany` de productos).
- Los teléfonos mock usan el prefijo `+58 000...`, inválido en Venezuela, para que nadie los
  confunda con un contacto real; quedan marcados como "datos de demostración".

### 4.3 Mapeo rama → entorno

| Rama | Entorno | `DATA_MODE` | DB | Despliegue |
|---|---|---|---|---|
| `develop` | dev / preview | `mock` | PostgreSQL local (Docker Compose, postgres:16) | Preview deploy |
| `main` | producción | `real` | PostgreSQL gestionado (RDS/Supabase/Neon) | Deploy prod |

CI (GitHub Actions):

- Workflow único por evento, con el valor de `DATA_MODE` inyectado según rama:
  - `develop` → `DATA_MODE=mock`, `DATABASE_URL` de dev/preview, `npm run lint && build && test`.
  - `main` → `DATA_MODE=real`, `DATABASE_URL` de prod, `npm run lint && build && test && test:e2e:prod`.
- `prisma migrate deploy` en ambos (migraciones versionadas); `prisma db seed` **solo** en
  ambientes mock y en el primer arranque de prod (o a mano, nunca automático en prod sin
  supervisión).
- `.env.example` documenta ambas combinaciones; los valores reales viven en el secret store del
  host de despliegue, nunca en el repo.

### 4.4 Garantías

- El diff `develop ↔ main` solo contiene cambios de datos (env), no de código.
- El smoke E2E corre siempre contra `mock` y valida exactamente lo que verá el usuario real
  (la UI es la misma).
- Prueba de la premisa: si el código ramifica por `DATA_MODE`, es un **anti-patrón** que el QA
  debe detectar (revisión de PR + lint).

---

## 5. Variables de entorno (`.env.example`)

```bash
# ------------------------------------------------------------------
# Aplicación
# ------------------------------------------------------------------
NODE_ENV=development            # development | test | production
APP_URL=http://localhost:3000   # URL pública (canonical, meta, redirects)
DATA_MODE=mock                  # mock (develop) | real (main) — controla el seed
NEXT_PUBLIC_APP_NAME=Tunapuy
NEXT_PUBLIC_SHOW_MOCK_BANNER=false  # banner "entorno de demostración" (mock only)

# ------------------------------------------------------------------
# Base de datos (PostgreSQL en TODOS los entornos)
# ------------------------------------------------------------------
# Dev local: `docker compose up -d` (postgres:16, puerto 5432, DB tunapuy)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/tunapuy"
# Prod: PostgreSQL gestionado (RDS / Supabase / Neon)
# DATABASE_URL="postgresql://user:pass@host:5432/tunapuy"

# ------------------------------------------------------------------
# Tasa BCV (dolarapi)
# ------------------------------------------------------------------
BCV_RATE_API_URL=https://ve.dolarapi.com/v1/dolares/oficial
BCV_RATE_TTL_HOURS=6            # frescura de la tasa en horas (tabla RateCache)
BCV_RATE_TTL_MEMORY_MINUTES=10  # caché de bolsillo por proceso (min)
BCV_RATE_TIMEOUT_MS=5000        # timeout del fetch
# Tasa estática de respaldo si la API y la caché fallan (opcional; puede quedar vacío).
# En dev conviene fijarla (p.ej. 746.6297) para que el Bs sea determinista en pruebas.
BCV_RATE_FALLBACK=746.6297

# ------------------------------------------------------------------
# Auth — OTP por teléfono (decisión E0)
# ------------------------------------------------------------------
# Proveedor de envío: dev (consola) | whatsapp (Meta Cloud API — STUB en E0)
OTP_PROVIDER=dev
OTP_TTL_MINUTES=5               # validez de cada código
OTP_MAX_ATTEMPTS=5              # intentos máximos antes de invalidar
# Rate limit de solicitudes: constantes en src/server/auth/rate-limit.ts
# (OTP_REQUEST_MAX=5, OTP_REQUEST_WINDOW_MS=15 min; se harán env en E3).
# Meta Cloud API (solo si OTP_PROVIDER=whatsapp)
META_WHATSAPP_TOKEN=
META_WHATSAPP_PHONE_NUMBER_ID=
META_WHATSAPP_BUSINESS_ACCOUNT_ID=
META_WHATSAPP_OTP_TEMPLATE=otp_verification

# ------------------------------------------------------------------
# Sesión (E2) — token JWT HS256 con jose (cookie httpOnly)
# ------------------------------------------------------------------
# Mínimo 16 caracteres. Nunca commitear el valor real (usar .env.example).
AUTH_SECRET=dev-secret-tunapuy-0123456789abcdef
# TTL de la sesión: constante SESSION_TTL_SECONDS=30 días en
# src/server/auth/session-token.ts (se hará env si se requiere en E3).

# ------------------------------------------------------------------
# Imágenes (contrato definido; integración real en E3)
# ------------------------------------------------------------------
IMAGE_PROVIDER=local            # local (dev) | s3 | cloudinary
# S3 (o compatible: R2, Backblaze)
S3_BUCKET=
S3_REGION=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_PUBLIC_BASE_URL=             # dominio público/DDN si se usa
# Cloudinary (alternativa)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# ------------------------------------------------------------------
# Pagos (E3+ — contrato futuro, no usado en E0)
# ------------------------------------------------------------------
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# ------------------------------------------------------------------
# Testing
# ------------------------------------------------------------------
PLAYWRIGHT_BASE_URL=http://localhost:3000
```

Reglas:

- Sin secretos reales en el repo; `.env.example` solo con placeholders.
- Variables `NEXT_PUBLIC_*` son las únicas visibles en el cliente: mantenerlas al mínimo.
- `src/server/env.ts` valida el entorno con zod al arrancar (fail-fast si falta
  `DATABASE_URL`).

---

## 6. Stack de testing para E0

### 6.1 Vitest (unitario)

- Config: `vitest.config.ts` (entorno `node`; alias `@/` → `src/`).
- Script: `npm run test` → `vitest run` (incluye `tests/unit/**/*.test.ts`).
- Casos E0 implementados (el QA ampliará el set):
  - `convert`: `usdToBs("25.00", "746.6297")` → `18665.74`; redondeo HALF_UP; exactitud decimal;
    rechazo de montos negativos y tasas ≤ 0.
  - `format`: `formatUsd(25)` → `$25.00`; `formatBs(18665.7425)` → `Bs. 18.665,74`; `formatPrice`.
  - `otp-utils`: generación (6 dígitos), formato, hash + verificación (nunca texto plano,
    timing-safe), expiración, `expiresAt = now + TTL`, límite de intentos.
- La suite unitaria es pura (sin BD): `rate.service` (con DB/memoria/red) se cubrirá en QA con
  mocks.

### 6.2 Playwright (E2E)

- Config: `playwright.config.ts` con `webServer` = `npm run build && npm run start` (mock),
  baseURL de `.env` (`PLAYWRIGHT_BASE_URL`).
- Script: `npm run test:e2e`.
- Casos E0 (smoke, implementados):
  - Home carga y muestra las **6 categorías** (links Comida/Ropa/Zapatos/Perfume/Automotriz/Licor).
  - Home muestra tarjetas de producto con precio USD (`$xx.xx`) y Bs (`Bs. 18.665,74`).
- QA ampliará: navegación a categorías, detalle de producto, botón WhatsApp (`wa.me` sin `+`),
  a11y. CI: `npx playwright install --with-deps chromium` en el runner.

---

## 7. Contrato de imágenes (S3 vs Cloudinary)

### 7.1 Recomendación: **S3 (o S3-compatible)** como proveedor primario

| Criterio | S3 (AWS) | Cloudinary |
|---|---|---|
| Costo inicial | Bajo (pagos por uso; egress facturado) | Free tier 25 GB almacenamiento / 25 GB banda ancha |
| Optimización/resize | La hace `next/image` (self-hosted, `remotePatterns`) | Servicio incluido (transformaciones en CDN) |
| Dependencia de infra | Cuenta AWS + credenciales | Menos infra, más "magia" SaaS |
| Complejidad del código | SDK AWS (upload/delete) + presigned URLs | SDK + upload widget |
| Madurez/ecosistema | Muy alta | Alta |
| Egress | Facturado (0.09 USD/GB aprox.) | Dentro del free tier hasta límite |

Justificación: el marketplace es local y de bajo volumen inicial; `next/image` ya resuelve el
resize/WebP en nuestro propio servidor, así que el valor de Cloudinary (transformaciones) no se
aprovecha. S3 da control de costos y un contrato simple. Cloudinary queda como **alternativa
documentada** si el devops quiere cero infra (decisión final en E3 con `devops-engineer`).
Para desarrollo, `IMAGE_PROVIDER=local` guarda en `public/uploads` con el **mismo contrato**.

### 7.2 Contrato de la capa (interfaz en `src/server/images/image-storage.ts`)

```ts
interface ImageStorage {
  // Sube un archivo y devuelve URL pública + key interna (para delete).
  upload(input: {
    file: Buffer | File;
    folder: string; // "products", "businesses", "users"
    allowedTypes?: string[]; // default: ["image/jpeg","image/png","image/webp"]
    maxBytes?: number; // default: 5 MB
  }): Promise<{ url: string; key: string }>;

  delete(key: string): Promise<void>;

  // Opcional E3: upload directo desde el navegador sin pasar por la API
  getUploadPolicy?(folder: string): Promise<{ url: string; fields: Record<string, string> }>;
}
```

- `ProductImage.key` = object key S3 / public_id Cloudinary → permite `delete()`.
- Validaciones en el server (`products/validators.ts`): tipo MIME, tamaño máx., solo HTTPS.
- Mock/local: `LocalImageStorage` persiste en `public/uploads/<folder>/<cuid>.<ext>` y registra
  la URL pública; la integración real (S3/Cloudinary) llega en E3 sin tocar el resto del código
  (inversión de dependencia vía factoría según `IMAGE_PROVIDER`).

---

## 8. Decisiones de arquitectura (resumen justificado)

| # | Decisión | Alternativa descartada | Justificación |
|---|---|---|---|
| D1 | `Decimal(10,2)` para precios | `Float` / `Int` centavos | Exactitud decimal nativa de Prisma; escala de vitrina, no contabilidad |
| D2 | Categorías como tabla con seed | Enum de Prisma | Flexibilidad (icono, descripción, orden, i18n futuro) sin migraciones; seed idempotente |
| D3 | `sellerId` + `businessId` nullable | Relación polimórfica | Las BD relacionales no soportan FK polimórficas limpias |
| D4 | `publishedAt` para "recientes" | `createdAt` | Respeta borradores y permite republicar sin tocar createdAt |
| D5 | Caché híbrida (RateCache + memoria TTL) | Solo memoria / solo DB | Consistencia multi-instancia + cero DB por render en caliente |
| D6 | Conversión Bs en Server Component | Cliente JS | SEO, consistencia, sin exponer lógica de tasas |
| D7 | `DATA_MODE` + seed condicional | Ramas con código distinto | Cero divergencia: mismo binario para develop/main |
| D8 | Teléfonos E.164 + wa.me normalizado | Free-form | Formato consistente para el botón WhatsApp |
| D9 | S3 como proveedor de imágenes | Cloudinary | `next/image` ya optimiza; control de costos (ver §7) |
| D10 | `cuid()` como ID | UUID v4 / autoincrement | Legible, ordenable, sin exposición de conteo |
| D11 | Estado y roles como `String` + uniones TS | Enums de Prisma | Compatibilidad y validación con zod en el borde |
| D12 | Postgres también en dev (docker-compose, postgres:16) | SQLite en dev | Un solo esquema, sin drift; **confirmada en E0** |
| D13 | Login por **teléfono + OTP** (sin contraseña) | Email + passwordHash | Decisión de producto del PM; `User.phoneNumber` UNIQUE es el login |
| D14 | OTP: `OtpCode.codeHash` + salt, nunca texto plano | Guardar código en claro | El hash se verifica timing-safe; robo de BD no expone códigos |
| D15 | Prisma 7 (provider `prisma-client`, driver adapter, `prisma.config.ts`) | Prisma v6/`prisma-client-js` | Versión vigente; cliente TS nativo sin binario Rust |
| D16 | Sesión en cookie JWT HS256 (jose) httpOnly + `AUTH_SECRET` ≥16 chars | Sessions en tabla / JWT en localStorage | Sin lectura de BD por request; XSS no accede a la cookie; stateless |
| D17 | `User.slug` único NOT NULL (migración 2 pasos + backfill idempotente) | Slug derivado en render (`slugifyName`) | URL estable sin acentos; dedupe determinista; sin depender del nombre |
| D18 | CRUD del vendedor: server actions + route handlers sobre un mismo servicio | Dos implementaciones paralelas | Una sola lógica de negocio; ownership y validación en el server |
| D19 | Imágenes: contrato `ImageStorage` + provider local (magic bytes, uuid) | Path del cliente / multer | Validación por contenido real (MIME no confiable); nombre uuid; S3/Cloudinary en E3 sin tocar el resto |
| D20 | Rate limit OTP en memoria (IP+teléfono, 5/15 min) | Solo por IP | El teléfono es la unidad real de abuso (IP compartida en NAT); en prod multi-instancia se sustituirá por Redis (E3) |
| D21 | Registro por OTP = find-or-create (sin paso "registrarse" separado) | Formulario de registro previo | El mismo flujo sirve login y registro; `name` provisional editable después |

---

## 9. Riesgos y decisiones que requieren validación

1. **Auth OTP (D13/D14)** — En E0 quedaron implementados el modelo (`OtpCode`, hash con salt) y la
   capa de proveedores (`otp-provider.ts` + factory, `dev` funcional y `whatsapp` **stub fail-closed**).
   El flujo funcional (rutas `/api/auth`, `iniciar-sesion`, `registrarse`) y el envío real por Meta
   Cloud API requieren **revisión del `security-reviewer`** antes de E1 (rate-limiting, reuso de
   códigos, protección de endpoints).
2. **Exposición de teléfonos (PII)** — El diseño de vitrina publica `phoneNumber` de
   productos/negocios a propósito (requisito de producto), pero es dato personal: requiere
   validación del `security-reviewer` (consentimiento al publicar, minimización de datos).
3. **TTL de la tasa** — 6 h (`BCV_RATE_TTL_HOURS`). Validar con PM si un desfase de hasta 6 h es
   aceptable para el consumidor; dolarapi actualiza 1×/día hábil.
4. **`BCV_RATE_FALLBACK` estático** — Guarda de emergencia; si se usa, debe mostrarse aviso de
   "tasa de referencia" para no engañar al comprador. Validar criterio de UI con design-advisor.
5. **`featuredOrder`** — El "destacado" requiere herramienta de admin (E1+). En E0 se siembra
   por seed; definir el rol ADMIN y su UI antes de datos reales.
6. **Proveedor de imágenes final (S3 vs Cloudinary)** — Contrato cerrado en E0 (interfaz
   `ImageStorage`); implementación y proveedor definitivo en E3 con `devops-engineer`.
7. **Slug único** — Generación automática (title + sufijo corto) puede chocar con títulos
   repetidos; en E0 se acepta retry de sufijo; validar colisiones en seed real.
8. **Prisma 7 en CI/despliegue** — El cliente se genera con `prisma generate` (`postinstall`);
   en prod se aplica `prisma migrate deploy`. El driver adapter (`@prisma/adapter-pg`) sustituye
   el motor Rust anterior: verificar los binarios en el runner de CI.
9. **Decimal y tasa con 4 decimales** — `usdToBs` redondea a 2 decimales para mostrar; validar
   con QA casos de redondeo (ej. 0.005).
10. **Docker en WSL** — En el entorno de desarrollo actual el daemon de Docker Desktop no responde;
    se validó E0 con un PostgreSQL 18 local instalado vía dnf (equivalente a postgres:16 del
    docker-compose). Para otros devs, `docker compose up -d` es la vía documentada.

---

## 10. Checklist del PM (scaffold E0 — estado al cierre)

- [x] Aprobado el cambio de auth a **teléfono + OTP** y **PostgreSQL también en dev** (v2 del documento).
- [x] Scaffold Next.js + TS + Tailwind v4 + shadcn/ui (radix, preset nova); estructura `src/`.
- [x] `prisma init` (Prisma 7, `prisma.config.ts`) + schema de §2.2 + migración `init` aplicada.
- [x] Seed de §4.2 (`DATA_MODE=mock|real`, idempotente) + `.env.example` de §5.
- [x] Capa OTP (§2.3): `otp-utils` + `otp-provider` + `otp-dev-provider` + stub WhatsApp.
- [x] `rate.service.ts` + `convert.ts` + `format.ts` (tasa con caché híbrida y fallback).
- [x] Home (server component, force-dynamic) con categorías, recientes y Bs calculado.
- [x] Vitest (24 casos: convert, format, otp-utils) y smoke E2E de Playwright (§6.2) en verde.
- [x] Build y lint en verde; precios verificados end-to-end (`$25.00` → `Bs. 18.665,74` con tasa 746.6297).
- [ ] Consultar `security-reviewer` antes del auth funcional OTP (E1).

---

## 11. Épica E2 — auth OTP funcional, sesión, `User.slug` y CRUD del vendedor

### 11.1 Alcance implementado (estado al cierre de E2)

- **Auth OTP funcional** (dev): `requestOtp`/`verifyOtp` en `src/server/auth/auth.service.ts`
  (lógica pura, sin Next.js) + rutas `/api/auth/{request,verify,logout,me}`.
- **Sesión JWT**: `src/server/auth/session-token.ts` (jose HS256) y `session.ts`
  (`createSession`/`getSession`/`destroySession`/`requireAuth`/`getCurrentUser`).
- **Guard edge**: `src/middleware.ts` (matcher `/vender/:path*`, `/mis-publicaciones/:path*`,
  `/cuenta/:path*` → redirect `/login?next=…`).
- **`User.slug`**: migración en 2 pasos (`add_user_slug` nullable → backfill
  `prisma/backfill-user-slugs.ts` → `user_slug_required` NOT NULL); seed asigna slugs estables.
- **CRUD del vendedor**: `products/service.ts` (lógica de negocio + ownership) compartida por
  server actions (`products/actions.ts`) y `/api/products`; `PRODUCT_STATUS` añade `SOLD`.
- **Imágenes local**: contrato `ImageStorage` + `local.ts` (magic bytes, uuid, `public/uploads`),
  `/api/uploads` (multipart, ownership, límite 5 MB, position 0–15).
- **Business**: `business/validators.ts` + `actions.ts` (`createBusiness`, uno por cuenta).
- **Páginas protegidas mínimas**: `/login` (form OTP con `devCode` en dev), `/mis-publicaciones`,
  `/cuenta`, `/vender` (alta con imagen). UI final a cargo del `designer`.

### 11.2 Flujo de sesión (secuencia de red)

```
POST /api/auth/request { phoneNumber }        (dev: el código se loguea + devCode)
  → rate limit (5/15 min por IP+teléfono) → OtpCode{codeHash, expiresAt=now+5min}
POST /api/auth/verify { phoneNumber, code, redirectTo }
  → verify timing-safe → consumedAt=now
  → find-or-create User (name "Usuario <4 dígitos>", slug único, role BUYER)
  → createSession(userId) [Set-Cookie tunapuy_session httpOnly]
  → 200 { redirectTo } (solo devuelve redirectTo permitido por next/redirectTo)
GET /api/auth/me → { user } (o 401)
POST /api/auth/logout → borra la cookie
```

- **Open redirect**: `redirectTo` se valida contra una lista de rutas locales permitidas
  (`/mis-publicaciones`, `/cuenta`, `/vender`, …); nunca `//host` ni URLs absolutas externas.
- **Seguridad de la cookie**: `httpOnly`, `secure` en producción, `sameSite=lax`, `path=/`.
- El registro es **find-or-create**: no hay pantalla separada; el flujo de login crea la cuenta
  si no existe. El `name` provisional se puede editar en la UI de cuenta (futuro).

### 11.3 Rate limiting OTP

- `RateLimiter` en memoria (`src/server/auth/rate-limit.ts`), clave = `IP|phoneNumber`,
  ventana deslizante de 15 min, máx 5 solicitudes (configurable por env).
- La respuesta de `/api/auth/request` es **siempre genérica** (incluso ante `rate_limited`):
  no revela si el teléfono está registrado.
- Limitación conocida (E3): en despliegues multi-instancia la memoria por proceso no alcanza;
  se migrará a Redis. `devCode` solo se expone con `OTP_PROVIDER=dev`, nunca en producción.

### 11.4 Validación e identidad

- `src/server/validators.ts` centraliza `e164PhoneSchema` (E.164, prefijo VE) re-exportado por
  `products/validators.ts` para compatibilidad de tests.
- `src/lib/slug.ts`: `slugify` (kebab-case ASCII) + `uniqueSlug` (dedupe `-2`, `-3`, …). El slug
  de producto es opcional al crear: se genera del título con dedupe dentro de la transacción.
- Al publicar (ACTIVE) el usuario pasa a `role=SELLER` (`updateMany` idempotente) y se fija
  `publishedAt` si aún no existía (borradores DRAFT no aparecen en vitrina).

### 11.5 Endpoints E2 (resumen)

| Método y ruta | Auth | Descripción |
|---|---|---|
| POST `/api/auth/request` | no | Solicita código OTP (rate limit; respuesta genérica) |
| POST `/api/auth/verify` | no | Verifica código y crea sesión (find-or-create) |
| POST `/api/auth/logout` | no | Borra la cookie de sesión |
| GET `/api/auth/me` | sí | Datos públicos del usuario actual |
| GET `/api/products?status=` | sí | Publicaciones del usuario (dashboard) |
| POST `/api/products` | sí | Crea producto (validación + ownership) |
| PATCH/DELETE `/api/products/[id]` | sí | Edita (parcial) / elimina (solo dueño) |
| POST `/api/uploads` | sí | Sube imagen y la asocia a un producto del dueño |

### 11.6 Checklist E2 (estado al cierre)

- [x] `User.slug` NOT NULL + backfill idempotente (migraciones `20260802210000/10001`).
- [x] Sesión JWT con jose + cookie httpOnly + `AUTH_SECRET` validado en `env.ts`.
- [x] `requestOtp`/`verifyOtp` (hash timing-safe, un solo uso, TTL, intentos) + rate limit.
- [x] CRUD productos con ownership + `SOLD` en `PRODUCT_STATUS`.
- [x] Imágenes local (magic bytes, uuid) + `/api/uploads`.
- [x] Business (`createBusiness`, uno por cuenta, slug dedupe).
- [x] Páginas protegidas mínimas (`/login`, `/mis-publicaciones`, `/cuenta`, `/vender`).
- [x] Seed con `User.slug` + backfill de arranque.
- [x] Typecheck (`tsc --noEmit`), lint, build y `npm test` (80 unit) en verde.
- [x] E2E OTP → publicar → `/mis-publicaciones` en verde.
- [ ] Revisión `security-reviewer` de auth OTP y cookies (pendiente formal, ya con guards).

## 12. Estado real tras el dictamen security (R1–R11) y épicas posteriores

> La sección 11 documenta el diseño original (JWT, rate limit en memoria). Esta
> sección es la **fuente de verdad actual**: el dictamen del security-reviewer
> (R1–R11) cambió el diseño de auth, sesión, rate limit e imágenes.

### 12.1 Sesión opaca (R4) — sin JWT

- `src/server/auth/session-token.ts` genera un token opaco (64 bytes de
  aleatoriedad) y `session-record.ts` persiste en BD `Session{tokenHash=sha256,
  expiresAt=+30d}`. Cookie `__Host-tunapuy_session` (`httpOnly`, `secure` en
  producción, `sameSite=lax`, `path=/`). Renovación deslizante en
  `session-cookie.ts`. Nada del token viaja al cliente (solo el hash en BD).
- `session.ts` expone `getSession`/`requireAuth`/`getCurrentUser` (usa
  `getSessionToken(source?)` con request explícito para API routes).

### 12.2 Dictamen R1–R11 (auth + uploads) — estado

- **R1 rate limit en BD** (`AuthRateLimit`, tabla por key+ventana, TTL): los 4
  buckets de request (por teléfono 1/min, 5/h, 10/día + por IP 10/h) y los 2 de
  verify (15/h teléfono, 20/h IP) se evalúan **siempre antes** de generar o
  verificar el código. `setBlocked` usa un bucket separado `block:<key>` que
  `assertRateLimit` chequea primero → 429 duro de 30 min sin consumir hits.
- **R2** un solo código activo por teléfono (re-solicitar invalida), TTL 5 min,
  máx 5 intentos, consumo único atómico en la **misma transacción** que el
  find-or-create del usuario y la creación de sesión.
- **R3** código hash = `HMAC-SHA256(AUTH_SECRET, salt)` con formato
  `salt(64 hex):hmac(64 hex)` y comparación timing-safe (`verifyOtpCode`).
- **R6** teléfono VE (`+58` + 10 dígitos) validado **antes** de generar;
  `/api/auth/request` responde **siempre 200 genérico** (sin enumeración).
- **R7** guarda de producción: `OTP_PROVIDER=dev` es error de arranque salvo
  despliegue local/mock (`isLocalMockDeployment()`: `DATA_MODE=mock` o APP_URL
  localhost). Explicación: `next build && next start` local corre con
  NODE_ENV=production y e2e necesita el `devCode`.
- **R8** `User.slug @unique` (migración 2 pasos + `backfillUserSlugs`).
- **R9** imágenes: solo jpeg/png/webp por **magic bytes**, máx 5 MB, folders de
  la whitelist `products|businesses|users` (`safe-key.ts`); storage fuera de
  `public/` en `.uploads/` servido por `GET /uploads/[...key]` con
  `assertSafeKey` (path traversal) + `X-Content-Type-Options: nosniff`.
- **R10** producto nace `DRAFT` (`createProductSchema` default), transiciones de
  estado validadas en `products/service.ts` (ARCHIVED no editable salvo
  reactivación), slug duplicado → 409 `ProductSlugConflictError`.
- **R11** `env.ts` valida variables con zod al importar (fail-fast): `AUTH_SECRET`
  ≥32 chars, `OTP_PROVIDER` enum, whatsapp exige `META_*`.

**Rate limit por IP exento en local/mock** (`ipRateLimitEnabled()` en
`auth.service.ts`): sin proxy headers el IP del cliente es `"unknown"` (bucket
único compartido por todo localhost) y tras 10 requests/h se auto-bloquea 30 min,
rompiendo dev/e2e multi-ejecución. En local/mock se aplican los buckets **por
teléfono** (la defensa real por número); en producción (DATA_MODE=db + dominio
público detrás de proxy con `x-forwarded-for`) el rate limit por IP aplica completo.

### 12.3 Perfiles editables (backend)

- `POST /api/uploads` acepta `folder=users|businesses` (avatar/logo) además del
  modo producto (`productId`); con `folder=businesses` exige `businessId` +
  ownership (`Business.ownerId`). Responde `{ url, key }` sin fila en BD.
- `src/server/cuenta/actions.ts`: `updateUserProfileAction` (nombre, email
  opcional, avatarUrl) y `updateBusinessAction` (nombre, descripción, teléfono,
  logoUrl) — requireAuth, solo el negocio propio (`ownerId`), teléfono del
  usuario SOLO LECTURA. Devuelven `{ ok } | { ok: false, error }`.
- `assertUploadedImageUrl()` (`images/validate-upload-url.ts`): las acciones solo
  aceptan URLs de **nuestro** storage (`/uploads/<folder>/` relativa o absoluta
  same-origin, key segura) → nada de `javascript:`/`data:`/URLs externas (XSS).
- "use server" no puede exportar clases ni consts no-async (Turbopack): los
  errores de negocio se mantienen como clases no exportadas o se eliminan.

### 12.4 Multi-categoría (épica E3) — impacto en catálogo

- 13 categorías fijas en `src/lib/constants.ts` (`CategorySlug`); relación
  `ProductCategory{productId, categoryId, position}` (1–3 por producto,
  `position 0` = principal). `categorySlugsSchema` valida 1–3 en el borde.
- `/buscar` filtra por `categories: { some: { category: { slug } } }` (la
  relación directa `category` ya no existe — bug de 500 corregido).
- Seed mock: 13 categorías, 10 vendedores, 10 negocios, 17 productos (los 3
  tests de seed verifican conteos e idempotencia contra BD aislada).

### 12.5 Verificación al cierre

- `tsc --noEmit` limpio · `npm run lint` (0 errores) · `npm run build` OK (19
  rutas) · `npm test` 188/188 (18 archivos) · `npm run test:e2e` 29/29.
- E2E cubre: OTP dev (devCode) → publicar (CategoryPicker) → dashboard;
  logout; catálogo multi-categoría; uploads; rutas privadas con middleware.


