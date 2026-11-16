import { expect, test } from "@playwright/test";
import { mockStoreApi } from "./api-fixtures";
import { checkoutCatalog, mockCheckout } from "./checkout-fixtures";
import { DeliveryTypeEnum, PaymentMethodEnum } from "../src/api/generated/models";
import type { OrderCreate } from "../src/api/generated/models";

test("lookup keeps mismatches generic, handles throttling, opens the real detail and preserves pending checkout", async ({
  page,
}) => {
  await mockStoreApi(page);
  const checkout = await mockCheckout(page);
  const body: OrderCreate = {
    orderId: "50000000-0000-0000-0000-000000000010",
    customer: { email: "jana@example.cz" },
    billing: { fullName: "Jana", street: "Horní 12", city: "Vrchlabí", zip: "54301" },
    shipping: { sameAsBilling: true },
    delivery: { deliveryType: DeliveryTypeEnum.PERSONAL_PICKUP },
    paymentMethod: PaymentMethodEnum.BANK_TRANSFER,
    items: [],
  };
  checkout.created.set(body.orderId!, {
    body,
    response: {
      orderNumber: "TRK-2026-000123",
      status: "NEW",
      accessToken: "receipt-secret-token",
      requiresQuote: false,
      items: [],
      subtotal: 69900,
      shippingCost: 0,
      total: 69900,
      currency: "CZK",
    },
  });
  const pending = JSON.stringify({
    kind: "pending",
    body,
    cartKey: JSON.stringify([checkoutCatalog]),
    createdAt: Date.now(),
    uncertain: true,
  });
  await page.addInitScript(
    ({ pending, item }) => {
      if (!sessionStorage.getItem("trikonos-checkout-v1"))
        sessionStorage.setItem("trikonos-checkout-v1", pending);
      localStorage.setItem("trikonos-cart-v2", JSON.stringify([item]));
    },
    { pending, item: checkoutCatalog },
  );
  let status = 404;
  const requests: { orderNumber: string; email: string }[] = [];
  await page.route("**/api/v1/orders/lookup", async (route) => {
    expect(route.request().headers()["x-csrftoken"]).toBe("bootstrap-token");
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      status,
      json:
        status === 200
          ? { accessToken: "receipt-secret-token" }
          : { error: { code: status === 429 ? "THROTTLED" : "NOT_FOUND" } },
    });
  });
  await page.goto("/stav-objednavky");
  await page
    .getByRole("textbox", { name: "Číslo objednávky", exact: true })
    .fill(" TRK-2026-000123 ");
  await page.getByRole("textbox", { name: "E-mail objednávky" }).fill("jana@example.cz");
  await page.getByRole("button", { name: "Dohledat objednávku", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Zkontrolujte oba údaje");
  expect(requests).toEqual([{ orderNumber: "TRK-2026-000123", email: "jana@example.cz" }]);
  await expect(page.getByRole("textbox", { name: "E-mail objednávky" })).toHaveValue(
    "jana@example.cz",
  );
  status = 429;
  await page.getByRole("button", { name: "Dohledat objednávku", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Příliš mnoho pokusů");
  expect(requests).toHaveLength(2);
  status = 200;
  await page.getByRole("button", { name: "Dohledat objednávku", exact: true }).click();
  await expect(page).toHaveURL(/\/objednavka$/);
  await expect(page.getByRole("heading", { name: "TRK-2026-000123" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Platební instrukce" })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("trikonos-checkout-v1"))).toBe(pending);
  await page.reload();
  await expect(page.getByRole("region", { name: "Platební instrukce" })).toBeVisible();
  await page.getByRole("link", { name: "Dokončit původní odeslání košíku" }).click();
  await expect(page.getByRole("heading", { name: "Dokončení odeslání" })).toBeVisible();
  expect(checkout.posts).toHaveLength(0);
  expect(page.url()).not.toContain("jana@example.cz");
});

test("contact retains inputs on failure, sends a honeypot and blocks duplicate submits without automatic retries", async ({
  page,
}) => {
  await mockStoreApi(page);
  let status = 503;
  let release: (() => void) | undefined;
  const requests: Record<string, string>[] = [];
  await page.route("**/api/v1/contact", async (route) => {
    expect(route.request().headers()["x-csrftoken"]).toBe("bootstrap-token");
    requests.push(route.request().postDataJSON());
    if (status === 204)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    await route.fulfill({
      status,
      ...(status === 204 ? {} : { json: { error: { code: "CONTACT_UNAVAILABLE" } } }),
    });
  });
  await page.goto("/kontakt");
  await page.getByRole("textbox", { name: "Jméno", exact: true }).fill("Jana");
  await page.getByRole("textbox", { name: "E-mail", exact: true }).fill("jana@example.cz");
  await page.getByRole("textbox", { name: "Firma nebo tým (nepovinné)" }).fill("Horský tým");
  await page
    .getByRole("textbox", { name: "Zpráva", exact: true })
    .fill("Prosíme o nabídku triček pro tým.");
  await expect(page.locator('input[name="website"]')).toBeHidden();
  await page.getByRole("button", { name: "Odeslat zprávu" }).click();
  await expect(page.getByRole("alert")).toContainText("Odesílání zpráv nyní není dostupné");
  await expect(page.getByRole("textbox", { name: "Zpráva", exact: true })).toHaveValue(
    "Prosíme o nabídku triček pro tým.",
  );
  expect(requests).toHaveLength(1);
  status = 204;
  await page.getByRole("button", { name: "Odeslat zprávu" }).click();
  await expect(page.getByRole("button", { name: "Odesílání…" })).toBeDisabled();
  await page.locator("form").evaluate((form: HTMLFormElement) => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]).toEqual({
    name: "Jana",
    email: "jana@example.cz",
    phone: "",
    company: "Horský tým",
    message: "Prosíme o nabídku triček pro tým.",
    website: "",
  });
  release!();
  await expect(page.getByRole("region", { name: "Potvrzení zprávy" })).toBeVisible();
  await page.getByRole("button", { name: "Napsat další zprávu" }).click();
  await expect(page.getByRole("textbox", { name: "Zpráva", exact: true })).toHaveValue("");
  expect(requests).toHaveLength(2);
  const storage = await page.evaluate(() =>
    JSON.stringify(
      [localStorage, sessionStorage].map((storage) =>
        Array.from({ length: storage.length }, (_, index) => storage.getItem(storage.key(index)!)),
      ),
    ),
  );
  expect(storage).not.toContain("jana@example.cz");
  expect(storage).not.toContain("Prosíme");
});
