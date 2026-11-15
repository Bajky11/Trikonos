import { expect, test } from "@playwright/test";
import { config, mockStoreApi, options } from "./api-fixtures";

test.beforeEach(async ({ page }) => mockStoreApi(page));

test("generated hooks load config and options directly and reuse the cache on navigation", async ({
  page,
}) => {
  const calls: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/v1\/(config|catalog\/options)$/.test(request.url())) calls.push(request.url());
  });
  const optionsResponse = page.waitForResponse("**/api/v1/catalog/options");
  await page.goto("/");
  await optionsResponse;
  await expect(page.getByRole("link", { name: config.contactEmail })).toHaveAttribute(
    "href",
    `mailto:${config.contactEmail}`,
  );
  await expect(page.getByRole("link", { name: "Trikonoš, úvodní stránka" })).toBeVisible();
  // StrictMode may cancel and repeat the initial request in development.
  const initialCalls = calls.length;
  await page.locator("footer").getByRole("link", { name: "Kolekce triček" }).click();
  await expect(page).toHaveURL(/\/tricka$/);
  await expect(page.getByRole("link", { name: config.contactEmail })).toBeVisible();
  expect(calls.length).toBe(initialCalls);
  expect([...new Set(calls)].sort()).toEqual([
    "http://localhost:8000/api/v1/catalog/options",
    "http://localhost:8000/api/v1/config",
  ]);
});

test("shows loading instead of a fake contact and handles empty backend values", async ({
  page,
}) => {
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/config", async (route) => {
    await ready;
    await route.fulfill({ json: { ...config, contactEmail: "" } });
  });
  await page.goto("/");
  await expect(page.getByText("Načítání kontaktních údajů…")).toBeVisible();
  await expect(page.locator("footer a[href^='mailto:']")).toHaveCount(0);
  release();
  await expect(page.getByText("Kontaktní údaje zatím nejsou vyplněné.")).toBeVisible();
});

test("failed config is visible and can be retried", async ({ page }) => {
  let failing = true;
  await page.route("**/api/v1/config", (route) => {
    return failing
      ? route.fulfill({ status: 400, json: { error: { message: "Invalid" } } })
      : route.fulfill({ json: config });
  });
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("Konfiguraci obchodu se nepodařilo načíst.");
  failing = false;
  await page.getByRole("button", { name: "Zkusit načíst znovu" }).click();
  await expect(page.getByRole("link", { name: config.contactEmail })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("failed options can be recovered without refetching successful config", async ({ page }) => {
  let optionsCalls = 0;
  let configCalls = 0;
  let failing = true;
  await page.route("**/api/v1/config", (route) => {
    configCalls++;
    return route.fulfill({ json: config });
  });
  await page.route("**/api/v1/catalog/options", (route) => {
    optionsCalls++;
    return failing ? route.fulfill({ status: 400, json: {} }) : route.fulfill({ json: options });
  });
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("Katalogové číselníky se nepodařilo načíst.");
  const initialOptionsCalls = optionsCalls;
  const initialConfigCalls = configCalls;
  failing = false;
  await page.getByRole("button", { name: "Zkusit načíst znovu" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(optionsCalls).toBe(initialOptionsCalls + 1);
  expect(configCalls).toBe(initialConfigCalls);
});
