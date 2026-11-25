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
  await page
    .getByRole("radiogroup", { name: label, exact: true })
    .getByRole("radio", { name })
    .check();
}

test("uses the Packeta HD widget only for Packeta and saves the selected shipping address", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockStoreApi(page);
  const state = await mockCheckout(page);
  state.packetaHomeDelivery = { apiKey: "public-widget-key", carrierId: "106" };
  state.carriers.push({ id: "another-carrier", name: "Jiný dopravce", code: "OTHER" });
  await page.route("https://hd.widget.packeta.com/v6/", (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<button onclick='parent.postMessage(JSON.stringify({packetaWidgetMessage:true,address:{
        country:"cz",street:"Českomoravská",houseNumber:"2408/1a",city:"Praha",postcode:"190 00"
      }}), "*")'>Potvrdit adresu</button>`,
    }),
  );
  await page.addInitScript((item) => {
    localStorage.setItem("trikonos-cart-v2", JSON.stringify([item]));
  }, checkoutCatalog);
  await page.goto("/pokladna");
  await fillCustomer(page);

  const picker = page.getByRole("button", { name: "Vybrat adresu v Zásilkovně" });
  await choose(page, "Způsob doručení", "Osobní odběr");
  await expect(picker).toHaveCount(0);
  await choose(page, "Způsob doručení", "Doručení na adresu");
  await choose(page, "Dopravce", "Jiný dopravce");
  await expect(picker).toHaveCount(0);
  await choose(page, "Dopravce", "Packeta");
  await picker.click();
  await page.getByRole("button", { name: "Zavřít a pokračovat ručně" }).click();
  const differentAddress = page.getByRole("checkbox", { name: "Doručit na jinou adresu" });
  await expect(differentAddress).not.toBeChecked();

  await picker.click();
  const iframe = page.locator('iframe[title="Výběr doručovací adresy Zásilkovny"]');
  await expect(iframe).toHaveAttribute("src", /layout=hd/);
  await expect(iframe).toHaveAttribute("src", /carrierId=106/);
  await page.evaluate(() => window.postMessage({ packetaWidgetMessage: true, address: null }, "*"));
  await expect(page.getByRole("dialog")).toBeVisible();
  await iframe.contentFrame().getByRole("button", { name: "Potvrdit adresu" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(differentAddress).toBeChecked();
  const shipping = page.getByRole("group", { name: "Doručovací adresa", exact: true });
  await expect(shipping.getByRole("textbox", { name: "Ulice a číslo domu" })).toHaveValue(
    "Českomoravská 2408/1a",
  );
  await expect(shipping.getByRole("textbox", { name: "PSČ" })).toHaveValue("19000");
  await choose(page, "Způsob platby", "Bankovní převod");
  await page.getByRole("checkbox", { name: "Souhlasím s obchodními podmínkami" }).check();
  await page.getByRole("button", { name: "Objednat s povinností platby" }).click();
  await expect(page).toHaveURL(/\/objednavka$/);
  expect(state.posts).toHaveLength(1);
  expect(state.posts[0]).toMatchObject({
    delivery: { deliveryType: "HOME_DELIVERY", carrierId },
    billing: { street: "Horní 12", city: "Vrchlabí", zip: "54301" },
    shipping: {
      sameAsBilling: false,
      fullName: "Jana Nováková",
      street: "Českomoravská 2408/1a",
      city: "Praha",
      zip: "19000",
      country: "CZ",
    },
  });
});

