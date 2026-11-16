import { expect, test } from "@playwright/test";
import type { Request } from "@playwright/test";
import { mockStoreApi, mockAuthApi } from "./api-fixtures";

test.beforeEach(async ({ page }) => mockStoreApi(page));

test("home, default artwork, gallery, seasonal panels and FAQ", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Triko z hor, které má duši." })).toBeVisible();
  await expect(page.getByLabel("Pozadí hero")).toHaveCount(0);
  await page.getByRole("button", { name: "Prohlédnout vše" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Další fotografie" }).click();
  await expect(page.locator(".gallery-caption")).toContainText("2 / 9");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Vánoce Prohlédnout motivy" }).click();
  await expect(page.getByRole("button", { name: "Zpět na sezony" })).toBeVisible();
  await page.getByRole("button", { name: "Zpět na sezony" }).click();
  await page.getByRole("button", { name: "Odkud jsou motivy?" }).click();
  await expect(page.getByText("Vznikají s inspirací v horách")).toBeVisible();
  expect(errors).toEqual([]);
});

test("catalog filters, pagination, product options and persistent cart", async ({ page }) => {
  await page.goto("/tricka");
  await expect(page.locator(".catalog-grid .product-card")).toHaveCount(12);
  await expect(page.locator(".pagination-bar")).toContainText("z 14 motivů");
  await page.getByRole("button", { name: "Bitcoin", exact: true }).click();
  await expect(page).toHaveURL(/kategorie=bitcoin/);
  await expect(page.locator(".pagination-bar")).toContainText("z 13 motivů");
  await page.getByRole("button", { name: "Stránka 2", exact: true }).click();
  await expect(page.locator(".catalog-grid .product-card")).toHaveCount(1);
  await page.locator(".product-card-link").first().click();
  await expect(page).toHaveURL(/\/produkt\/motiv-13$/);
  await page.getByText("Bílá", { exact: true }).click();
  await expect(page.getByRole("radio", { name: "M", exact: true })).toHaveCount(0);
  await page.getByRole("radio", { name: "L", exact: true }).check();
  await expect(page.locator(".product-price")).toContainText("699 Kč");
  await page.getByLabel("Počet kusů", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Přidat do košíku" }).click();
  await expect(page.getByRole("button", { name: "Košík, počet položek: 2" })).toBeVisible();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("trikonos-cart-v2") ?? "[]"),
  );
  expect(stored[0]).toMatchObject({
    kind: "catalog",
    motifId: "10000000-0000-0000-0000-000000000013",
    unitPrice: 69900,
    size: "L",
    quantity: 2,
  });
  await page.reload();
  await expect(page.getByRole("button", { name: "Košík, počet položek: 2" })).toBeVisible();
  await page.goto("/produkt/neexistuje");
  await expect(page.getByRole("heading", { name: "Tohle tričko jsme nenašli." })).toBeVisible();
});

test("catalog failure can be retried and an empty catalog does not fall back to demo products", async ({
  page,
}) => {
  let failing = true;
  await page.route(/\/api\/v1\/motifs(?:\?.*)?$/, (route) =>
    route.fulfill(
      failing
        ? { status: 400, json: {} }
        : { json: { count: 0, results: [], next: null, previous: null } },
    ),
  );
  await page.goto("/tricka");
  await expect(page.getByRole("alert")).toContainText("Produkty se nepodařilo načíst.");
  failing = false;
  await page.getByRole("button", { name: "Zkusit znovu", exact: true }).click();
  await expect(page.getByText("Žádné motivy neodpovídají výběru.")).toBeVisible();
  await expect(page.locator(".product-card")).toHaveCount(0);
});

test("custom print does not invent options when no active print area exists", async ({ page }) => {
  await page.goto("/#vlastni-potisk");
  const section = page.locator("#vlastni-potisk");
  await expect(
    section.getByText("Vlastní potisk zatím není dostupný.", { exact: false }),
  ).toBeVisible();
  await expect(
    section.getByRole("button", { name: "Přidat návrh do košíku k nacenění" }),
  ).toBeDisabled();
});

test("admin search and navigation across all routes", async ({ page }) => {
  await mockAuthApi(page, true);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Přehled", exact: true })).toBeVisible();
  await page.getByRole("searchbox").fill("Petra");
  await expect(page.getByText("Žádná objednávka neodpovídá hledání.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Jan Novák" })).toHaveCount(0);
  await page.getByRole("searchbox").fill("nic-takoveho");
  await expect(page.getByRole("status")).toContainText("Žádná objednávka");
  for (const [route, heading] of [
    ["objednavky", "Objednávky"],
    ["produkty", "Produkty"],
    ["klienti", "Klienti"],
    ["sezony", "Sezóny"],
    ["ciselniky", "Číselníky"],
  ]) {
    await page.goto(`/admin/${route}`);
    await expect(page.locator(".admin-header h1")).toHaveText(heading!);
  }
});

test("login sends credentials only to the auth endpoint and does not persist them", async ({
  page,
}) => {
  const apiCalls: Request[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith("http://localhost:8000/")) apiCalls.push(request);
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await page.getByRole("textbox", { name: "E-mail", exact: true }).fill("admin@example.com");
  await page.getByLabel(/^Heslo/).fill("not-stored");
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  await expect(page).toHaveURL("/admin");
  for (const request of apiCalls) {
    if (request.url().endsWith("/admin/auth/login")) {
      expect(request.method()).toBe("POST");
      expect(request.postDataJSON()).toEqual({
        email: "admin@example.com",
        password: "not-stored",
      });
      expect(request.headers()["x-csrftoken"]).toBe("bootstrap-token");
    } else {
      expect(request.method()).toBe("GET");
      expect(request.postData()).toBeNull();
    }
  }
  expect(apiCalls.some((request) => request.url().endsWith("/admin/auth/login"))).toBe(true);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain("not-stored");
});
