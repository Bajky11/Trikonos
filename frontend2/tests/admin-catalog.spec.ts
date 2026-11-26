import { expect, test } from "@playwright/test";
import type { Page, Locator, Request } from "@playwright/test";
import { mockAuthApi, mockStoreApi, options } from "./api-fixtures";
import { existingMotif, mockAdminCatalog } from "./admin-catalog-fixtures";

async function addClothing(page: Page, editor: Locator) {
  await page.locator(".admin-header").getByRole("button", { name: "Přidat oblečení" }).click();
  for (const [label, option] of [
    ["Typ oblečení", "Tričko"],
    ["Střih", "Pánské"],
  ]) {
    await editor.getByRole("combobox", { name: label }).click();
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
  const status = page.getByRole("combobox", { name: "Stav" });
  await expect(status).toHaveText("Zveřejněné");
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
  const row = page.getByRole("row", { name: /Jarní motiv/ });
  await expect(row).toHaveCount(0);
  await status.click();
  await page.getByRole("option", { name: "Koncepty" }).click();
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
  await page.locator(".admin-header").getByRole("button", { name: "Uložit nabídku" }).click();
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
  const row = page.getByRole("row", { name: /Používaný motiv/ });
  await expect(row).toHaveCount(0);
  await page.getByRole("combobox", { name: "Stav" }).click();
  await page.getByRole("option", { name: "Všechny motivy" }).click();
  await expect(row).toContainText("Koncept");
});

const white = {
  productTypeId: "00000000-0000-0000-0000-000000000001",
  cutId: "00000000-0000-0000-0000-000000000002",
  colorId: "00000000-0000-0000-0000-000000000003",
  size: "S",
};
const black = { ...white, colorId: "00000000-0000-0000-0000-000000000004", size: "M" };

test("fits expanded garment exclusions inside the motif dialog on desktop and mobile", async ({
  page,
}) => {
  await mockAdminCatalog(page, [existingMotif()], false, [
    white,
    black,
    ...["L", "XL", "XXL", "110"].map((size) => ({ ...white, size })),
  ]);
  await page.goto("/admin/produkty");
  await page.getByRole("button", { name: "Upravit", exact: true }).click();
  const shirt = page.getByRole("dialog").getByRole("article", { name: "Tričko · Pánské" });
  await shirt.getByText("Výjimky", { exact: true }).click();
  const colors = shirt.getByRole("group", { name: "Vypnout barvy" });
  const sizes = shirt.getByRole("group", { name: "Vypnout velikosti" });
  await expect(colors.getByRole("checkbox")).toHaveCount(2);
  await expect(sizes.getByRole("checkbox")).toHaveCount(6);

  const checkLayout = async (singleColumn: boolean) => {
    const layout = await sizes.evaluate((group) => ({
      fits: group.scrollWidth <= group.clientWidth,
      columns: new Set(
        [...group.querySelectorAll("label")].map((label) => label.getBoundingClientRect().left),
      ).size,
    }));
    expect(layout.fits).toBe(true);
    if (singleColumn) expect(layout.columns).toBe(1);
    else expect(layout.columns).toBeGreaterThan(1);
  };

  await checkLayout(false);
  await page.setViewportSize({ width: 375, height: 812 });
  await checkLayout(true);
  await sizes.getByRole("checkbox", { name: "XL", exact: true }).check();
});

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

test("shows the mockup immediately and bulk edits colors and sizes independently", async ({
  page,
}) => {
  await mockAdminCatalog(page, [], false, [white]);
  await page.goto("/admin/obleceni");
  const card = page.getByRole("article", { name: "Tričko · Pánské" });
  await expect(card.getByRole("heading", { name: "Podklad náhledu" })).toBeVisible();
  const preview = card.getByRole("img", { name: "Podklad oblečení" });
  const dropzone = card.getByRole("button", { name: /Vybrat PNG/ });
  await expect(preview).toBeVisible();
  await expect(dropzone).toBeVisible();
  const previewBox = await preview.boundingBox();
  const dropzoneBox = await dropzone.boundingBox();
  expect(Math.abs(previewBox!.y - dropzoneBox!.y)).toBeLessThanOrEqual(1);

  const colors = card.getByRole("group", { name: "Barvy", exact: true });
  const sizes = card.getByRole("group", { name: "Velikosti", exact: true });
  await expect(sizes.getByRole("checkbox", { name: "Jednotná", exact: true })).toBeVisible();
  const sizeOptions = sizes.getByRole("checkbox");
  await expect(sizeOptions.nth(2)).toBeVisible();
  const firstSizes = await sizeOptions.evaluateAll((options) =>
    options.slice(0, 3).map((option) => {
      const { x, y } = option.getBoundingClientRect();
      return { x, y };
    }),
  );
  expect(firstSizes[1].x).toBe(firstSizes[0].x);
  expect(firstSizes[2].x).toBe(firstSizes[0].x);
  expect(firstSizes[1].y).toBeGreaterThan(firstSizes[0].y);
  expect(firstSizes[2].y).toBeGreaterThan(firstSizes[1].y);
  await colors.getByRole("button", { name: "Vybrat vše" }).click();
  await expect(colors.getByRole("checkbox", { checked: false })).toHaveCount(0);
  await expect(sizes.getByRole("checkbox", { checked: true })).toHaveCount(1);
  await sizes.getByRole("button", { name: "Vybrat vše" }).click();
  await expect(sizes.getByRole("checkbox", { checked: false })).toHaveCount(0);
  await sizes.getByRole("button", { name: "Odstranit vše" }).click();
  await expect(sizes.getByRole("checkbox", { checked: true })).toHaveCount(0);
  await expect(colors.getByRole("checkbox", { checked: false })).toHaveCount(0);
  await colors.getByRole("button", { name: "Odstranit vše" }).click();
  await expect(colors.getByRole("checkbox", { checked: true })).toHaveCount(0);
  await expect(card).toBeVisible();
});

