# Despliegue y entornos — Marketplace_Tunapuy

> Documento de operaciones: estrategia de despliegue, CI/CD, entornos, secretos
> y mapa de variables. Autor: `devops-engineer`. Estado: **v1 — MVP (E0)**.
> Complementa a `docs/architecture.md` (§4.3 y §5). El pipeline CI ya está
> configurado en `.github/workflows/ci.yml`; el proveedor de despliegue aún **no**
> está conectado (esta guía es accionable, no configurada).

---

## 1. Resumen ejecutivo

- **CI**: GitHub Actions en cada PR y push a `develop`/`main` → `npm ci` → lint →
  build → `prisma migrate deploy` + seed (`DATA_MODE=mock`) → Vitest → Playwright.
- **Estrategia por rama**: `develop` = entorno de **preview** (`DATA_MODE=mock`);
  `main` = **producción** (`DATA_MODE=real`, catálogo real lo suben los vendedores).
- **Hosting recomendado (MVP)**: **Vercel** para la app (Next.js App Router de
  primera clase, preview deployments por PR) + **PostgreSQL gestionado**
  (Neon/Supabase/RDS) para la base. Alternativa documentada: Docker self-host en VPS.
- **Secretos**: nunca en el repo. Viven en el secret store del host (GitHub
  Actions Secrets, Vercel Env Vars, gestor de la plataforma). `.env.example` es el
  único template commiteado.
- **Migraciones**: `prisma migrate deploy` en CI (BD de pruebas) y en despliegues,
  siempre por un paso explícito, nunca dentro del build de la app sin revisión.

---

## 2. Estrategia por rama → entorno

| Rama | Entorno | `DATA_MODE` | `OTP_PROVIDER` | Contenido de datos | Despliegue |
|---|---|---|---|---|---|
| `develop` | preview | `mock` | `dev` | Seed con vendedores/negocios/productos ficticios (`+58 000...`) | Preview deploy por push |
| `main` | producción | `real` | `whatsapp` | Solo el catálogo base (6 categorías); los productos los publican los vendedores | Deploy de producción por merge |

Flujo de trabajo:

```
PR (cualquier rama) ──► CI completo (lint · build · test · e2e) ──► [aprobar/merge]
        │
        ▼
push a develop ──► CI + deploy PREVIEW (DATA_MODE=mock, seed mock)
        │
        ▼
merge develop → main ──► CI + deploy PRODUCCIÓN (DATA_MODE=real, sin seed automático)
```

Reglas de oro:

- **Un solo binario**: el mismo código se despliega en ambos entornos; la única
  diferencia de datos la introduce el entorno (`DATA_MODE`). Si algún cambio
  ramifica la lógica por `DATA_MODE`, es un anti-patrón (docs/architecture.md §4.4).
- El smoke E2E corre **siempre contra `mock`** (la UI es idéntica en ambos modos).
- En producción el seed **no** corre automáticamente en cada deploy (docs de
  arquitectura §4.3): solo el catálogo base en el primer arranque o a mano.
- Todo cambio relevante pasa por staging/preview antes de producción.

---

## 3. Pipeline de CI/CD (GitHub Actions)

### 3.1 Lo que hace el workflow (`.github/workflows/ci.yml`)

Eventos: `pull_request`, `push` a `develop` y `main`, y `workflow_dispatch`
(manual). Hay `concurrency` por rama: un push nuevo cancela la run anterior.

Pasos, en orden:

1. `actions/checkout@v4`.
2. `actions/setup-node@v4` con `node-version: 22` y `cache: npm` (caché del
   registro npm → `npm ci` rápido).
3. `npm ci` — instala dependencias desde el lockfile; el `postinstall` ejecuta
   `prisma generate` (cliente en `/generated`, gitignored).
4. Caché de `.next/cache` (build incremental de Next.js) vía `actions/cache@v4`.
5. Caché de los binarios de Playwright (`~/.cache/ms-playwright`) + instalación
   condicional de `npx playwright install --with-deps chromium`.
6. `npm run lint` — ESLint (config de `next/core-web-vitals` + TS).
7. `npm run build` — build de producción (Next.js 16, Turbopack).
8. `npm run db:deploy` — `prisma migrate deploy` (migraciones versionadas, no
   generativas) contra la BD de pruebas.
