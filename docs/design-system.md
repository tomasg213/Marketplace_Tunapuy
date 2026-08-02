# Design System — Marketplace Tunapuy (Épica 0)

> Especificación del `design-advisor` (sesión 03bd7a83). El `designer` implementa sobre esta base. Valores cerrados, sin reinterpretación.

## 1. Concepto e identidad

Identidad "mar Caribe del oriente venezolano" (Tunapuy, estado Sucre): **azul mar profundo** (confianza, comercio), **ámbar/sol** (calidez, ofertas) y **verde WhatsApp** (acción — **reservado EXCLUSIVAMENTE para el botón de contacto**, nunca en badges, avatares u otros elementos). Evitar colores literales de la bandera (cliché).

## 2. Tokens de color (shadcn/ui + Tailwind v4, `@theme inline`)

Tema claro por defecto (default). Dark: solo tokens en E0, sin pulir.

| Token | Valor (claro) | Uso |
|---|---|---|
| `--background` | `#FAFAF9` (stone-50) | Fondo de página |
| `--foreground` | `#1C1917` (stone-900) | Texto principal |
| `--card` | `#FFFFFF` | Superficies |
| `--card-foreground` | `#1C1917` | Texto sobre tarjeta |
| `--primary` | `#155E75` (cyan-800) | Botones de marca, links, header, foco |
| `--primary-foreground` | `#FFFFFF` | Texto sobre primario |
| `--secondary` | `#E7E5E4` (stone-200) | Chips/badges neutros |
| `--secondary-foreground` | `#292524` (stone-800) | Texto sobre secundario |
| `--muted` | `#F5F5F4` (stone-100) | Fondos de inputs, precios Bs |
| `--muted-foreground` | `#57534E` (stone-600) | **Precio en Bs**, metadatos |
| `--accent` | `#FDE68A` (amber-200) | Badge "Oferta", hover chips |
| `--accent-foreground` | `#78350F` (amber-900) | Texto badge oferta |
| `--destructive` | `#B91C1C` (red-700) | Errores, eliminar |
| `--border` / `--input` | `#E7E5E4` (stone-200) | Bordes |
| `--ring` | `#155E75` | Foco visible (2–3px + offset) |
| `--radius` | `0.75rem` | Tarjetas/contendores |
| `--radius-sm` | `0.5rem` | Inputs y botones |

Tokens de dominio (en `@theme inline` para utilidades propias):

| Token | Valor | Uso |
|---|---|---|
| `--brand-whatsapp` | `#25D366` | Fondo botón WhatsApp (verde oficial) |
| `--brand-whatsapp-foreground` | `#062E26` | **Texto sobre verde** (solución AA ~7,8:1) |
| `--brand-whatsapp-muted` | `#128C7E` | Variante secundaria (texto blanco ~4,0:1) |
| `--price-primary` | `#1C1917` | Cifra precio principal ($) |
| `--price-secondary` | `#57534E` | Precio Bs |
| `--price-sale` | `#B45309` (amber-700) | Precio de oferta (AA 4,8:1) |
| `--price-strikethrough` | `#78716C` (stone-500) | Precio original tachado |

