import { expect, test } from "@playwright/test";
import { mockAuthApi, mockStoreApi } from "./api-fixtures";
import { adminItemId, adminOrderId, mockAdminOrders } from "./admin-orders-fixtures";

test.beforeEach(async ({ page }) => {
  await mockStoreApi(page);
  await mockAuthApi(page, true);
});

test("filters and paginates server orders, prices a quote, reconfirms changed prices and records payment independently", async ({
  page,
}) => {
  const state = await mockAdminOrders(page);
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/admin/objednavky");
  await page.getByRole("combobox", { name: "Stav objednávky", exact: true }).click();
  await page.getByRole("option", { name: "Čeká na nacenění", exact: true }).click();
  await expect.poll(() => state.lists.at(-1)?.get("status")).toBe("QUOTE_REQUESTED");
  await page.getByRole("button", { name: "Přejít na stranu 2" }).click();
  await expect.poll(() => state.lists.at(-1)?.get("page")).toBe("2");
  await page
    .getByRole("searchbox", { name: "Hledat v objednávkách", exact: true })
    .fill("jana@example.cz");
  await expect.poll(() => state.lists.at(-1)?.get("q")).toBe("jana@example.cz");
  await expect.poll(() => state.lists.at(-1)?.get("page")).toBe("1");
  await page.getByRole("link", { name: "TRK-2026-0042" }).click();
  await expect(page.getByRole("heading", { name: "Objednávka TRK-2026-0042" })).toBeVisible();
  await page
    .getByRole("group", { name: "Fakturační adresa", exact: true })
    .getByRole("textbox", { name: "Ulice a číslo", exact: true })
    .fill("Nová 17");
  await page
    .getByRole("textbox", { name: "Poznámka k objednávce", exact: true })
    .fill("Domluvená změna adresy.");
  await page.getByRole("button", { name: "Uložit údaje objednávky", exact: true }).click();
  await expect.poll(() => state.order.billing.street).toBe("Nová 17");
  expect(state.writes[0]!.body).toEqual({
    billing: { ...state.order.billing },
    note: "Domluvená změna adresy.",
  });
  await expect(
    page.getByRole("button", { name: "Potvrdit a odeslat cenu", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("link", { name: "Zobrazit podklad — Přední strana" }),
  ).toHaveAttribute("href", /\/media\/designs\/team.png$/);
  const item = page.getByRole("region", { name: "Vlastní týmový potisk" });
  await item.getByRole("textbox", { name: "Cena za kus (Kč)", exact: true }).fill("349,90");
  await item.getByRole("button", { name: "Uložit cenu a množství" }).click();
  await expect.poll(() => state.order.total).toBe(69980);
  expect(state.writes.find((write) => write.path.endsWith(`/items/${adminItemId}`))!.body).toEqual({
    unitPrice: 34990,
    quantity: 2,
  });
  await page.getByRole("button", { name: "Potvrdit a odeslat cenu", exact: true }).click();
  await expect(page.getByRole("button", { name: "Znovu potvrdit a odeslat e-mail" })).toBeEnabled();
  expect(state.order.status).toBe("NEW");
  expect(state.confirms).toBe(1);
  await page.getByRole("textbox", { name: "Cena dopravy (Kč)", exact: true }).fill("79,50");
  await page.getByRole("button", { name: "Nastavit ruční cenu dopravy" }).click();
  await expect(
    page.getByRole("button", { name: "Potvrdit a odeslat cenu", exact: true }),
  ).toBeEnabled();
  expect(state.order.total).toBe(77930);
  await page.getByRole("button", { name: "Vrátit automatickou cenu dopravy" }).click();
  await expect.poll(() => state.order.shippingCostManual).toBe(false);
  await page.getByRole("button", { name: "Potvrdit a odeslat cenu", exact: true }).click();
  await expect(page.getByRole("button", { name: "Znovu potvrdit a odeslat e-mail" })).toBeEnabled();
  const actions = page.getByRole("region", { name: "Potvrzení a stavy" });
  await actions.getByRole("button", { name: "Uhrazeno", exact: true }).click();
  await expect.poll(() => state.order.paymentStatus).toBe("PAID");
  expect(state.order.status).toBe("NEW");
  await actions.getByRole("button", { name: "Ve výrobě", exact: true }).click();
  await expect(item.getByRole("button", { name: "Uložit cenu a množství" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Uložit údaje objednávky" })).toBeDisabled();
  expect(state.order.status).toBe("PROCESSING");
  await page.getByRole("textbox", { name: "Sledovací číslo", exact: true }).fill("Z123456");
  await page.getByRole("button", { name: "Uložit sledovací číslo" }).click();
  await expect.poll(() => state.order.trackingNumber).toBe("Z123456");
  await page.getByRole("link", { name: "Zpět na objednávky" }).click();
  await expect(page.getByRole("combobox", { name: "Stav objednávky", exact: true })).toHaveText(
    "Čeká na nacenění",
  );
  await expect(page.getByText("Žádná objednávka neodpovídá hledání.")).toBeVisible();
});

test("recovers list errors and handles a concurrent lock without pretending a price was saved", async ({
  page,
}) => {
  const state = await mockAdminOrders(page);
  state.listError = true;
  await page.goto("/admin/objednavky");
  await expect(page.getByRole("alert")).toContainText("Objednávky");
  state.listError = false;
  await page.getByRole("button", { name: /Zkusit znovu/ }).click();
  await page.getByRole("link", { name: "TRK-2026-0042" }).click();
  const item = page.getByRole("region", { name: "Vlastní týmový potisk" });
  await item.getByRole("textbox", { name: "Cena za kus (Kč)", exact: true }).fill("100");
  state.rejectWrite = true;
  await item.getByRole("button", { name: "Uložit cenu a množství" }).click();
  await expect(page.getByRole("alert")).toContainText("uzamčená");
  await expect(item.getByRole("button", { name: "Uložit cenu a množství" })).toBeDisabled();
  expect(state.order.items[0]!.unitPrice).toBeNull();
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0]!.path).toContain(`/items/${adminItemId}`);
});

test("a lost confirmation response requires a refresh, not an automatic duplicate email", async ({
  page,
}) => {
  const state = await mockAdminOrders(page);
  state.order.items[0]!.unitPrice = 0;
  state.order.subtotal = 0;
  state.order.total = 0;
  state.loseConfirmation = true;
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto(`/admin/objednavky/${adminOrderId}`);
  await page.getByRole("button", { name: "Potvrdit a odeslat cenu", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Výsledek změny není potvrzený");
  await expect(
    page.getByRole("button", { name: "Potvrdit a odeslat cenu", exact: true }),
  ).toBeDisabled();
  expect(state.confirms).toBe(1);
  await page.getByRole("button", { name: "Načíst aktuální stav", exact: true }).click();
  await expect(page.getByRole("button", { name: "Znovu potvrdit a odeslat e-mail" })).toBeEnabled();
  expect(state.confirms).toBe(1);
  expect(state.writes).toHaveLength(1);
});
