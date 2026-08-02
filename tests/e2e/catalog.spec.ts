import { expect, test } from "@playwright/test";

// Smoke E2E del catálogo (Épica E1): /buscar, detalle de producto y perfiles.
// Requiere la BD seedeada (DATA_MODE=mock) — mismos datos que el seed.

test("buscar por categoría muestra el título y solo esa categoría", async ({ page }) => {
  await page.goto("/buscar?categoria=comida");

  await expect(page.getByRole("heading", { level: 1, name: "Categoría: Comida" })).toBeVisible();
  await expect(page.getByText(/Arepa Reina Pepiada/)).toBeVisible();
  await expect(page.getByText(/Camisa de Lino/)).toBeHidden();
});

test("buscar por texto muestra resultados para el término", async ({ page }) => {
  await page.goto("/buscar?q=arepa");

  await expect(
    page.getByRole("heading", { level: 1, name: /Resultados para "arepa"/ }),
  ).toBeVisible();
  await expect(page.getByText(/Arepa Reina Pepiada/)).toBeVisible();
  await expect(page.getByText(/Ron Añejo/)).toBeHidden();
});

test("buscar sin resultados muestra el estado vacío con CTA a /vender", async ({ page }) => {
  await page.goto("/buscar?q=no-existe-nada");

  const cta = page.getByRole("link", { name: "¡Sé el primero en vender!" });
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute("href", "/vender");
});

test("buscar con parámetro repetido (?q=a&q=b) no responde 500", async ({ page }) => {
  const res = await page.goto("/buscar?q=a&q=b");
  expect(res?.status()).toBe(200);

  // No debe mostrar una página de error: conserva el formulario y el estado vacío.
  await expect(page.getByRole("heading", { level: 1, name: /Resultados para "a"/ })).toBeVisible();
});

test("buscar con '?' (comodín %) no devuelve todo el catálogo", async ({ page }) => {
  // % está URL-encoded como %25: antes del fix, ILIKE lo trataba como wildcard
  // y devolvía TODOS los productos; ahora debe ser un literal sin coincidencias.
  await page.goto("/buscar?q=%25");

  await expect(page.getByRole("heading", { level: 1, name: /Resultados para "%"/ })).toBeVisible();
  await expect(page.locator('[data-testid="product-card"]')).toHaveCount(0);
  await expect(page.getByRole("link", { name: "¡Sé el primero en vender!" })).toBeVisible();
});

test("buscar con '_' (comodín SQL) no devuelve todo el catálogo", async ({ page }) => {
  await page.goto("/buscar?q=_");

  await expect(page.locator('[data-testid="product-card"]')).toHaveCount(0);
  await expect(page.getByRole("link", { name: "¡Sé el primero en vender!" })).toBeVisible();
});

test("categoria inexistente: 200 con estado vacío y CTA (sin 404)", async ({ page }) => {
  const res = await page.goto("/buscar?categoria=inexistente");
  expect(res?.status()).toBe(200);

  await expect(
    page.getByRole("heading", { level: 1, name: "Categoría: inexistente" }),
  ).toBeVisible();
  await expect(page.getByText(/Aún no hay publicaciones de inexistente/)).toBeVisible();
  await expect(page.getByRole("link", { name: "¡Sé el primero en vender!" })).toBeVisible();
  // Ninguna tarjeta de productos de otras categorías.
  await expect(page.locator('[data-testid="product-card"]')).toHaveCount(0);
});

test("detalle de producto: breadcrumb, título, precio y sticky WhatsApp", async ({ page }) => {
  await page.goto("/productos/arepa-reina-pepiada");

  await expect(page.getByRole("heading", { level: 1, name: "Arepa Reina Pepiada" })).toBeVisible();
  const breadcrumb = page.getByRole("navigation", { name: "breadcrumb" });
  await expect(breadcrumb.getByRole("link", { name: "Inicio" })).toBeVisible();
  await expect(breadcrumb.getByRole("link", { name: "Comida" })).toBeVisible();
  await expect(page.getByText(/Publicado hace/)).toBeVisible();

  await expect(page.locator('[data-testid="price-usd"]')).toHaveText(/^\$\d+(?:[.,]\d+)*\.\d{2}$/);
  await expect(page.locator('[data-testid="price-bs"]')).toHaveText(/^Bs\. \d+(?:[.,]\d+)*,\d{2}$/);

  // Barra sticky: botón WhatsApp con mensaje prellenado de contexto.
  const sticky = page.getByRole("region", { name: "Contacto del anuncio" });
  const waLink = sticky.getByRole("link", { name: /whatsapp/i });
  await expect(waLink).toBeVisible();
  const href = await waLink.getAttribute("href");
  expect(href).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
  expect(href).not.toContain("+");
  expect(decodeURIComponent(href)).toContain('me interesa "Arepa Reina Pepiada"');
  expect(decodeURIComponent(href)).toContain("por $3.50 de");
});

test("detalle de producto: tarjeta del negocio con botón WhatsApp propio", async ({ page }) => {
  await page.goto("/productos/arepa-reina-pepiada");

  await expect(page.getByText("Arepas Doña Ana").first()).toBeVisible();
  // Dos contactos: el sticky del anuncio y el del negocio.
  await expect(page.getByRole("link", { name: /whatsapp/i })).toHaveCount(2);
});

test("detalle de producto con oferta: precio de oferta, tachado y badge ≥10%", async ({ page }) => {
  await page.goto("/productos/empanadas-de-carne-docena");

  // 12.00 → 10.50 es un descuento del 12.5% → badge −13% (redondeo).
  const priceBlock = page.locator('[data-testid="price-block"]');
  await expect(priceBlock.locator('[data-testid="price-usd"]')).toHaveText("$10.50");
  await expect(priceBlock.getByText(/[−-]13%/)).toBeVisible();
  await expect(priceBlock.locator(".line-through")).toHaveText("$12.00");
});

