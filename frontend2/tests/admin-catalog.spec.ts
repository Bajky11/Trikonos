import { expect, test } from "@playwright/test";
import type { Page, Locator, Request } from "@playwright/test";
import { mockAuthApi, mockStoreApi } from "./api-fixtures";
import { existingMotif, mockAdminCatalog } from "./admin-catalog-fixtures";

async function addClothing(page: Page, dialog: Locator) {
  await dialog.getByRole("button", { name: "Přidat oblečení" }).click();
  for (const [label, option] of [
    ["Typ oblečení", "Tričko"],
    ["Střih", "Pánské"],
  ]) {
    await dialog.getByRole("combobox", { name: label }).click();
    await page.getByRole("option", { name: option, exact: true }).click();
  }
}

test.beforeEach(async ({ page }) => {
  await mockStoreApi(page);
  await mockAuthApi(page, true);
});

test("keeps save visible on mobile and hides advanced settings by default", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await mockAdminCatalog(page, [existingMotif()]);
  await page.goto("/admin/produkty?motiv=" + existingMotif().id);
  const dialog = page.getByRole("dialog", { name: "Upravit motiv" });
  const save = dialog.getByRole("button", { name: "Uložit a zavřít" });
  await expect(save).toBeInViewport();
  await expect(dialog.getByRole("textbox", { name: "Slug URL" })).toBeHidden();
  await expect(dialog.getByRole("button", { name: "Přidat oblečení" })).toBeHidden();
  await dialog.getByText("Další nastavení", { exact: true }).scrollIntoViewIfNeeded();
  await expect(save).toBeInViewport();
  await expect(dialog).toBeInViewport({ ratio: 1 });
});