9. `npm run db:seed` — seed `DATA_MODE=mock` (datos ficticios deterministas).
10. `npm test` — Vitest (unitarias, puras).
11. `npm run test:e2e` — Playwright: el `webServer` levanta `build + start` contra
    la BD mock y valida la home (categorías + precios USD/Bs).

La BD de pruebas es un **servicio de contenedor** del propio workflow
(`postgres:16-alpine`, el mismo que `docker-compose.yml`), con healthcheck
(`pg_isready`) y mapeo a `localhost:5432`.

### 3.2 Cómo se pasan las variables al pipeline

- **BD de pruebas / CI**: no usa secrets. `DATABASE_URL` apunta al servicio
  contenedor del job y `DATA_MODE=mock`, `OTP_PROVIDER=dev` y
  `BCV_RATE_FALLBACK=746.6297` se definen como `env` a nivel de workflow (tasa
  determinista para el E2E, sin depender de que dolarapi responda desde el runner).
- **Despliegue (futuro)**: las variables por entorno se inyectan como **secrets de
  GitHub Actions** (ver §5) o como **Env Vars del proveedor** (Vercel). El paso de
  deploy leerá el secret adecuado según la rama, p. ej.
  `${{ github.ref == 'refs/heads/main' && secrets.DATABASE_URL_PRODUCTION || secrets.DATABASE_URL_PREVIEW }}`.

---

## 4. Hosting: opciones comparadas y decisión

### 4.1 Comparativa

| Criterio | **Vercel** | Docker self-host (VPS) | Netlify / Cloudflare Pages | Railway / Render / Fly.io |
|---|---|---|---|---|
| Fit con Next.js App Router | **Nativo** (framework preset, edge/serverless, ISR, middleware) | Total (proceso Node) | Bueno (Netlify) / requiere adaptación (CF Pages) | Bueno (contenedores) |
| Preview por PR | **Automático** (cada PR → URL) | Manual (arrastrar rama, nginx) | Netlify sí, CF Pages no por defecto | Manual |
| Operación/MTO | Cero (managed) | Alta (OS, nginx, TLS, actualizaciones, backups) | Baja | Baja-media |
| Costo MVP | Gratis (Hobby) | ~5–20 USD/mes VPS + tiempo de operación | Gratis | Gratis limitado / pay-per-use |
| Postgres | Externo (Neon/Supabase/RDS) | En el mismo VPS o externo | Externo | Managed incluido |
| Escalado | Serverless (automático) | Manual (aumentar VPS, replicar) | Serverless | Manual |
| Riesgos | Vendor lock-in leve, cold starts | Tu responsabilidad: seguridad, backups, TLS | Menos flexible para Server Actions/edge | Menos probado con Next edge |

### 4.2 Decisión recomendada: **Vercel + PostgreSQL gestionado**

Justificación para el MVP (vitrina local, equipo chico, cero infra dedicada):

1. Next.js App Router con rutas `force-dynamic` (home lee BD y tasa BCV en cada
   request) es exactamente el caso de uso de **first-class** de Vercel: serverless
   sin configuración, TLS automático y preview deployments por rama **sin
   esfuerzo** (esto cubre la estrategia develop→preview de la §2 de forma gratuita).
2. `NEXT_PUBLIC_*` y las variables de entorno por entorno (Development/Preview/
   Production) se gestionan en la consola sin tocar el repo.
3. Costo inicial cero (Hobby) y el proyecto es de bajo volumen: encaja con el
   "cero infra" del MVP; la migración a self-host queda documentada si el modelo
   de negocio o la regulación lo exigen.
4. La BD se **desacopla** del hosting (decisión de arquitectura: PostgreSQL en
   todos los entornos). Neon o Supabase (ambas PostgreSQL) dan un
   `DATABASE_URL` por entorno (dev/preview/prod) con snapshots y sin operar un
   servidor de base de datos.

**Alternativa documentada (cuando tenga sentido)**: Docker self-host en un VPS
con `docker compose` (la app como contenedor Next.js + Postgres 16 como servicio,
ya validado en dev). Es la vía cuando: quieras control total de costos a escala,
latencia local del mercado, o restricciones de datos. Requiere mantener TLS
(Caddy/nginx), backups de Postgres, monitoring de procesos y un proxy inverso.
Esta guía no configura ese despliegue: solo se documenta como plan B.

