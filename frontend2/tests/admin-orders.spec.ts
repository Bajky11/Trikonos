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
  await page.getByRole("link", { name: "TRK-2026-0042", exact: true }).click();
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
  await expect(page.getByRole("navigation", { name: "Stránkování objednávek" })).toBeVisible();
  await expect(page.getByText("Žádné stránky")).toBeVisible();
});

test("shows active advanced filters even when collapsed and clears them without changing the sort", async ({
  page,
}) => {
  const state = await mockAdminOrders(page);
  await page.goto(
    "/admin/objednavky?status=QUOTE_REQUESTED&hasCustom=true&createdFrom=2026-11-01&ordering=-total&page=2",
  );
  const toggle = page.getByRole("button", { name: "Další filtry (2)" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText(/Zobrazeno/)).toHaveCount(0);
  const filters = page.getByRole("region", { name: "Filtry objednávek" });
  await expect(filters.getByRole("combobox", { name: "Řazení" })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Stav", exact: true })).toBeAttached();
  await toggle.click();
  await expect(filters.getByRole("combobox", { name: "Řazení" })).toHaveText("Částka sestupně");
  await expect(page.getByRole("combobox", { name: "Vlastní potisk", exact: true })).toHaveText(
    "S vlastním potiskem",
  );
  await toggle.click();
  const dateChip = page.getByRole("button", { name: "Odebrat filtr Od data: 2026-11-01" });
  await dateChip.press("Delete");
  await expect.poll(() => state.lists.at(-1)?.get("createdFrom")).toBeNull();
  expect(state.lists.at(-1)?.get("hasCustom")).toBe("true");
  expect(state.lists.at(-1)?.get("page")).toBe("1");
  await page
    .getByRole("group", { name: "Aktivní filtry" })
    .getByRole("button", { name: "Vymazat filtry" })
    .click();
  await expect(page).toHaveURL(/\?ordering=-total$/);
  await page.getByRole("button", { name: "Další filtry", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Řazení" })).toHaveText("Částka sestupně");
});

test("uses one standard table row per order with only essential columns", async ({
  page,
}, testInfo) => {
  const state = await mockAdminOrders(page, 1);
  state.order.customer.firstName = "Jana Marie";
  state.order.customer.lastName = "Nováková Svobodová";
  state.order.note = "Prosím dodat do pátku.\nBílý potisk na záda.";
  state.order.total = 123400;
  state.order.items = [
    ...state.order.items,
    {
      ...state.order.items[0]!,
      id: "80000000-0000-0000-0000-000000000099",
      itemLabel: "Druhý potisk",
      size: "XL",
      quantity: 3,
      customText: "Druhý text",
    },
  ];
  await page.goto("/admin/objednavky");
  const table = page.getByRole("table", { name: "Objednávky" });
  const row = table.getByRole("row").nth(1);
  await expect(row.getByRole("cell").first()).toContainText("Jana Marie Nováková Svobodová");
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table.getByRole("rowheader")).not.toHaveAttribute("rowspan");
  await expect(row.getByRole("cell").nth(1)).toContainText("2× Vlastní týmový potisk");
  await expect(row.getByRole("cell").nth(1)).toContainText("3× Druhý potisk");
  expect(await table.getByRole("columnheader").allTextContents()).toEqual([
    "Objednávka",
    "Zákazník",
    "Položky",
    "Platba",
    "Stav",
    "Celkem",
  ]);
  await expect(page.getByRole("group", { name: "Rychlé pohledy" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Obnovit", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Detail objednávky|Tisk objednávky/ })).toHaveCount(
    0,
  );
  await expect(table.getByText(state.order.note!, { exact: true })).toHaveCount(0);
  await expect(table.getByRole("table")).toHaveCount(0);
  await expect(row.getByRole("cell").nth(1).locator("div, table")).toHaveCount(0);
  await expect(row.getByRole("cell").nth(1)).not.toContainText("Bílá");
  await expect(table.getByText(/1\s?234 Kč/)).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Objednávky", exact: true })).toHaveCount(1);
  const pagination = page.getByRole("navigation", { name: "Stránkování objednávek" });
  await expect(pagination).toBeVisible();
  await expect(pagination.getByRole("button", { name: "Další strana" })).toBeDisabled();
  await expect(page.getByRole("columnheader", { name: "Celkem", exact: true })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath("orders-desktop.png"), fullPage: true });
});

test("admin content uses the available width instead of a centered maximum", async ({ page }) => {
  await mockAdminOrders(page, 1);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/admin/objednavky");
  await expect(page.getByRole("table", { name: "Objednávky" })).toBeVisible();
  const layout = await page.locator(".admin-content").evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      width: element.getBoundingClientRect().width,
      padding: parseFloat(style.paddingLeft),
      maxWidth: style.maxWidth,
    };
  });
  expect(layout.maxWidth).toBe("none");
  expect(layout.width).toBeGreaterThan(1600);
  expect(layout.padding).toBeLessThanOrEqual(16);
  const content = await page.locator(".admin-content").boundingBox();
  const table = await page
    .getByRole("region", { name: "Zobrazení tabulky: Objednávky" })
    .boundingBox();
  expect(table!.width).toBeGreaterThan(content!.width - 40);
});

test("selects whole years and calendar months atomically and preserves other filters", async ({
  page,
}) => {
  const state = await mockAdminOrders(page, 1);
  await page.goto("/admin/objednavky?hasCustom=true&page=2");
  const period = page.getByRole("group", { name: "Období objednávek" });
  await period.getByRole("combobox", { name: "Rok", exact: true }).click();
  await page.getByRole("option", { name: "2024", exact: true }).click();
  await expect.poll(() => state.lists.at(-1)?.get("createdFrom")).toBe("2024-01-01");
  await expect.poll(() => state.lists.at(-1)?.get("createdTo")).toBe("2024-12-31");
  await period.getByRole("combobox", { name: "Měsíc", exact: true }).click();
  await page.getByRole("option", { name: "únor", exact: true }).click();
  await expect.poll(() => state.lists.at(-1)?.get("createdTo")).toBe("2024-02-29");
  expect(state.lists.at(-1)?.get("createdFrom")).toBe("2024-02-01");
  expect(state.lists.at(-1)?.get("hasCustom")).toBe("true");
  expect(state.lists.at(-1)?.get("page")).toBe("1");
  await expect(period.getByRole("combobox", { name: "Měsíc", exact: true })).toHaveText("únor");
  await period.getByRole("combobox", { name: "Rok", exact: true }).click();
  await page.getByRole("option", { name: "Všechny roky", exact: true }).click();
  await expect.poll(() => state.lists.at(-1)?.get("createdFrom")).toBeNull();
  expect(state.lists.at(-1)?.get("createdTo")).toBeNull();
  await page.getByRole("combobox", { name: "Stav objednávky", exact: true }).click();
  await page.getByRole("option", { name: "Čeká na nacenění", exact: true }).click();
  await expect.poll(() => state.lists.at(-1)?.get("status")).toBe("QUOTE_REQUESTED");
});

test("uses standard table scrolling without overflowing the mobile page", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAdminOrders(page, 1);
  await page.goto("/admin/objednavky");
  const region = page.getByRole("region", { name: "Zobrazení tabulky: Objednávky" });
  await expect(page.getByRole("link", { name: "TRK-2026-0042", exact: true })).toBeVisible();
  await region.scrollIntoViewIfNeeded();
  await region.evaluate((element) => {
    element.scrollLeft = 600;
  });
  await expect(page.getByRole("columnheader", { name: "Celkem", exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath("orders-mobile.png"), fullPage: true });
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
  await page.getByRole("link", { name: "TRK-2026-0042", exact: true }).click();
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
