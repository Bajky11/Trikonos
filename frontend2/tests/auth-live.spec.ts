import { expect, test } from "@playwright/test";

test.skip(
  !process.env.LIVE_AUTH_TESTS,
  "Run bun run test:e2e:auth with the local Docker seed account.",
);
test.use({ baseURL: "http://localhost:5173" });

test("local Docker login, session after reload and CSRF-protected logout", async ({ page }) => {
  // These are the documented dev-only seed values, never production credentials.
  const email = process.env.API_TEST_ADMIN_EMAIL ?? "admin@trikonos.cz";
  const password = process.env.API_TEST_ADMIN_PASSWORD ?? "change-me";
  await page.goto("/admin/objednavky");
  await expect(page).toHaveURL(/\/prihlaseni$/);
  await page.getByRole("textbox", { name: "E-mail", exact: true }).fill(email);
  await page.getByLabel(/^Heslo/).fill(password);
  const loginResponse = page.waitForResponse("http://localhost:8000/api/v1/admin/auth/login");
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  expect((await loginResponse).status()).toBe(200);
  await expect(page).toHaveURL(/\/admin\/objednavky$/);
  await expect(page.locator(".admin-app")).toBeVisible();
  await page.reload();
  await expect(page.locator(".admin-app")).toBeVisible();
  const logoutResponse = page.waitForResponse("http://localhost:8000/api/v1/admin/auth/logout");
  await page.getByRole("button", { name: "Odhlásit se" }).click();
  expect((await logoutResponse).status()).toBe(204);
  await expect(page).toHaveURL(/\/prihlaseni$/);
  await expect(page.locator(".admin-app")).toHaveCount(0);
});
