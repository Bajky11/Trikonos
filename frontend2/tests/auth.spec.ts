import { expect, test } from "@playwright/test";
import { admin, mockAuthApi, mockStoreApi } from "./api-fixtures";

test.beforeEach(async ({ page }) => mockStoreApi(page));

test("protects direct admin navigation, restores the target after login, persists session and logs out", async ({
  page,
}) => {
  await page.goto("/admin/objednavky?stav=nove");
  await expect(page).toHaveURL(/\/prihlaseni$/);
  await expect(page.locator(".admin-app")).toHaveCount(0);
  await page.getByRole("textbox", { name: "E-mail", exact: true }).fill(admin.email);
  await page.getByLabel(/^Heslo/).fill("test-password");
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  await expect(page).toHaveURL(/\/admin\/objednavky\?stav=nove$/);
  await expect(page.getByText(admin.name, { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Objednávky", exact: true, level: 1 }),
  ).toBeVisible();
  const logout = page.waitForRequest("**/api/v1/admin/auth/logout");
  await page.getByRole("button", { name: "Odhlásit se" }).click();
  expect((await logout).headers()["x-csrftoken"]).toBe("bootstrap-token");
  await expect(page).toHaveURL(/\/prihlaseni$/);
  await expect(page.locator(".admin-app")).toHaveCount(0);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/prihlaseni$/);
});

for (const [status, message] of [
  [401, "Nesprávný e-mail nebo heslo."],
  [429, "Příliš mnoho pokusů."],
] as const) {
  test(`shows login error ${status} without exposing admin or retaining the password`, async ({
    page,
  }) => {
    await page.route("**/api/v1/admin/auth/login", (route) => route.fulfill({ status, json: {} }));
    await page.goto("/prihlaseni");
    await page.getByRole("textbox", { name: "E-mail", exact: true }).fill(admin.email);
    await page.getByLabel(/^Heslo/).fill("wrong-password");
    await page.getByRole("button", { name: "Přihlásit se" }).click();
    await expect(page.getByRole("alert")).toContainText(message);
    await expect(page.getByLabel(/^Heslo/)).toHaveValue("");
    await expect(page.locator(".admin-app")).toHaveCount(0);
  });
}

test("does not send credentials when CSRF bootstrap fails", async ({ page }) => {
  await page.route("**/api/v1/admin/auth/csrf", (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  const loginRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/admin/auth/login")) loginRequests.push(request.url());
  });
  await page.goto("/prihlaseni");
  await page.getByRole("textbox", { name: "E-mail", exact: true }).fill(admin.email);
  await page.getByLabel(/^Heslo/).fill("test-password");
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  await expect(page.getByRole("alert")).toContainText("Přihlášení se nezdařilo.");
  expect(loginRequests).toEqual([]);
});

test("does not misinterpret a session server error as an anonymous user", async ({ page }) => {
  let failing = true;
  await page.route("**/api/v1/admin/auth/me", (route) =>
    route.fulfill(failing ? { status: 503, json: {} } : { json: admin }),
  );
  await page.goto("/admin");
  await expect(page.getByRole("alert")).toContainText("Přihlášení se nepodařilo ověřit.");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.locator(".admin-app")).toHaveCount(0);
  failing = false;
  await page.getByRole("button", { name: "Zkusit znovu", exact: true }).click();
  await expect(page.locator(".admin-app")).toBeVisible();
});

test("session polling removes admin access after expiration", async ({ page }) => {
  await page.clock.install();
  const auth = await mockAuthApi(page, true);
  await page.goto("/admin");
  await expect(page.locator(".admin-app")).toBeVisible();
  auth.setAuthenticated(false);
  await page.clock.fastForward(60_000);
  await expect(page).toHaveURL(/\/prihlaseni$/);
  await expect(page.locator(".admin-app")).toHaveCount(0);
});

test("a CSRF-rejected logout is not presented as successful", async ({ page }) => {
  await mockAuthApi(page, true);
  await page.route("**/api/v1/admin/auth/logout", (route) =>
    route.fulfill({ status: 403, json: { error: { code: "PERMISSION_DENIED" } } }),
  );
  await page.goto("/admin");
  await page.getByRole("button", { name: "Odhlásit se" }).click();
  await expect(
    page
      .locator(".admin-content")
      .getByRole("alert")
      .filter({ hasText: "Odhlášení se nezdařilo." }),
  ).toBeVisible();
  await expect(page.locator(".admin-app")).toBeVisible();
});
