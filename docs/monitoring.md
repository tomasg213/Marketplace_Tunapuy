# Monitoreo y observabilidad — Marketplace_Tunapuy (MVP)

> Documento de operaciones: observabilidad mínima para el MVP. Autor:
> `devops-engineer`. Estado: **v1 — solo documentación y health endpoint**.
> No se implementan agentes ni dashboards aún; esto define el *contrato* mínimo
> para detectar problemas de los dos servicios críticos: la **tasa BCV** y el
> **envío de OTP** (docs/architecture.md §3 y §2.3).

---

## 1. Principios (MVP)

- **Mínimo viable**: no se despliega un stack de observabilidad (Prometheus/Grafana/
  Sentry) en E0. Se busca detectar fallos con lo que ya tenemos: logs estructurados
  simples, un endpoint de health y checks externos de uptime.
- **Cero secretos en logs**: nunca registrar códigos OTP, tokens ni datos
  personales (teléfonos completos). Los códigos OTP en `dev` sí salen por consola,
  pero es el **único** canal autorizado (nunca en producción).
- **Alarmas accionables**: toda alerta debe tener un "¿qué hago yo?" concreto.

---

## 2. Endpoint de salud — `GET /api/health`

Implementado en `src/app/api/health/route.ts` (con su test en
`tests/unit/health.test.ts`). Contrato:

| Caso | Respuesta | Significado |
|---|---|---|
| BD accesible | `200 {"status":"ok","db":true}` | App y PostgreSQL disponibles |
| BD caída | `503 {"status":"degraded","db":false}` | La app responde pero la BD no (señal temprana; la vitrina puede seguir sirviendo con la caché de tasa BCV en memoria) |

El probe ejecuta `SELECT 1` con el adapter Prisma (`db.$queryRaw`). No expone
detalles del error al cliente (solo log en el servidor con `service: api-health`).

**Uso previsto**:

- Probes de uptime externos (UptimeRobot, Better Stack, Vercel Status):
  intervalo 5 min, umbral 2 fallos → alerta.
- Liveness/readiness si se self-hostea (Docker `healthcheck` del contenedor de la app).
- Referencia rápida de diagnóstico: `curl https://<app>/api/health`.

---

## 3. Logs (contrato mínimo)

Formato: una línea JSON por evento con campo `service` para poder filtrar.
Ejemplo de implementación (no aplicado aún al resto de módulos):

```ts
console.error(JSON.stringify({
  level: "error",
  service: "rate-bcv",
  message: "dolarapi no responde; sirviendo stale/fallback",
  origin: "stale",
  ts: new Date().toISOString(),
}));
```

Servicios a loguear con prioridad:

1. **`rate-bcv`** (src/server/rate/rate.service.ts): cada vez que la tasa salga
   de la fuente `api`, `stale` o `fallback` (no loguear cada hit de memoria/db:
   ruido). El campo `origin` es la señal clave: si `stale`/`fallback` se repiten,
   la tasa no se está actualizando (ver §4.2).
2. **`otp`** (src/server/auth/*): en producción (`OTP_PROVIDER=whatsapp`) loguear
   `requestId`, teléfono **enmascarado** (`+58412•••789`), proveedor y resultado
   (enviado/fallido) — **nunca** el código. En `dev` el propio
   `otp-dev-provider` imprime el código a consola (único canal autorizado).
3. **`api-health`**: ya lo hace el health endpoint (solo en fallo).

Plataforma: la consola de Vercel ya agrupa los logs de funciones; para el MVP es
suficiente. A futuro (E1+), Sentry o un agregador (Better Stack) con retención.

---

## 4. Alertas mínimas

### 4.1 Uptime de la app

- **Qué vigilar**: `GET /api/health` responde `200` con `db:true`.
- **Con qué**: UptimeRobot (gratis, hasta 50 checks HTTP) o Better Stack.
  En Vercel también existe el Status de proyecto; un check externo es preferible
  porque detecta cortes del proveedor.
- **Umbral**: 2 fallos consecutivos → email/Telegram.
- **Acción**: revisar logs de Vercel, estado del PostgreSQL gestionado, y el
  deploy más reciente (rollback si aplica).

### 4.2 La tasa BCV no se actualiza (la alerta más importante del negocio)

Contexto: la tasa oficial cambia ~1×/día hábil y se cachea con TTL
(`BCV_RATE_TTL_HOURS=6` en `RateCache`, TTL de memoria 10 min). El peor síntoma
no es "no hay tasa" sino **"sigue mostrando la tasa vieja"** (origen `stale`).

- **Qué vigilar**: que la fila `RateCache` (source `dolarapi-oficial`) se renueve
  y no caiga en `origin: stale`/`fallback` de forma persistente.
- **Cómo (MVP, sin job aún)**:
  - Cron/check externo (cada 6–8 h) contra el endpoint `GET /api/rate`
    (docs/architecture.md §1.1) o la propia home: si la fecha de la tasa
    (`fetchedAt`/`fechaActualizacion` publicada) tiene más de **36 h** hábiles, alertar.
  - Alternativa sin API pública: consulta directa a la BD
    `SELECT fetchedAt FROM "RateCache" WHERE source='dolarapi-oficial'` desde el
    check (con credencial de solo lectura).
- **Umbral sugerido**: `expiresAt` vencido y sin renovación en ≥2 ciclos de TTL,
  o `origin=stale|fallback` presente durante >24 h.
- **Acción**: verificar dolarapi (`curl https://ve.dolarapi.com/v1/dolares/oficial`),
  revisar errores de red del servidor (timeouts, egress), y si `BCV_RATE_FALLBACK`
  está activo, decidir con el PM si se oculta el precio en Bs (mejor que mostrarlo
  falso) — criterio de UI pendiente (docs/architecture.md §9.4).

### 4.3 Errores de OTP

- **Qué vigilar**: en producción, la tasa de fallos del envío por WhatsApp
  (logs `otp` con resultado `failed`) y el 429/410 de verificación (códigos
  vencidos/agotados, docs/architecture.md §2.3).
- **Cómo**: búsqueda periódica en los logs de Vercel por
  `service:"otp" level:"error"` o un check de tasa si se adopta un agregador.
- **Umbral**: >5 fallos de envío consecutivos, o pico de `429` (>10/min).
- **Acción**: revisar credenciales de Meta (token, plantilla aprobada), estado del
  proveedor y rate-limiting del endpoint.

---

## 5. Métricas sugeridas para el MVP (a futuro)

- **Build/CI**: tiempo de `npm run build` y de la suite E2E (regresión de
  performance en el repo).
- **App**: tiempo de respuesta de `/` y `/api/rate`, % de requests con
  `origin=api` vs `memory/db` (mide si la caché híbrida funciona).
- **Negocio**: nº de productos publicados, nº de clicks al botón WhatsApp
  (se puede medir con analytics, fuera del alcance de devops).

Nada de esto se implementa en E0: queda como contrato para E1+.

---

## 6. Resumen "primera semana de producción"

1. Crear un proyecto UptimeRobot (o equivalente) apuntando a `/api/health`.
2. Configurar la alerta de tasa BCV (check cada 6–8 h contra `/api/rate` o la BD).
3. Revisar una vez al día los logs de Vercel filtrando `service:"rate-bcv"` y
   `service:"otp"`.
4. Documentar en el repo cualquier umbral que se ajuste con la operación real.
