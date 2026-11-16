import { expect, test } from "@playwright/test";
import { mockAuthApi, mockStoreApi, options } from "./api-fixtures";
import { existingMotif, mockAdminCatalog } from "./admin-catalog-fixtures";
import { mockAdminLookups } from "./admin-lookups-fixtures";

test.beforeEach(async ({ page }) => {
  await mockStoreApi(page);
  await mockAuthApi(page, true);
  await mockAdminCatalog(page, [existingMotif()]);
  await mockAdminLookups(page);
});

test("paginates and searches real lookup data, handles duplicates and refreshes variant choices after CRUD", async ({
  page,
}) => {
  const tokens: (string | undefined)[] = [];
  page.on("request", (request) => {
    if (/\/admin\/(colors|cuts)/.test(request.url()) && request.method() !== "GET")
      tokens.push(request.headers()["x-csrftoken"]);
  });
  await page.goto("/admin/produkty");
  await page.getByRole("button", { name: "Varianty", exact: true }).click();
  await page.getByRole("dialog").getByRole("combobox", { name: "Barva", exact: true }).click();
  await expect(page.getByRole("option", { name: "Bílá", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").getByRole("button", { name: "Zavřít", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Administrace" })
    .getByRole("link", { name: "Číselníky" })
    .click();
  await page.getByRole("button", { name: "Go to page 2" }).click();
  await expect(
    page.getByRole("table", { name: "Barvy", exact: true }).getByRole("row"),
  ).toHaveCount(3);
  await page.getByRole("searchbox", { name: "Hledat v číselníku" }).fill("Bílá");
  await expect(page.getByRole("rowheader", { name: "Bílá", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "+ Přidat" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Název", exact: true }).fill("Bílá");
  await dialog.getByRole("button", { name: "Uložit", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("už existuje");
  await dialog.getByRole("button", { name: "Zrušit", exact: true }).click();
  await page.getByRole("button", { name: "Upravit: Bílá", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Název", exact: true }).fill("Sněhová");
  await dialog.getByRole("textbox", { name: "Barva HEX" }).fill("#aabbcc");
  await dialog.getByRole("button", { name: "Uložit", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("searchbox").fill("Sněhová");
  await expect(page.getByRole("row", { name: /Sněhová/ })).toContainText("#AABBCC");
  await page
    .getByRole("navigation", { name: "Administrace" })
    .getByRole("link", { name: "Produkty" })
    .click();
  await page.getByRole("searchbox").fill("");
  await page.getByRole("button", { name: "Varianty", exact: true }).click();
  await page.getByRole("dialog").getByRole("combobox", { name: "Barva", exact: true }).click();
  await expect(page.getByRole("option", { name: "Sněhová", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Bílá", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").getByRole("button", { name: "Zavřít", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Administrace" })
    .getByRole("link", { name: "Číselníky" })
    .click();
  await page.getByRole("searchbox").fill("");
  await page.getByRole("tab", { name: "Střihy", exact: true }).click();
  await page.getByRole("button", { name: "+ Přidat" }).click();
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Název", exact: true })
    .fill("Testovací střih");
  await page.getByRole("dialog").getByRole("button", { name: "Uložit", exact: true }).click();
  await expect(page.getByRole("rowheader", { name: "Testovací střih", exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Střihy", exact: true }).click();
  await page.getByRole("button", { name: "Smazat: Testovací střih", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("povolené kombinace");
  await page.getByRole("dialog").getByRole("button", { name: "Smazat", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("rowheader", { name: "Testovací střih", exact: true })).toHaveCount(
    0,
  );
  expect(tokens).toHaveLength(4);
  expect(tokens.every((token) => token === "bootstrap-token")).toBe(true);
  expect(
    await page.evaluate(() => localStorage.getItem("trikonos-react-dictionaries-v1")),
  ).toBeNull();
});

test("preserves category URLs, explains IN_USE, stores exact type prices and print dimensions, and keeps sizes read-only", async ({
  page,
}) => {
  await page.route("**/api/v1/motifs/puvodni-url", (route) =>
    route.fulfill({
      json: {
        id: existingMotif().id,
        name: "Používaný motiv",
        slug: "puvodni-url",
        price: 59900,
        currency: "CZK",
        images: [],
        description: "",
        category: { name: "Bitcoin", slug: "bitcoin" },
        variants: [
          {
            productTypeId: options.productTypes[0]!.id,
            cutId: options.cuts[0]!.id,
            colorId: options.colors[0]!.id,
            size: "L",
          },
        ],
      },
    }),
  );
  await page.goto("/produkt/puvodni-url");
  await page.getByText("Bílá", { exact: true }).click();
  await page.getByRole("radio", { name: "L", exact: true }).check();
  await expect(page.locator(".product-price")).toContainText("699 Kč");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Administrace" })
    .getByRole("link", { name: "Číselníky" })
    .click();
  await page.getByRole("tab", { name: "Kategorie", exact: true }).click();
  await page.getByRole("button", { name: "Smazat: Bitcoin", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Smazat", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Místo smazání ji deaktivujte",
  );
  await page.getByRole("dialog").getByRole("button", { name: "Zrušit", exact: true }).click();
  await page.getByRole("button", { name: "Upravit: Bitcoin", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Název", exact: true }).fill("Bitcoin kolekce");
  await dialog.getByRole("checkbox", { name: "Aktivní položka" }).uncheck();
  await dialog.getByRole("button", { name: "Uložit", exact: true }).click();
  await expect(page.getByRole("row", { name: /Bitcoin kolekce/ })).toContainText("bitcoin");
  await expect(page.getByRole("row", { name: /Bitcoin kolekce/ })).toContainText("Neaktivní");
  await page.getByRole("tab", { name: "Typy oblečení", exact: true }).click();
  await page.getByRole("button", { name: "Upravit: Tričko", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Příplatek typu (Kč)" }).fill("123,45");
  await dialog.getByRole("button", { name: "Uložit", exact: true }).click();
  await expect(page.getByRole("row", { name: /Tričko/ })).toContainText("123,45 Kč");
  await page.getByRole("tab", { name: "Tiskové plochy", exact: true }).click();
  await page.getByRole("button", { name: "+ Přidat" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Název", exact: true }).fill("Přední strana");
  await dialog.getByRole("combobox", { name: "Typ oblečení" }).click();
  await page.getByRole("option", { name: "Tričko", exact: true }).click();
  await dialog.getByRole("spinbutton", { name: "Šířka (mm)" }).fill("250");
  await dialog.getByRole("spinbutton", { name: "Výška (mm)" }).fill("300");
  await dialog.getByRole("button", { name: "Uložit", exact: true }).click();
  await expect(page.getByRole("row", { name: /Přední strana/ })).toContainText("250 × 300 mm");
  await expect(page.getByRole("row", { name: /Přední strana/ })).toContainText("Tričko");
  await page.getByRole("tab", { name: "Velikosti", exact: true }).click();
  await expect(
    page.getByText("Velikosti jsou pevný seznam backendu", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Přidat" })).toHaveCount(0);
  await page.getByRole("link", { name: "← Zpět na web" }).click();
  await page
    .getByRole("region", { name: "Výběr z kolekce" })
    .getByRole("link", { name: /Používaný motiv/ })
    .click();
  await page.getByText("Bílá", { exact: true }).click();
  await page.getByRole("radio", { name: "L", exact: true }).check();
  await expect(page.locator(".product-price")).toContainText("722,45 Kč");
});
