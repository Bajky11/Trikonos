import { expect, test } from "@playwright/test";
import type { Request } from "@playwright/test";
import { mockAuthApi, mockStoreApi } from "./api-fixtures";
import { existingMotif, mockAdminCatalog } from "./admin-catalog-fixtures";

test.beforeEach(async ({ page }) => {
  await mockStoreApi(page);
  await mockAuthApi(page, true);
});

test("creates a draft, preserves its URL on edit, enables a variant and refreshes the storefront cache", async ({
  page,
}) => {
  await mockAdminCatalog(page);
  const writes: Request[] = [];
  page.on("request", (request) => {
    if (
      request.url().includes("/api/v1/admin/") &&
      ["POST", "PATCH", "DELETE"].includes(request.method())
    )
      writes.push(request);
  });
  await page.goto("/");
  await expect(page.getByText("Zatím zde nejsou žádné motivy.").first()).toBeVisible();
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page
    .getByRole("navigation", { name: "Administrace" })
    .getByRole("link", { name: "Produkty" })
    .click();
  await page.getByRole("button", { name: "Přidat motiv", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Název motivu" }).fill("Jarní motiv");
  await dialog.getByRole("textbox", { name: "Slug URL" }).fill("jarni-kolekce");
  await dialog.getByRole("textbox", { name: "Cena motivu (Kč)" }).fill("499,90");
  await dialog.getByRole("combobox", { name: "Kategorie" }).click();
  await page.getByRole("option", { name: "Retro", exact: true }).click();
  await dialog.getByRole("button", { name: "Uložit a zavřít" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  let row = page.getByRole("row", { name: /Jarní motiv/ });
  await expect(row).toContainText("Koncept");
  await row.getByRole("button", { name: "Upravit", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Cena motivu (Kč)" }).fill("599,90");
  await dialog.getByRole("checkbox", { name: "Zobrazovat motiv v katalogu" }).check();
  await dialog.getByRole("button", { name: "Uložit a zavřít" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  row = page.getByRole("row", { name: /Jarní motiv/ });
  await row.getByRole("button", { name: "Varianty", exact: true }).click();
  dialog = page.getByRole("dialog");
  for (const [label, option] of [
    ["Typ oblečení", "Tričko"],
    ["Střih", "Pánské"],
    ["Barva", "Bílá"],
    ["Velikost", "L"],
  ]) {
    await dialog.getByRole("combobox", { name: label }).click();
    await page.getByRole("option", { name: option, exact: true }).click();
  }
  await dialog.getByRole("button", { name: "Uložit variantu", exact: true }).click();
  await expect(dialog.getByRole("table", { name: "Povolené kombinace" })).toContainText("Bílá");
  await dialog.getByRole("button", { name: "Uložit variantu", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Tato kombinace již existuje.");
  await dialog.getByRole("button", { name: "Zavřít", exact: true }).click();
  await page.getByRole("link", { name: "← Zpět na web" }).click();
  await page
    .getByRole("region", { name: "Výběr z kolekce" })
    .getByRole("link", { name: /Jarní motiv/ })
    .click();
  await expect(page).toHaveURL(/\/produkt\/jarni-kolekce$/);
  await page.getByText("Bílá", { exact: true }).click();
  await page.getByRole("radio", { name: "L", exact: true }).check();
  await expect(page.locator(".product-price")).toContainText("699,9 Kč");
  await page.getByRole("button", { name: "Přidat do košíku" }).click();
  await expect(page.getByRole("button", { name: "Košík, počet položek: 1" })).toBeVisible();
  expect(writes.length).toBe(4);
  for (const request of writes) expect(request.headers()["x-csrftoken"]).toBe("bootstrap-token");
});

test("does not pretend an in-use motif was deleted and permits deactivation instead", async ({
  page,
}) => {
  await mockAdminCatalog(page, [existingMotif()], true);
  await page.goto("/admin/produkty");
  await page
    .getByRole("row", { name: /Používaný motiv/ })
    .getByRole("button", { name: "Smazat", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Smazat motiv", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Místo smazání jej deaktivujte.");
  await dialog.getByRole("button", { name: "Zrušit", exact: true }).click();
  await page
    .getByRole("row", { name: /Používaný motiv/ })
    .getByRole("button", { name: "Upravit", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox", { name: "Zobrazovat motiv v katalogu" }).uncheck();
  await dialog.getByRole("button", { name: "Uložit a zavřít" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("row", { name: /Používaný motiv/ })).toContainText("Koncept");
});
