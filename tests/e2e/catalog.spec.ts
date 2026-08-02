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