test("selects a mockup PNG through the picker or by dropping it", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockAdminCatalog(page, [], false, [white]);
  let customMockup = false;
  await page.route("**/api/v1/catalog/options", (route) =>
    route.fulfill({
      json: {
        ...options,
        garmentMockups: customMockup
          ? [{ productTypeId: white.productTypeId, cutId: white.cutId, url: "/assets/tshirt.png" }]
          : [],
      },
    }),
  );
  await page.route(
    `**/api/v1/admin/garment-mockups/${white.productTypeId}/${white.cutId}`,
    (route) => {
      customMockup = route.request().method() === "PUT";
      return route.fulfill({ status: 204 });
    },
  );
  await page.goto("/admin/obleceni");
  const card = page.getByRole("article", { name: "Tričko · Pánské" });
  const save = card.getByRole("button", { name: "Uložit podklad" });
  const header = page.locator(".admin-header");
  await expect(header.getByRole("button", { name: "Přidat oblečení" })).toBeVisible();
  await page.evaluate(() =>
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }),
  );
  await expect.poll(() => header.evaluate((node) => node.getBoundingClientRect().top)).toBe(0);
  await expect(header.getByRole("button", { name: "Uložit nabídku" })).toBeInViewport();
  const reset = card.getByRole("button", { name: "Resetovat", exact: true });
  await expect(save).toHaveCount(0);
  await expect(reset).toHaveCount(0);
  const previewHeader = card.locator(".garment-mockup-header");
  const headerHeight = () =>
    previewHeader.evaluate((element) => element.getBoundingClientRect().height);
  const initialHeaderHeight = await headerHeight();
  const chooser = page.waitForEvent("filechooser");
  await card.getByRole("button", { name: /Vybrat PNG/ }).click();
  await (
    await chooser
  ).setFiles({ name: "tricko.png", mimeType: "image/png", buffer: Buffer.from([]) });
  await expect(card.getByText("Vybraný soubor: tricko.png")).toBeVisible();
  await expect(save).toBeEnabled();
  await expect(reset).toHaveCount(0);

  const drop = async (name: string, type: string) => {
    const dataTransfer = await page.evaluateHandle(
      ({ name, type }) => {
        const transfer = new DataTransfer();
        transfer.items.add(new File([], name, { type }));
        return transfer;
      },
      { name, type },
    );
    await card
      .getByRole("button", { name: /Vybrat (jiné )?PNG/ })
      .dispatchEvent("drop", { dataTransfer });
    await dataTransfer.dispose();
  };
  await drop("tricko.jpg", "image/jpeg");
  await expect(card.getByRole("alert")).toHaveText("Vyberte jeden soubor ve formátu PNG.");
  await expect(save).toHaveCount(0);
  await drop("novy-podklad.png", "image/png");
  await expect(card.getByText("Vybraný soubor: novy-podklad.png")).toBeVisible();
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByRole("alert").filter({ hasText: "Podklad byl uložen." })).toBeVisible();
  await expect(card.getByText("Podklad byl uložen.")).toHaveCount(0);
  await expect(reset).toBeVisible();
  expect(await headerHeight()).toBe(initialHeaderHeight);
  await reset.click();
  await expect(card.getByText("Výchozí tričko", { exact: true })).toBeVisible();
  await expect(reset).toHaveCount(0);
});

test("preserves irregular shared combinations until explicitly filled", async ({ page }) => {
  await mockAdminCatalog(page, [], false, [white, black]);
  await page.goto("/admin/obleceni");
  const card = page.getByRole("article", { name: "Tričko · Pánské" });
  const save = page.locator(".admin-header").getByRole("button", { name: "Uložit nabídku" });
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
  await page.locator(".admin-header").getByRole("button", { name: "Přidat oblečení" }).click();
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
  await page.locator(".admin-header").getByRole("button", { name: "Uložit nabídku" }).click();
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
  await page.getByRole("combobox", { name: "Stav" }).click();
  await page.getByRole("option", { name: "Koncepty" }).click();
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