test("creates a draft, preserves its URL on edit, enables a variant and refreshes the storefront cache", async ({
  page,
}) => {
  await mockAdminCatalog(page);
  const writes: Request[] = [];
  page.on("request", (request) => {
    if (
      request.url().includes("/api/v1/admin/") &&
      ["POST", "PATCH", "PUT", "DELETE"].includes(request.method())
    )
      writes.push(request);
  });
  await page.goto("/");
  await expect(page.getByText("Zatím zde nejsou žádné motivy.").first()).toBeVisible();
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page
    .getByRole("navigation", { name: "Administrace" })
    .getByRole("link", { name: "Motivy" })
    .click();
  await page.getByRole("button", { name: "Přidat motiv", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Název motivu" }).fill("Jarní motiv");
  await expect(dialog.getByRole("textbox", { name: "Slug URL" })).toBeHidden();
  await dialog.getByText("Další nastavení", { exact: true }).click();
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
  await page.getByRole("link", { name: "Oblečení", exact: true }).click();
  const editor = page.getByRole("main");
  await addClothing(page, editor);
  await editor.getByRole("checkbox", { name: "Bílá", exact: true }).check();
  await editor.getByRole("checkbox", { name: "L", exact: true }).check();
  await editor.getByRole("checkbox", { name: "4 roky – 110 cm", exact: true }).check();
  await editor.getByRole("button", { name: "Uložit nabídku" }).click();
  await page.getByRole("dialog").last().getByRole("button", { name: "Potvrdit změny" }).click();
  await expect(editor.getByText("Společná nabídka byla uložena.")).toBeVisible();
  await page.getByRole("link", { name: "← Zpět na web" }).click();
  await page
    .getByRole("region", { name: "Výběr z kolekce" })
    .getByRole("link", { name: /Jarní motiv/ })
    .click();
  await expect(page).toHaveURL(/\/produkt\/jarni-kolekce$/);
  await page.getByText("Bílá", { exact: true }).click();
  await expect(page.getByRole("radio", { name: "4 roky – 110 cm" })).toBeVisible();
  await page.getByRole("radio", { name: "L", exact: true }).check();
  await expect(page.locator(".product-price")).toContainText("699,9 Kč");
  await page.getByRole("button", { name: "Přidat do košíku" }).click();
  await expect(page.getByRole("button", { name: "Košík, počet položek: 1" })).toBeVisible();
  expect(writes.length).toBe(3);
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

const white = {
  productTypeId: "00000000-0000-0000-0000-000000000001",
  cutId: "00000000-0000-0000-0000-000000000002",
  colorId: "00000000-0000-0000-0000-000000000003",
  size: "S",
};
const black = { ...white, colorId: "00000000-0000-0000-0000-000000000004", size: "M" };

test("saves only motif exclusions and labels ones missing from the shared offer", async ({
  page,
}) => {
  const { size: _size, ...whiteRule } = white;
  await mockAdminCatalog(page, [{ ...existingMotif(), garmentExclusions: [whiteRule] }], false, [
    black,
  ]);
  await page.goto("/admin/produkty");
  await page.getByRole("button", { name: "Upravit", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const shirt = dialog.getByRole("article", { name: "Tričko · Pánské" });
  const garment = shirt.getByRole("checkbox", { name: "Nabízet: Tričko · Pánské" });
  const size = shirt.getByRole("checkbox", { name: "M", exact: true });
  await expect(garment).toBeChecked();
  await expect(size).toBeHidden();
  await expect(dialog.getByText(/Bílá — Není v nabídce oblečení/)).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: "Bílá", exact: true })).toHaveCount(0);
  await shirt.getByText("S výjimkami", { exact: true }).click();
  await size.check();
  await garment.uncheck();
  await expect(size).toBeDisabled();
  const write = page.waitForRequest(
    (request) => request.method() === "PATCH" && request.url().includes("/admin/motifs/"),
  );
  await dialog.getByRole("button", { name: "Uložit a zavřít" }).click();
  expect((await write).postDataJSON().garmentExclusions).toEqual([
    whiteRule,
    { productTypeId: black.productTypeId, cutId: black.cutId, size: "M" },
    { productTypeId: black.productTypeId, cutId: black.cutId },
  ]);
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Upravit", exact: true }).click();
  await expect(garment).not.toBeChecked();
  await garment.check();
  await expect(size).toBeHidden();
  await shirt.getByText("S výjimkami", { exact: true }).click();
  await expect(size).toBeEnabled();
  await expect(size).toBeChecked();
});

test("preserves irregular shared combinations until explicitly filled", async ({ page }) => {
  await mockAdminCatalog(page, [], false, [white, black]);
  await page.goto("/admin/obleceni");
  const card = page.getByRole("article", { name: "Tričko · Pánské" });
  const save = page.getByRole("button", { name: "Uložit nabídku" });
  await expect(card.getByRole("checkbox", { name: "S", exact: true })).toBeChecked();
  await expect(save).toBeDisabled();
  await card.getByRole("button", { name: "Použít velikosti pro všechny barvy" }).click();
  const write = page.waitForRequest(
    (request) => request.method() === "PUT" && request.url().endsWith("/garment-offer"),
  );
  await save.click();
  await page.getByRole("button", { name: "Potvrdit změny" }).click();
  expect((await write).postDataJSON().variants).toHaveLength(4);
});

test("sets combinations on shared clothing cards and duplicates a motif using the shared offer", async ({
  page,
}) => {
  await mockAdminCatalog(page);
  for (const [path, values] of [
    [
      "product-types",
      [
        { id: "00000000-0000-0000-0000-000000000001", name: "Tričko" },
        { id: "00000000-0000-0000-0000-000000000005", name: "Mikina" },
      ],
    ],
    [
      "cuts",
      [
        { id: "00000000-0000-0000-0000-000000000002", name: "Pánské" },
        { id: "00000000-0000-0000-0000-000000000006", name: "Unisex" },
      ],
    ],
  ] as const)
    await page.route(new RegExp(`/api/v1/admin/${path}(?:\\?.*)?$`), (route) =>
      route.fulfill({
        json: {
          count: values.length,
          results: values.map((v) => ({ ...v, isActive: true })),
          next: null,
        },
      }),
    );
  await page.goto("/admin/obleceni");
  const editor = page.getByRole("main");
  await addClothing(page, editor);
  const shirt = editor.getByRole("article", { name: "Tričko · Pánské" });
  for (const name of ["Bílá", "Černá", "M", "L", "XL"])
    await shirt.getByRole("checkbox", { name, exact: true }).check();
  await editor.getByRole("button", { name: "Přidat oblečení" }).click();
  for (const [label, value] of [
    ["Typ oblečení", "Mikina"],
    ["Střih", "Unisex"],
  ]) {
    await editor
      .getByRole("article", { name: "Nové oblečení" })
      .getByRole("combobox", { name: label, exact: true })
      .click();
    await page.getByRole("option", { name: value, exact: true }).click();
  }
  const hoodie = editor.getByRole("article", { name: "Mikina · Unisex" });
  for (const name of ["Černá", "S"])
    await hoodie.getByRole("checkbox", { name, exact: true }).check();
  const saveOffer = page.waitForRequest(
    (r) => r.method() === "PUT" && r.url().endsWith("/garment-offer"),
  );
  await editor.getByRole("button", { name: "Uložit nabídku" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Potvrdit změny" }).click();
  expect((await saveOffer).postDataJSON().variants).toHaveLength(7);
  await expect(editor.getByText("Společná nabídka byla uložena.")).toBeVisible();
  await page.getByRole("link", { name: "Motivy", exact: true }).click();
  await page.getByRole("button", { name: "Přidat motiv" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Název motivu" }).fill("Kočka");
  await dialog.getByText("Další nastavení", { exact: true }).click();
  await dialog.getByRole("textbox", { name: "Slug URL" }).fill("kocka");
  await dialog.getByRole("textbox", { name: "Cena motivu (Kč)" }).fill("100");
  await dialog.getByRole("combobox", { name: "Kategorie" }).click();
  await page.getByRole("option", { name: "Retro", exact: true }).click();
  await expect(dialog.getByRole("link", { name: "společnou nabídku oblečení" })).toBeVisible();
  await dialog.getByRole("button", { name: "Uložit a zavřít" }).click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("row", { name: /Kočka/ })
    .getByRole("button", { name: "Upravit", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Fotografie hotového produktu (volitelné)", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Duplikovat motiv" }).click();
  await expect(dialog).toHaveCount(1);
  await expect(dialog.getByRole("heading", { name: "Duplikovat motiv" })).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Název motivu" })).toHaveValue("Kočka – kopie");
  await expect(dialog.getByRole("link", { name: "společnou nabídku oblečení" })).toBeVisible();
  await dialog.getByRole("textbox", { name: "Název motivu" }).fill("Pes");
  await dialog.getByText("Další nastavení", { exact: true }).click();
  await dialog.getByRole("textbox", { name: "Slug URL" }).fill("pes");
  await dialog.getByRole("button", { name: "Uložit a zavřít" }).click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("row", { name: /Pes/ })
    .getByRole("button", { name: "Upravit", exact: true })
    .click();
  await expect(dialog.getByRole("link", { name: "společnou nabídku oblečení" })).toBeVisible();
});

test("retries a partially saved new motif without creating it twice", async ({ page }) => {
  await mockAdminCatalog(page);
  let motifCreates = 0;
  let uploads = 0;
  await page.route(/\/api\/v1\/admin\/motifs(?:\?.*)?$/, (route) => {
    if (route.request().method() === "POST") motifCreates++;
    return route.fallback();
  });
  await page.route(/\/api\/v1\/admin\/motifs\/[^/]+\/images$/, (route) => {
    if (route.request().method() === "POST" && ++uploads === 1)
      return route.fulfill({ status: 500, json: { error: { message: "Chyba" } } });
    return route.fallback();
  });
  await page.goto("/admin/produkty");
  await page.getByRole("button", { name: "Přidat motiv" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Název motivu" }).fill("Kočka");
  await dialog.getByRole("textbox", { name: "Cena motivu (Kč)" }).fill("100");
  await dialog.getByRole("combobox", { name: "Kategorie" }).click();
  await page.getByRole("option", { name: "Retro", exact: true }).click();
  await dialog.getByLabel("Obrázek motivu").setInputFiles({
    name: "kocka.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6YQAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await dialog.getByRole("button", { name: "Uložit a zavřít" }).click();
  await expect(dialog.getByRole("alert")).toContainText("nový motiv se nezaloží");
  await dialog.getByRole("button", { name: "Uložit a zavřít" }).click();
  await expect(dialog).toHaveCount(0);
  expect(motifCreates).toBe(1);
  expect(uploads).toBe(2);
});