**Regla de contraste:** el precio Bs **nunca** por debajo de `stone-500` (#78716C). Prohibido gray-400 para texto.

## 3. Tipografía

- **Inter** (variable, vía `next/font`). Escala 1,25 base 16px: `12/14/16/18/20/24/30/36`. Line-height 1,5 cuerpo, 1,25 títulos. Pesos: 400/500/600/700.
- **Números tabulares OBLIGATORIOS en precios**: `font-variant-numeric: tabular-nums` (los precios no "saltan" de ancho).
- `<html>` base 16px (evita zoom iOS en inputs).

## 4. Precios — jerarquía (componente `PriceDisplay`)

**Regla de oro:** el Bs. es SIEMPRE el equivalente del **precio efectivo** (la oferta si existe), nunca del tachado. Bs. calculado **server-side**.

Formato (utilidad `formatPrice` ya en `lib/format.ts`): USD `$25.00` (punto decimal, 2 dígitos); Bs. `Bs. 18.665,74` (miles con punto, decimal con coma).

**Sin oferta** (bloque de 3 líneas, `text-left`):
```
$25.00          ← 20px, peso 700, price-primary
Bs. 18.665,74   ← 13px, peso 500, price-secondary
```

**Con oferta**:
```
$22.00  [−12%]   ← 20px, peso 700, amber-700; badge pill ámbar junto a cifra (solo si descuento ≥10%)
$25.00 (tachado) ← 13px, peso 400, stone-500
Bs. 16.214,15    ← 13px, peso 500, muted-foreground
```

A11y: `aria-label` — sin oferta: "Precio: 22 dólares. Equivalente en bolívares: 16 mil 214 bolívares con 15 céntimos." Con oferta: "Precio en oferta: 22 dólares. Precio anterior: 25 dólares. …"

## 5. Componentes

**Custom (construir en E0):**
- `PriceDisplay` — bloque de 3 niveles (props: `principal`, `bs`, `oferta?`, `variante: "card"|"detail"`, `aria-label` automático).
- `WhatsAppButton` — `href={wa.me/<tel>/…?text=prefilled}`; variantes `solid` (#25D366 + #062E26 bold) y `secondary` (#128C7E + blanco). Mínimo 44px alto (52px sticky detalle). `aria-label` descriptivo: "Contactar a [vendedor] por WhatsApp".
- `BottomNav` — bottom nav móvil con FAB central "+Vender" (56px, icono +), 5 destinos: Inicio · Categorías · [+Vender] · Mis publicaciones · Cuenta. 64px + `env(safe-area-inset-bottom)`. `aria-current="page"`. Desktop (≥lg): header + footer, sin bottom nav.
- `CategoryChips` — scroll horizontal accesible de las 6 categorías (icono + nombre).

**shadcn/ui en E0:** button (variantes default/whatsapp-custom/outline/ghost/destructive), card, badge (+variante `offer` ámbar), input/label/textarea (48px alto, text-base), avatar, skeleton (`aria-busy`), separator, tooltip, sonner (toast), sheet, dropdown-menu, dialog, tabs, select, radio-group, form, breadcrumb.

## 6. Estructura de páginas (IA)

| Ruta | Página |
|---|---|
| `/` | Home: buscador → chips categorías → destacados → recientes → footer con tasa BCV del día |
| `/buscar` | Resultados (`?q=` y `?categoria=slug`) |
| `/productos/[slug]` | Detalle de producto (galería, precios ampliados, vendedor, sticky CTA WhatsApp) |
| `/vendedores/[slug]` / `/negocios/[slug]` | Perfil vendedor persona / negocio (botón WhatsApp propio en negocio) |
| `/vender` | Alta de publicación (stepper 4 pasos) |
| `/mis-publicaciones` | Activas / Agotadas / Borradores |
| `/cuenta`, `/registro`, `/login` | Auth OTP |
| `/terminos`, `/privacidad`, `/contacto` | Estáticos |

Home (orden móvil): 1) buscador, 2) chips categorías, 3) destacados (grilla 2 col), 4) recientes (grilla 2 col), 5) footer. Tarjeta: foto 4:3 `loading=lazy`; badge OFERTA ámbar esquina superior izquierda; título `line-clamp-2`; bloque precios íntegro; botón WhatsApp full-width; meta vendedor 12px. **Solo foto+título son el `<a>` al detalle** (el botón WhatsApp es el 2º `<a>` independiente — prohibido tarjeta entera clicable).

## 7. Accesibilidad (WCAG AA)

- Objetivos táctiles ≥44×44px (48 primarios); separación ≥8px entre targets.
- Foco visible con ring primario, `outline-offset: 2px`. Skip link. Landmarks semánticos. `lang="es"`.
- Precios con `aria-label` (§4); botones WhatsApp con `aria-label` descriptivo; imágenes `alt` descriptivo.
- Estados vacíos con CTA ("Aún no hay publicaciones de comida. ¡Sé el primero en vender!").
- `prefers-reduced-motion` desactiva animaciones. Sin carruseles autoplay. Skeletons con `aria-busy`.
- Grillas: 2 col móvil (≥360px), 3 en `sm`, 4 en `lg`. Fotos 4:3. LCP < 2,5s.

## 8. Implementación (orden)

Tokens CSS → `PriceDisplay` + integrar `formatPrice` → `WhatsAppButton` → `BottomNav` → `CategoryChips` → primitivos → validar contraste AA con QA → aplicar al home existente (E0) → resto de páginas en E1.
