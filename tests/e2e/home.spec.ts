import { expect, test } from "@playwright/test";

// Smoke E2E de la home (docs/architecture.md §6.2).
// Requiere la BD seedeada (DATA_MODE=mock) y la tasa BCV disponible
// (real de dolarapi o fallback BCV_RATE_FALLBACK del .env).

const CATEGORY_NAMES = ["Comida", "Ropa", "Zapatos", "Perfume", "Automotriz", "Licor"];

test("home carga y muestra las 6 categorías", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/Tunapuy/);
  await expect(
    page.getByRole("heading", { level: 2, name: "Categorías" }),
  ).toBeVisible();

  for (const name of CATEGORY_NAMES) {
    await expect(page.getByRole("link", { name, exact: true }).first()).toBeVisible();
  }
});

test("chips de categoría apuntan a /buscar?categoria=<slug>", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("link", { name: "Comida", exact: true }).first()).toHaveAttribute(
    "href",
    "/buscar?categoria=comida",
  );
  await expect(page.getByRole("link", { name: "Licor", exact: true }).first()).toHaveAttribute(
    "href",
    "/buscar?categoria=licor",
  );
});

test("home muestra productos con precio en USD y en Bs", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 2, name: /Productos recientes/ }),
  ).toBeVisible();

  // Al menos una tarjeta de producto renderizada.
  const firstCard = page.locator('[data-testid="product-card"]').first();
  await expect(firstCard).toBeVisible();

  // Precio USD con formato $xx.xx
  await expect(firstCard.locator('[data-testid="price-usd"]')).toHaveText(/^\$\d+(?:[.,]\d+)*\.\d{2}$/);

  // Precio Bs con formato "Bs. 18.665,74" (o el fallback si la API falla)
  await expect(firstCard.locator('[data-testid="price-bs"]')).toHaveText(/^Bs\. \d+(?:[.,]\d+)*,\d{2}$/);

  // El footer informa de la tasa BCV (con valor o con aviso de no disponible).
  await expect(page.getByTestId("rate-info")).toContainText("Tasa BCV");
});

test("home muestra tarjetas con oferta (badge OFERTA) y sin oferta", async ({ page }) => {
  await page.goto("/");

  const cards = page.locator('[data-testid="product-card"]');
  await expect(cards.first()).toBeVisible();

  // El seed mock tiene productos con descuento ≥ 10 % (badge) y sin oferta.
  const withOffer = await page
    .locator('[data-testid="product-card"]:has-text("OFERTA")')
    .count();
  const total = await cards.count();

  expect(total).toBeGreaterThan(0);
  expect(withOffer, "debe haber al menos un producto con badge OFERTA").toBeGreaterThan(0);
  expect(withOffer, "debe haber productos sin badge OFERTA").toBeLessThan(total);
});

test("botón WhatsApp: enlace directo https://wa.me/ sin '+' y como <a> independiente", async ({
  page,
}) => {
  await page.goto("/");

  const firstCard = page.locator('[data-testid="product-card"]').first();
  const waLink = firstCard.getByRole("link", { name: /whatsapp/i });

  await expect(waLink).toBeVisible();
  const href = await waLink.getAttribute("href");

  // wa.me/<n> sin '+', con texto predefinido codificado.
  expect(href).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
  expect(href).not.toContain("+");
  // Los teléfonos mock del seed son +58 000... → wa.me/5800...
  expect(href).toContain("wa.me/5800");
  expect(href).toContain("text=");
});

test.fixme(
  "click en categoría filtra el catálogo (/buscar?categoria=<slug>)",
  async ({ page }) => {
    // Ruta /buscar NO implementada en E0 (los filtros/búsqueda son la Épica E2).
    // Hoy los chips enlazan a /buscar?categoria=... que responde 404 (bug B1).
    // Activar este test cuando exista la ruta (E2).
    await page.goto("/");
    await page.getByRole("link", { name: "Comida", exact: true }).first().click();
    await expect(page).toHaveURL(/\/buscar\?categoria=comida/);
    await expect(page.getByText(/Arepa Reina Pepiada/)).toBeVisible();
    await expect(page.getByText(/Camisa de Lino/)).toBeHidden();
  },
);
