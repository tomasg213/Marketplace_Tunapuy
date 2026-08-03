// E2E del flujo de vendedor (Épica E2): login OTP → alta de producto → dashboard.
//
// Escenario (docs/architecture.md §11.2):
//   1. /vender está protegido por el middleware → redirige a /login?next=/vender.
//   2. Login por teléfono + código OTP (OTP_PROVIDER=dev: el código aparece en
//      pantalla como devCode, nunca en producción).
//   3. El alta de producto (server action createProduct + /api/uploads opcional)
//      publica y redirige a /mis-publicaciones.
//
// Usa un teléfono y un título únicos por ejecución (timestamp) para ser
// idempotente frente a re-ejecuciones sobre la BD mock de desarrollo.
import { expect, test } from "@playwright/test";

// Teléfono E.164 VE válido (R6): +58 + 10 dígitos nacionales (p. ej.
// +584121234567). El prefijo móvil "4" + 9 dígitos del timestamp garantiza
// formato correcto y unicidad entre ejecuciones.
const stamp = Date.now().toString().slice(-9);
const phoneNumber = `+584${stamp}`; // +58 + 10 dígitos (nacional 11)
const productTitle = `Empanada E2E ${stamp}`;

test("registro OTP → publicar producto → aparece en Mis publicaciones", async ({ page }) => {
  // 1. Ruta protegida → redirige al login conservando el destino (deep-link).
  await page.goto("/vender");
  await expect(page).toHaveURL(/\/login\?next=%2Fvender/);
  await expect(page.getByRole("heading", { name: "Inicia sesión en Tunapuy" })).toBeVisible();

  // 2a. Solicita el código.
  await page.getByLabel("Teléfono (con código de país)").fill(phoneNumber);
  await page.getByRole("button", { name: "Enviar código" }).click();

  // 2b. El código llega por el proveedor dev (devCode visible solo en dev).
  const devCode = page.locator('[data-testid="otp-dev-code"]');
  await expect(devCode).toBeVisible();
  const code = (await devCode.textContent())?.trim() ?? "";
  expect(code).toMatch(/^\d{6}$/);

  // 2c. Verifica y crea la sesión (find-or-create del usuario).
  await page.getByLabel("Código de 6 dígitos").fill(code);
  await page.getByRole("button", { name: "Entrar" }).click();

  // 3. Vuelve al destino original (/vender) con el formulario de alta.
  await expect(page).toHaveURL(/\/vender$/);
  await expect(page.getByRole("heading", { name: "Publica un producto" })).toBeVisible();

  // 4. Publica un producto (server action createProduct). El formulario exige
  //    al menos una categoría (multi-categoría E3: 1–3).
  await page.getByLabel("Título *").fill(productTitle);
  await page.getByLabel("Precio (USD) *").fill("4.50");
  // Checkbox sr-only cubierto por el ícono Check del chip: force=true
  // (patrón estándar para inputs visualmente ocultos dentro de labels).
  await page.getByRole("checkbox", { name: /Comida/ }).check({ force: true });
  await page.getByRole("button", { name: "Publicar producto" }).click();

  // 5. Redirige al dashboard y el producto aparece en "Activas".
  await expect(page).toHaveURL(/\/mis-publicaciones/);
  await expect(
    page.getByRole("heading", { name: "Mis publicaciones" }),
  ).toBeVisible();
  const row = page.locator("li", { hasText: productTitle });
  await expect(row).toBeVisible();
  await expect(row.getByText("Activa")).toBeVisible();
  await expect(row.getByText("$4.50")).toBeVisible();
});

test("logout: /cuenta permite cerrar sesión y la ruta privada vuelve a pedir login", async ({
  page,
}) => {
  // Sesión previa del escenario anterior no existe (cada test es aislado), así
  // que volvemos a registrarnos con otro teléfono.
  const phone2 = `+584${(Date.now() + 1).toString().slice(-9)}`;
  await page.goto("/cuenta");
  await expect(page).toHaveURL(/\/login\?next=%2Fcuenta/);
  await page.getByLabel("Teléfono (con código de país)").fill(phone2);
  await page.getByRole("button", { name: "Enviar código" }).click();
  const devCode = page.locator('[data-testid="otp-dev-code"]');
  await expect(devCode).toBeVisible();
  await page.getByLabel("Código de 6 dígitos").fill((await devCode.textContent())!.trim());
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page).toHaveURL(/\/cuenta$/);
  // El nombre del usuario es "Usuario <últimos 4>"; el teléfono aparece en el
  // subtítulo y en la fila "Teléfono" (dos elementos, sin texto exacto).
  await expect(page.getByText(phone2, { exact: false }).first()).toBeVisible();

  // Cierre de sesión → vuelve a la home y /cuenta vuelve a exigir login.
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/cuenta");
  await expect(page).toHaveURL(/\/login\?next=%2Fcuenta/);
});