test("detalle de producto sin oferta: precio único, sin badge ni tachado", async ({ page }) => {
  await page.goto("/productos/arepa-reina-pepiada");

  const priceBlock = page.locator('[data-testid="price-block"]');
  await expect(priceBlock.locator('[data-testid="price-usd"]')).toHaveText("$3.50");
  await expect(priceBlock.locator(".line-through")).toHaveCount(0);
  await expect(priceBlock.getByText("%")).toHaveCount(0);
});

test("RateInfo: el botón de la tasa abre el diálogo con tasa y fecha", async ({ page }) => {
  await page.goto("/productos/arepa-reina-pepiada");

  await page.getByRole("button", { name: /Equivalente según tasa BCV/ }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Equivalencia en bolívares" })).toBeVisible();
  await expect(dialog).toContainText(/Bs\. \d[\d.,]*/);
  await expect(dialog).toContainText(/del \d+ de \w+ de \d{4}|\/USD/);
});

test("perfil de vendedor persona muestra su nombre y publicaciones", async ({ page }) => {
  await page.goto("/vendedores/ana-perez");

  await expect(page.getByRole("heading", { level: 1, name: "Ana Pérez" })).toBeVisible();
  await expect(page.getByText(/Arepa Reina Pepiada/)).toBeVisible();
});

test("perfil de negocio muestra WhatsApp propio y sus publicaciones", async ({ page }) => {
  await page.goto("/negocios/arepas-dona-ana");

  await expect(
    page.getByRole("heading", { level: 1, name: "Arepas Doña Ana" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Contactar a Arepas Doña Ana por WhatsApp" }).first(),
  ).toBeVisible();
  await expect(page.getByText(/Arepa Reina Pepiada/)).toBeVisible();
});

test("perfil de negocio: WhatsApp usa el teléfono del negocio (wa.me/58...)", async ({
  page,
}) => {
  await page.goto("/negocios/arepas-dona-ana");

  const waLink = page
    .getByRole("link", { name: "Contactar a Arepas Doña Ana por WhatsApp" })
    .first();
  const href = await waLink.getAttribute("href");
  // El negocio del seed tiene phoneNumber +580000000011 → wa.me/580000000011.
  expect(href).toMatch(/^https:\/\/wa\.me\/580000000011\?text=/);
  expect(href).not.toContain("+");
});

test("producto inexistente responde 404 (no 500)", async ({ page }) => {
  const res = await page.goto("/productos/no-existe");
  expect(res?.status()).toBe(404);
});

test("borrador no es accesible públicamente (404)", async ({ page }) => {
  const res = await page.goto("/productos/paquete-bujias-iridio");
  expect(res?.status()).toBe(404);
});

test("vendedor inexistente responde 404", async ({ page }) => {
  const res = await page.goto("/vendedores/no-existe");
  expect(res?.status()).toBe(404);
});

test("negocio inexistente responde 404", async ({ page }) => {
  const res = await page.goto("/negocios/no-existe");
  expect(res?.status()).toBe(404);
});

test.describe("móvil (viewport 390x844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("la barra sticky del detalle no se solapa con la bottom nav ni el FAB +Vender", async ({
    page,
  }) => {
    await page.goto("/productos/arepa-reina-pepiada");

    const bottomNav = page.getByRole("navigation", { name: "Navegación principal" });
    await expect(bottomNav).toBeVisible();

    const sticky = page.getByRole("region", { name: "Contacto del anuncio" });
    const fab = page.getByRole("link", { name: "Publicar un producto en venta" });
    const stickyWa = sticky.getByRole("link", { name: /whatsapp/i });

    await expect(sticky).toBeVisible();
    await expect(fab).toBeVisible();

    const stickyBox = await sticky.boundingBox();
    const fabBox = await fab.boundingBox();
    const waBox = await stickyWa.boundingBox();
    expect(stickyBox).not.toBeNull();
    expect(fabBox).not.toBeNull();
    expect(waBox).not.toBeNull();

    // Solapamiento real en el viewport móvil (bug E1: FAB sobre la barra sticky).
    const overlaps = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

    expect(overlaps(stickyBox!, fabBox!), "sticky bar vs FAB").toBe(false);
    expect(overlaps(waBox!, fabBox!), "botón WhatsApp sticky vs FAB").toBe(false);
  });

  test("targets táctiles del detalle y de la nav cumplen ≥44px", async ({ page }) => {
    await page.goto("/productos/arepa-reina-pepiada");

    const stickyWa = page
      .getByRole("region", { name: "Contacto del anuncio" })
      .getByRole("link", { name: /whatsapp/i });
    const waBox = await stickyWa.boundingBox();
    expect(waBox).not.toBeNull();
    expect(waBox!.height).toBeGreaterThanOrEqual(44);

    const fabBox = await page
      .getByRole("link", { name: "Publicar un producto en venta" })
      .boundingBox();
    expect(fabBox).not.toBeNull();
    expect(fabBox!.width).toBeGreaterThanOrEqual(44);
    expect(fabBox!.height).toBeGreaterThanOrEqual(44);

    // Enlaces de la bottom nav: min-h-16 = 64px.
    const navLink = page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link", { name: "Inicio" });
    const navBox = await navLink.boundingBox();
    expect(navBox).not.toBeNull();
    expect(navBox!.height).toBeGreaterThanOrEqual(44);
  });
});