### 4.3 Pasos para conectar Vercel (cuando el PM lo autorice)

1. **Instalar la CLI y autenticar** (una vez por desarrollador):
   ```bash
   npm i -g vercel && vercel login
   ```
2. **Importar el repo**: `vercel link` (o consola → New Project → importar el
   repo GitHub; framework preset detecta Next.js, build `npm run build`, output `.next`).
3. **Crear la base de datos gestionada**: Neon/Supabase → crear proyecto
   `tunapuy` → copiar el `DATABASE_URL` de cada entorno (dev/preview/prod).
4. **Configurar Env Vars por entorno** en Project → Settings → Environment
   Variables (ver el mapa de la §6). Los secretos van ahí, no en el repo.
5. **Primer deploy**: push a `develop` → Vercel crea el Preview con la URL
   `<branch>--<project>.vercel.app`; el merge a `main` despliega Producción.
6. **Dominio**: Project → Settings → Domains → añadir el dominio definitivo
   (p. ej. `tunapuy.com`) y apuntar el DNS a Vercel (o usar el CNAME de preview).
7. **Migraciones**: ejecutar `npm run db:deploy` contra la BD de destino **antes
   o después del deploy, explícitamente** — nunca en el build. Recomendado: un
   job de GitHub Actions `migrate` con `workflow_dispatch`/`environment` y
   approver, usando `DATABASE_URL_PRODUCTION` (plantilla en §5).
8. **Verificar CI enlazada**: `npx vercel pull --environment=preview` valida que
   el proyecto esté conectado a las ramas.

---

## 5. Secretos de GitHub Actions — plantilla

Los secrets se crean en **repo → Settings → Secrets and variables → Actions →
New repository secret**. Valores reales solo allí, **nunca** en `.env` ni en el repo.

| Nombre del secret | Valor que guardar | Uso |
|---|---|---|
| `DATABASE_URL_PREVIEW` | `postgresql://user:pass@host:5432/tunapuy_preview` | BD del entorno preview (push a `develop`) |
| `DATABASE_URL_PRODUCTION` | `postgresql://user:pass@host:5432/tunapuy_prod` | BD de producción (merge a `main`) |
| `VERCEL_TOKEN` | Token de acceso de la cuenta Vercel | CLI `vercel --token` en el paso de deploy |
| `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` | `vercel project ls` / `vercel link` | Identifican el proyecto en el deploy |
| `META_WHATSAPP_TOKEN` | Token de Meta (System User) | `OTP_PROVIDER=whatsapp` en producción |
| `META_WHATSAPP_PHONE_NUMBER_ID` | ID del número de negocio | Idem |
| `META_WHATSAPP_BUSINESS_ACCOUNT_ID` | WABA ID (auditoría) | Idem |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Credenciales de objetos (E3) | `IMAGE_PROVIDER=s3` |
| `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Credenciales Cloudinary (E3) | Alternativa de imágenes |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Claves de pago (E3+) | Contrato futuro |

Plantilla del paso de deploy (ejemplo, a añadir cuando el proveedor esté
conectado; con `environment` para aprobación en prod):

```yaml
# Fragmento ilustrativo — NO activo hasta conectar el proveedor.
deploy:
  needs: ci
  if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/develop'
  runs-on: ubuntu-latest
  environment: ${{ github.ref == 'refs/heads/main' && 'production' || 'preview' }}
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: 22, cache: npm }
    - run: npm ci
    - name: Aplicar migraciones (solo si hay cambios de esquema)
      run: npm run db:deploy
      env:
        DATABASE_URL: ${{ github.ref == 'refs/heads/main' && secrets.DATABASE_URL_PRODUCTION || secrets.DATABASE_URL_PREVIEW }}
    - name: Deploy a Vercel
      run: npx vercel deploy --yes --token "${{ secrets.VERCEL_TOKEN }}" --prod
      env:
        VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
        VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