test("selects a Packeta Z-BOX and submits the pickup ID instead of a home delivery address", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockStoreApi(page);
  const state = await mockCheckout(page);
  state.packetaHomeDelivery = { apiKey: "public-widget-key", carrierId: "106" };
  await page.route("https://widget.packeta.com/v6/", (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<button onclick='parent.postMessage({packetaWidgetMessage:true,packetaSelectedData:{
        id:"12345",name:"Z-BOX Vrchlabí",country:"cz",group:"zbox",pickupPointType:"internal"
      }}, "*")'>Potvrdit Z-BOX</button>`,
    }),
  );
  await page.addInitScript((item) => {
    localStorage.setItem("trikonos-cart-v2", JSON.stringify([item]));
  }, checkoutCatalog);
  await page.goto("/pokladna");
  await fillCustomer(page);
  await choose(page, "Způsob doručení", "Z-BOX nebo výdejní místo");
  await choose(page, "Způsob platby", "Bankovní převod");
  const summary = page.getByRole("region", { name: "Shrnutí objednávky" });
  await expect(summary).toContainText("778 Kč");
  const submit = page.getByRole("button", { name: "Objednat s povinností platby" });
  await expect(submit).toBeDisabled();
  const choosePickup = page.getByRole("button", { name: "Vybrat Z-BOX nebo výdejní místo" });
  await expect(choosePickup).toHaveClass(/\bMuiButton-contained\b/);
  await choosePickup.click();
  const map = page.locator('iframe[title="Mapa Z-BOXů a výdejních míst Zásilkovny"]');
  await expect(map).toHaveAttribute("src", /vendors=cz%2C.*zbox/);
  await map.contentFrame().getByRole("button", { name: "Potvrdit Z-BOX" }).click();
  const selection = page.getByRole("status").filter({ hasText: "Vybrané místo Zásilkovny" });
  await expect(selection).toContainText("Z-BOX Vrchlabí");
  const changePickup = page.getByRole("button", { name: "Změnit vybrané místo" });
  await expect(changePickup).toHaveClass(/\bMuiButton-outlined\b/);
  await changePickup.click();
  await expect(map).toBeVisible();
  await page.getByRole("button", { name: "Zavřít mapu" }).click();
  await expect(selection).toContainText("Z-BOX Vrchlabí");
  await expect(summary).toContainText("Z-BOX Vrchlabí");
  await page.getByRole("checkbox", { name: "Souhlasím s obchodními podmínkami" }).check();
  await submit.click();
  await expect(page).toHaveURL(/\/objednavka$/);
  await expect(page.getByText("Doručení: Packeta · Z-BOX Vrchlabí")).toBeVisible();
  expect(state.posts[0]).toMatchObject({
    delivery: {
      deliveryType: "PICKUP_POINT",
      carrierId,
      pickupPointId: "12345",
      pickupPointName: "Z-BOX Vrchlabí",
    },
    shipping: { sameAsBilling: true },
  });
});

