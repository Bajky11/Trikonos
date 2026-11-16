import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { mockStoreApi } from "./api-fixtures";
import { carrierId, checkoutCatalog, checkoutCustom, mockCheckout } from "./checkout-fixtures";

async function fillCustomer(page: Page) {
  await page.getByRole("textbox", { name: "Jméno", exact: true }).fill("Jana");
  await page.getByRole("textbox", { name: "Příjmení", exact: true }).fill("Nováková");
  await page.getByRole("textbox", { name: "E-mail", exact: true }).fill("jana@example.cz");
  await page.getByRole("textbox", { name: "Telefon", exact: true }).fill("777123456");
  await page.getByRole("textbox", { name: "Ulice a číslo domu", exact: true }).fill("Horní 12");
  await page.getByRole("textbox", { name: "Obec", exact: true }).fill("Vrchlabí");
  await page.getByRole("textbox", { name: "PSČ", exact: true }).fill("543 01");
}
async function choose(page: Page, label: string, name: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name, exact: true }).click();
}

test("blocks missing terms, reviews changed prices and recovers one order after a lost result and reload", async ({
  page,
}) => {
  await mockStoreApi(page);
  const state = await mockCheckout(page);
  state.termsReady = false;
  await page.addInitScript((item) => {
    if (!localStorage.getItem("trikonos-cart-v2"))
      localStorage.setItem("trikonos-cart-v2", JSON.stringify([item]));
  }, checkoutCatalog);
  await page.goto("/pokladna");
  await expect(page.getByRole("alert")).toContainText("chybí URL schválených obchodních podmínek");
  await expect(page.getByRole("button", { name: "Objednat s povinností platby" })).toBeDisabled();
  expect(state.posts).toHaveLength(0);
  state.termsReady = true;
  await page.reload();
  await fillCustomer(page);
  await choose(page, "Způsob doručení", "Na adresu");
  await choose(page, "Dopravce", "Packeta");
  await choose(page, "Způsob platby", "Dobírkou");
  await expect(page.getByRole("region", { name: "Shrnutí objednávky" })).toContainText("788 Kč");
  await choose(page, "Způsob platby", "Převodem");
  await expect(page.getByRole("region", { name: "Shrnutí objednávky" })).toContainText("778 Kč");
  await page.getByRole("checkbox", { name: "Souhlasím s obchodními podmínkami" }).check();
  state.price = 79900;
  await page.getByRole("button", { name: "Objednat s povinností platby" }).click();
  await expect(page.getByRole("alert")).toContainText("Ceny nebo dostupnost se změnily");
  expect(state.posts).toHaveLength(0);
  await expect(page.getByRole("region", { name: "Shrnutí objednávky" })).toContainText("878 Kč");
  state.failFirstOrder = true;
  await page.getByRole("button", { name: "Objednat s povinností platby" }).click();
  await expect(page.getByRole("heading", { name: "Dokončení odeslání" })).toBeVisible();
  expect(state.created.size).toBe(1);
  await page.reload();
  await page.getByRole("button", { name: "Dokončit stejné odeslání" }).click();
  await expect(page).toHaveURL(/\/objednavka$/);
  await expect(page.getByRole("heading", { name: "Objednávka byla přijata" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Platební instrukce" })).toContainText(
    "123456789/0100",
  );
  expect(state.posts).toHaveLength(2);
  expect(state.posts[1]).toEqual(state.posts[0]);
  expect(state.posts[0]!.delivery.carrierId).toBe(carrierId);
  expect(state.posts[0]!.customer.marketingConsent).toBe(false);
  expect(state.posts[0]!.expectedTotal).toBe(87800);
  expect(state.created.size).toBe(1);
  const saved = await page.evaluate(() => ({
    cart: localStorage.getItem("trikonos-cart-v2"),
    receipt: sessionStorage.getItem("trikonos-checkout-v1"),
  }));
  expect(saved.cart).toBe("[]");
  expect(saved.receipt).not.toContain("jana@example.cz");
  expect(saved.receipt).not.toContain("Horní 12");
  expect(page.url()).not.toContain("receipt-secret-token");
  await page.reload();
  await expect(page.getByRole("region", { name: "Platební instrukce" })).toBeVisible();
  await page.goto("/");
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/objednavka#pristup=receipt-secret-token");
  await expect(page).toHaveURL(/\/objednavka$/);
  await expect(page.getByRole("region", { name: "Platební instrukce" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Platební instrukce" })).toBeVisible();
  await page.goto("/orders/receipt-secret-token");
  await expect(page).toHaveURL(/\/objednavka$/);
  await expect(page.getByRole("region", { name: "Platební instrukce" })).toBeVisible();
  expect(state.posts).toHaveLength(2);
  await page.goto("/objednavka#pristup=expired-token");
  await expect(page.getByRole("alert")).toContainText("Odkaz je neplatný");
  await expect(page.getByRole("heading", { name: "Objednávka byla přijata" })).toHaveCount(0);
});

test("blocks unconfigured shipping, sends a mixed quote with a separate address and never fabricates payment instructions", async ({
  page,
}) => {
  await mockStoreApi(page);
  const state = await mockCheckout(page);
  state.shippingKnown = false;
  const tokens: (string | undefined)[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/v1/orders")) tokens.push(request.headers()["x-csrftoken"]);
  });
  await page.addInitScript(
    (items) => {
      localStorage.setItem("trikonos-cart-v2", JSON.stringify(items));
    },
    [checkoutCatalog, checkoutCustom],
  );
  await page.goto("/pokladna");
  await fillCustomer(page);
  await choose(page, "Způsob doručení", "Na adresu");
  await choose(page, "Dopravce", "Packeta");
  await choose(page, "Způsob platby", "Dobírkou");
  await expect(page.getByRole("region", { name: "Shrnutí objednávky" })).toContainText(
    "cena není nastavená",
  );
  await expect(page.getByRole("button", { name: "Odeslat objednávku k nacenění" })).toBeDisabled();
  await choose(page, "Způsob doručení", "Osobní odběr");
  await page
    .getByRole("checkbox", { name: "Doručovací adresa je stejná jako fakturační" })
    .uncheck();
  const shipping = page.getByRole("group", { name: "Doručovací adresa", exact: true });
  await shipping.getByRole("textbox", { name: "Jméno a příjmení příjemce" }).fill("Petr Novák");
  await shipping.getByRole("textbox", { name: "Ulice a číslo domu" }).fill("Dolní 9");
  await shipping.getByRole("textbox", { name: "Obec", exact: true }).fill("Praha");
  await shipping.getByRole("textbox", { name: "PSČ", exact: true }).fill("11000");
  await page.getByRole("checkbox", { name: "Souhlasím s obchodními podmínkami" }).check();
  await page.getByRole("button", { name: "Odeslat objednávku k nacenění" }).click();
  await expect(page).toHaveURL(/\/objednavka$/);
  await expect(page.getByText("Celá objednávka čeká na nacenění", { exact: false })).toBeVisible();
  await expect(page.getByRole("region", { name: "Platební instrukce" })).toHaveCount(0);
  await expect(page.getByText("Dolní 9", { exact: false })).toBeVisible();
  expect(state.posts).toHaveLength(1);
  expect(state.posts[0]!.items).toHaveLength(2);
  expect(state.posts[0]!.expectedTotal).toBeNull();
  expect(state.posts[0]!.expectedShippingCost).toBe(0);
  expect(state.posts[0]!.shipping.sameAsBilling).toBe(false);
  expect(state.posts[0]!.delivery).not.toHaveProperty("carrierId");
  expect(tokens).toEqual(["bootstrap-token"]);
});