```

Regla: **principio de menor privilegio** — cada secret existe solo donde se usa;
el token de Vercel es de deploy (no admin); las credenciales de BD de preview y
producción son distintas y con permisos restringidos.

---

## 6. Mapa de variables por entorno

Valores **reales** que debe tener cada entorno. Todo lo marcado como `—` queda
vacío/ausente (no configurado aún).

| Variable | Desarrollo (local) | Preview (`develop`) | Producción (`main`) |
|---|---|---|---|
| `NODE_ENV` | `development` | `production` (lo fija Vercel) | `production` |
| `APP_URL` | `http://localhost:3000` | `https://<branch>--<proyecto>.vercel.app` | dominio definitivo (p. ej. `https://tunapuy.com`) |
| **`DATA_MODE`** | **`mock`** | **`mock`** | **`real`** |
| `NEXT_PUBLIC_APP_NAME` | `Tunapuy` | `Tunapuy` | `Tunapuy` |
| `NEXT_PUBLIC_SHOW_MOCK_BANNER` | `true` | `true` | `false` |
| `DATABASE_URL` | Postgres local (`localhost:5432/tunapuy`) | `DATABASE_URL_PREVIEW` (Neon/Supabase/RDS) | `DATABASE_URL_PRODUCTION` |
| `BCV_RATE_API_URL` | `https://ve.dolarapi.com/v1/dolares/oficial` | idem | idem |
| `BCV_RATE_TTL_HOURS` | `6` | `6` | `6` |
| `BCV_RATE_TTL_MEMORY_MINUTES` | `10` | `10` | `10` |
| `BCV_RATE_TIMEOUT_MS` | `5000` | `5000` | `5000` |
| `BCV_RATE_FALLBACK` | `746.6297` | `746.6297` (determinista en preview) | *(decisión PM: vacío para no mostrar tasa falsa, o valor con aviso)* |
| **`OTP_PROVIDER`** | **`dev`** | **`dev`** | **`whatsapp`** |
| `OTP_TTL_MINUTES` | `5` | `5` | `5` |
| `OTP_MAX_ATTEMPTS` | `5` | `5` | `5` |
| `META_WHATSAPP_*` | — | — | secrets de Meta (`OTP_PROVIDER=whatsapp`) |
| `IMAGE_PROVIDER` | `local` | `local` | `s3` (o `cloudinary`, decisión E3) |
| `S3_*` / `CLOUDINARY_*` | — | — | secrets del proveedor de imágenes |
| `STRIPE_*` | — | — | contrato E3+, aún sin uso |
| `PLAYWRIGHT_BASE_URL` | `http://localhost:3000` | solo CI/tests | solo CI/tests |

Checklist por entorno antes de desplegar:

- [ ] Preview: `DATA_MODE=mock`, `OTP_PROVIDER=dev`, `NEXT_PUBLIC_SHOW_MOCK_BANNER=true`.
- [ ] Producción: `DATA_MODE=real`, `OTP_PROVIDER=whatsapp`, `NEXT_PUBLIC_SHOW_MOCK_BANNER=false`,
      `BCV_RATE_FALLBACK` según decisión del PM, secrets de Meta configurados.
- [ ] `DATABASE_URL` de cada entorno apunta a una BD **distinta** (nunca compartir
      la de preview con producción).
- [ ] `/.env*` gitignorado (ya lo está); `.env.example` actualizado.

---

## 7. Despliegue manual y rollback (MVP)

- **Deploy**: merge a `main` dispara CI + (cuando esté conectado) deploy de
  producción. Todo push a `develop` genera preview.
- **Rollback**: en Vercel, cada deploy genera una URL inmutable; se puede
  **promover cualquier deploy anterior** a producción desde el dashboard
  (Instant Rollback). Con self-host, se re-despliega la imagen/tag anterior
  (`docker compose` con la imagen previa).
- **BD**: las migraciones son versionadas y **aditivas** en el MVP. Para rollback
  de esquema: migración inversa explícita (nunca `migrate reset` en prod).

---

## 8. Referencias

- `.github/workflows/ci.yml` — pipeline CI.
- `docs/architecture.md` §4 (mock vs real) y §5 (variables).
- `docs/monitoring.md` — observabilidad mínima (health, logs, alertas BCV).
- `docker-compose.yml` — Postgres 16 de desarrollo (misma imagen que el servicio de CI).
