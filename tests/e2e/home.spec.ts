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
});
