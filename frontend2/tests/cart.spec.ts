import { expect, test } from "@playwright/test";
import { mockStoreApi, options, motifs } from "./api-fixtures";
import type { CartValidate } from "../src/api/generated/models";

test.beforeEach(async ({ page }) => {
  await mockStoreApi(page);
});

test("opens the cart, accepts server prices, edits quantity, persists and removes catalog items", async ({
  page,
}) => {
  const requests: CartValidate[] = [];
  await page.route("**/api/v1/cart/validate", (route) => {
    const body = route.request().postDataJSON() as CartValidate;
    requests.push(body);
    expect(route.request().headers()["x-csrftoken"]).toBe("bootstrap-token");
    const subtotal = body.items.reduce((sum, item) => sum + item.quantity * 79900, 0);
    return route.fulfill({
      json: {
        items: body.items.map((item) => ({
          valid: true,
          errors: [],
          itemLabel: "Motiv 1 / Tričko / Pánské / Bílá / L",
          unitPrice: 79900,
          lineTotal: 79900 * item.quantity,
        })),
        subtotal,
        shippingCost: null,
        total: null,
        requiresQuote: false,
      },
    });
  });
  await page.goto("/produkt/motiv-1");
  await page.getByText("Bílá", { exact: true }).click();
  await page.getByRole("radio", { name: "L", exact: true }).check();
  await page.getByRole("button", { name: "Přidat do košíku" }).click();
  await page.getByRole("button", { name: "Košík, počet položek: 1" }).click();
  await expect(page).toHaveURL(/\/kosik$/);
  await expect(page.getByText("Cena se změnila z 699 Kč na 799 Kč za kus.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Souhrn košíku" })).toContainText("799 Kč");
  await page.getByRole("button", { name: "Přijmout aktuální cenu" }).click();
  await expect(page.getByRole("button", { name: "Přijmout aktuální cenu" })).toHaveCount(0);
  await page.getByRole("button", { name: "Zvýšit počet kusů" }).click({ clickCount: 2, delay: 80 });
  await expect(page.getByRole("region", { name: "Souhrn košíku" })).toContainText("2 397 Kč");
  await page.reload();
  await expect(page.getByRole("status", { name: "Počet kusů" })).toHaveText("3");
  await expect(page.getByRole("region", { name: "Souhrn košíku" })).toContainText("2 397 Kč");
  expect(requests.length).toBeGreaterThanOrEqual(3);
  for (const body of requests) expect(body.items[0]).not.toHaveProperty("unitPrice");
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error("quota");
    };
  });
  await page.getByRole("button", { name: "Odebrat položku" }).click();
  await expect(
    page.getByText("Změnu košíku se nepodařilo uložit.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Košík, počet položek: 3" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Odebrat položku" }).click();
  await expect(page.getByText("Košík je prázdný.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Košík je prázdný.", { exact: true })).toBeVisible();
});

test("does not present failed or unavailable items as priced, and keeps custom drafts out of validation", async ({
  page,
}) => {
  const catalog = {
    kind: "catalog",
    motifId: motifs[0]!.id,
    productTypeId: options.productTypes[0]!.id,
    cutId: options.cuts[0]!.id,
    colorId: options.colors[0]!.id,
    size: "L",
    name: "Platný motiv",
    quantity: 1,
    unitPrice: 69900,
  };
  await page.addInitScript(
    (items) => {
      if (!localStorage.getItem("trikonos-cart-v2"))
        localStorage.setItem("trikonos-cart-v2", JSON.stringify(items));
    },
    [
      catalog,
      {
        id: "custom-print",
        name: "Můj návrh",
        type: "male",
        color: "Bílá",
        size: "M",
        quantity: 1,
        price: 999,
      },
      { ...catalog, motifId: motifs[1]!.id, name: "Nedostupný motiv" },
    ],
  );
  let mode = "unavailable-server";
  await page.route("**/api/v1/cart/validate", (route) => {
    const body = route.request().postDataJSON() as CartValidate;
    expect(body.items.every((item) => item.isCustom === false)).toBe(true);
    if (mode === "unavailable-server") return route.fulfill({ status: 503, json: {} });
    if (mode === "deleted")
      return route.fulfill({ status: 400, json: { error: { code: "VALIDATION_ERROR" } } });
    const items = body.items.map((item) =>
      item.motifId === motifs[0]!.id
        ? { valid: true, errors: [], itemLabel: "Platný motiv", unitPrice: 69900, lineTotal: 69900 }
        : {
            valid: false,
            errors: ["Tato kombinace již není dostupná."],
            itemLabel: null,
            unitPrice: null,
            lineTotal: null,
          },
    );
    return route.fulfill({
      json: {
        items,
        subtotal: items.every((item) => item.valid) ? 69900 : null,
        shippingCost: null,
        total: null,
        requiresQuote: false,
      },
    });
  });
  await page.goto("/kosik");
  await expect(page.getByRole("alert")).toContainText("Košík se nepodařilo ověřit");
  await expect(page.getByRole("region", { name: "Souhrn košíku" })).toContainText("není stanoven");
  mode = "mixed";
  await page.getByRole("button", { name: "Znovu ověřit katalogové položky" }).click();
  await expect(
    page.getByRole("region", { name: "Nedostupný motiv", exact: true }).getByRole("alert"),
  ).toContainText("Tato kombinace již není dostupná");
  await expect(page.getByRole("region", { name: "Můj návrh", exact: true })).toContainText(
    "Cena není potvrzená",
  );
  mode = "deleted";
  await page.getByRole("button", { name: "Znovu ověřit katalogové položky" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Některá položka nebo její varianta už nemusí existovat",
  );
  await expect(page.getByText("Aktuální cena:", { exact: false })).toHaveCount(0);
  mode = "mixed";
  await page
    .getByRole("region", { name: "Nedostupný motiv", exact: true })
    .getByRole("button", { name: "Odebrat položku" })
    .click();
  await expect(page.getByRole("region", { name: "Souhrn košíku" })).toContainText("699 Kč");
  await expect(page.getByRole("region", { name: "Souhrn košíku" })).toContainText(
    "Celková cena objednávky zatím není stanovena",
  );
});