test("creates an order from the cart on mobile only after required details and consent", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockStoreApi(page);
  const state = await mockCheckout(page);
  await page.addInitScript((item) => {
    if (!localStorage.getItem("trikonos-cart-v2"))
      localStorage.setItem("trikonos-cart-v2", JSON.stringify([item]));
  }, checkoutCatalog);
  const steps = page.getByRole("navigation", { name: "Průběh objednávky" });
  const currentStep = steps.locator('[aria-current="step"]');
  await page.goto("/kosik");
  await expect(currentStep).toContainText("Košík");
  await page.getByRole("link", { name: "Pokračovat k objednání" }).click();
  await expect(currentStep).toContainText("Údaje a doprava");
  await expect(page.getByRole("textbox", { name: "IČO (nepovinné)" })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Poznámka (nepovinná)" })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Doručit na jinou adresu" })).toHaveCount(0);
  await choose(page, "Způsob doručení", "Osobní odběr");
  await choose(page, "Způsob platby", "Při převzetí na prodejně");
  const summary = page.getByRole("region", { name: "Shrnutí objednávky" });
  await expect(summary).toContainText("Osobní odběr");
  await expect(summary).toContainText("Při převzetí na prodejně");
  await expect(page.getByRole("heading", { name: "Údaje a doprava" })).toBeVisible();
  await expect(summary.getByRole("button", { name: /dopravu a platbu/ })).toHaveCount(0);
  const submit = page.getByRole("button", { name: "Objednat s povinností platby" });
  const firstName = page.getByRole("textbox", { name: "Jméno", exact: true });
  const terms = page.getByRole("checkbox", { name: "Souhlasím s obchodními podmínkami" });
  await submit.click();
  await expect(firstName).toBeFocused();
  expect(state.posts).toHaveLength(0);
  await fillCustomer(page);
  await submit.click();
  await expect(terms).toBeFocused();
  expect(state.posts).toHaveLength(0);
  await terms.check();
  await submit.click();
  await expect(currentStep).toContainText("Potvrzení");
  await expect(page.getByRole("heading", { name: "TRK-2026-000123" })).toBeVisible();
  expect(state.posts).toHaveLength(1);
  expect(state.posts[0]).toMatchObject({
    customer: { email: "jana@example.cz" },
    billing: { zip: "54301" },
    delivery: { deliveryType: "PERSONAL_PICKUP" },
    expectedTotal: 69900,
    termsAccepted: true,
  });
});

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
  await choose(page, "Způsob doručení", "Doručení na adresu");
  await choose(page, "Způsob platby", "Dobírkou");
  await expect(page.getByRole("region", { name: "Shrnutí objednávky" })).toContainText("788 Kč");
  await choose(page, "Způsob platby", "Bankovní převod");
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
  await choose(page, "Způsob doručení", "Doručení na adresu");
  await choose(page, "Způsob platby", "Dobírkou");
  await expect(page.getByRole("region", { name: "Shrnutí objednávky" })).toContainText(
    "cena není nastavená",
  );
  await expect(page.getByRole("button", { name: "Odeslat objednávku k nacenění" })).toBeDisabled();
  state.shippingKnown = true;
  await page.getByRole("button", { name: "Znovu ověřit shrnutí" }).click();
  await page.getByRole("checkbox", { name: "Doručit na jinou adresu" }).check();
  const shipping = page.getByRole("group", { name: "Doručovací adresa", exact: true });
  await shipping.getByRole("textbox", { name: "Jméno a příjmení příjemce" }).fill("Petr Novák");
  await shipping.getByRole("textbox", { name: "Ulice a číslo domu" }).fill("Dolní 9");
  await shipping.getByRole("textbox", { name: "Obec", exact: true }).fill("Praha");
  await shipping.getByRole("textbox", { name: "PSČ", exact: true }).fill("11000");
  await page.getByRole("checkbox", { name: "Přidat firemní nebo jiné fakturační údaje" }).check();
  await page.getByRole("textbox", { name: "IČO (nepovinné)" }).fill("12345678");
  await page.getByRole("checkbox", { name: "Přidat poznámku k objednávce" }).check();
  await page.getByRole("textbox", { name: "Poznámka (nepovinná)" }).fill("Zavolat předem");
  await page.getByRole("checkbox", { name: "Souhlasím s obchodními podmínkami" }).check();
  await page.getByRole("button", { name: "Odeslat objednávku k nacenění" }).click();
  await expect(page).toHaveURL(/\/objednavka$/);
  await expect(page.getByText("Celá objednávka čeká na nacenění", { exact: false })).toBeVisible();
  await expect(page.getByRole("region", { name: "Platební instrukce" })).toHaveCount(0);
  await expect(page.getByText("Dolní 9", { exact: false })).toBeVisible();
  expect(state.posts).toHaveLength(1);
  expect(state.posts[0]!.items).toHaveLength(2);
  expect(state.posts[0]!.expectedTotal).toBeNull();
  expect(state.posts[0]!.expectedShippingCost).toBe(8900);
  expect(state.posts[0]!.shipping.sameAsBilling).toBe(false);
  expect(state.posts[0]!.delivery.carrierId).toBe(carrierId);
  expect(state.posts[0]!.billing.ico).toBe("12345678");
  expect(state.posts[0]!.note).toBe("Zavolat předem");
  expect(tokens).toEqual(["bootstrap-token"]);
});
