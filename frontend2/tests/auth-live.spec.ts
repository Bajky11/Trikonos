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
  const motifsResponse = page.waitForResponse(
    (response) =>
      response.url().startsWith("http://localhost:8000/api/v1/admin/motifs?") &&
      response.request().method() === "GET",
  );
  await page
    .getByRole("navigation", { name: "Administrace" })
    .getByRole("link", { name: "Produkty" })
    .click();
  const motifs = await motifsResponse;
  expect(motifs.status()).toBe(200);
  const data = (await motifs.json()) as { count: number };
  await expect(page.getByRole("table", { name: "Motivy", exact: true })).toBeVisible();
  if (data.count > 0) {
    await page.getByRole("button", { name: "Upravit", exact: true }).first().click();
    await expect(
      page.getByRole("dialog").getByRole("textbox", { name: "Název motivu" }),
    ).not.toHaveValue("");
    await page.getByRole("dialog").getByRole("button", { name: "Zavřít", exact: true }).click();
    await page.getByRole("button", { name: "Varianty", exact: true }).first().click();
    await expect(
      page.getByRole("dialog").getByRole("table", { name: "Povolené kombinace" }),
    ).toBeVisible();
    await expect(
      page.getByRole("dialog").getByRole("combobox", { name: "Typ oblečení" }),
    ).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Zavřít", exact: true }).click();
  }
  if (data.count > 0) {
    await page.getByRole("button", { name: "Fotografie", exact: true }).first().click();
    await expect(page.getByRole("dialog").getByLabel("Soubor fotografie")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Zavřít", exact: true }).click();
  }
  const logoutResponse = page.waitForResponse("http://localhost:8000/api/v1/admin/auth/logout");
  await page.getByRole("button", { name: "Odhlásit se" }).click();
  expect((await logoutResponse).status()).toBe(204);
  await expect(page).toHaveURL(/\/prihlaseni$/);
  await expect(page.locator(".admin-app")).toHaveCount(0);
});
