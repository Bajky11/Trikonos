import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { mockAuthApi, mockStoreApi } from "./api-fixtures";
import { customerId, mockCustomers } from "./admin-customers-fixtures";
import { mockAdminOrders } from "./admin-orders-fixtures";

test.beforeEach(async ({ page }) => {
  await mockStoreApi(page);
  await mockAuthApi(page, true);
});

test("recovers customer loading, filters/pages real data, preserves edits on email conflict and links the correct order history", async ({
  page,
}) => {
  const orders = await mockAdminOrders(page);
  const state = await mockCustomers(page);
  state.listFailed = true;
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/admin/klienti");
  await expect(page.getByRole("alert")).toContainText("Zákazníci");
  state.listFailed = false;
  await page.getByRole("button", { name: "Zkusit znovu", exact: true }).click();
  await page.getByRole("searchbox", { name: "Hledání zákazníků", exact: true }).fill("Firma");
  await expect.poll(() => state.lists.at(-1)?.get("q")).toBe("Firma");
  await page.getByRole("button", { name: "Go to page 2", exact: true }).click();
  await expect.poll(() => state.lists.at(-1)?.get("page")).toBe("2");
  await page.getByRole("combobox", { name: "Marketingový souhlas", exact: true }).click();
  await page.getByRole("option", { name: "Bez souhlasu", exact: true }).click();
  await expect.poll(() => state.lists.at(-1)?.get("marketingConsent")).toBe("false");
  await expect.poll(() => state.lists.at(-1)?.get("page")).toBe("1");
  await page.getByRole("combobox", { name: "Řazení zákazníků", exact: true }).click();
  await page.getByRole("option", { name: "Nejvíce objednávek", exact: true }).click();
  await expect.poll(() => state.lists.at(-1)?.get("ordering")).toBe("-ordersCount");
  await page.getByRole("link", { name: "jana@example.cz", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Zákazník jana@example.cz", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "E-mail zákazníka", exact: true })
    .fill("taken@example.cz");
  await page.getByRole("textbox", { name: "Telefon", exact: true }).fill("777987654");
  await page
    .getByRole("textbox", { name: "Interní poznámka", exact: true })
    .fill("Telefonicky ověřeno.");
  await page
    .getByRole("checkbox", { name: "Marketingový souhlas (aktuální evidence)", exact: true })
    .check();
  await page.getByRole("button", { name: "Uložit zákazníka", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Tento e-mail už patří jinému zákazníkovi");
  expect(state.customer.email).toBe("jana@example.cz");
  await expect(page.getByRole("textbox", { name: "Telefon", exact: true })).toHaveValue(
    "777987654",
  );
  await page.getByRole("textbox", { name: "E-mail zákazníka", exact: true }).fill("NEW@EXAMPLE.CZ");
  await page.getByRole("button", { name: "Uložit zákazníka", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Zákazník new@example.cz", exact: true }),
  ).toBeVisible();
  expect(state.updates[1]).toEqual({
    email: "new@example.cz",
    phone: "777987654",
    note: "Telefonicky ověřeno.",
    marketingConsent: true,
  });
  await page.getByRole("link", { name: "Zpět na zákazníky", exact: true }).click();
  await expect(page.getByText("Žádný zákazník neodpovídá hledání.", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Marketingový souhlas", exact: true }),
  ).toHaveText("Bez souhlasu");
  await page.getByRole("combobox", { name: "Marketingový souhlas", exact: true }).click();
  await page.getByRole("option", { name: "Všichni zákazníci", exact: true }).click();
  await page.getByRole("link", { name: "new@example.cz", exact: true }).click();
  await page
    .getByRole("region", { name: "Historie objednávek zákazníka", exact: true })
    .getByRole("link", { name: "TRK-2026-0042", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Objednávka TRK-2026-0042", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Zpět na objednávky", exact: true }).click();
  await expect.poll(() => orders.lists.at(-1)?.get("customer")).toBe(customerId);
  expect(orders.lists.at(-1)?.get("q")).toBeNull();
  await expect(page.getByRole("link", { name: "Profil zákazníka", exact: true })).toHaveAttribute(
    "href",
    `/admin/klienti/${customerId}`,
  );
});

test("exports the global consent CSV only on demand, not filtered list data or a cached payload", async ({
  page,
}) => {
  const state = await mockCustomers(page);
  state.exportFailed = true;
  let downloads = 0;
  page.on("download", () => downloads++);
  page.on("dialog", (dialog) => {
    expect(dialog.message()).toContain("VŠECH");
    expect(dialog.message()).toContain("Filtry");
    void dialog.accept();
  });
  await page.goto("/admin/klienti?marketingConsent=false&q=Firma");
  await page
    .getByRole("button", { name: "Exportovat souhlasící e-maily (CSV)", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(downloads).toBe(0);
  state.exportFailed = false;
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportovat souhlasící e-maily (CSV)", exact: true })
    .click();
  const downloaded = await downloading;
  expect(downloaded.suggestedFilename()).toBe("marketing-consents.csv");
  const csv = await readFile((await downloaded.path())!, "utf8");
  expect(csv).toContain("newsletter@example.cz");
  expect(csv).not.toContain("jana@example.cz");
  expect(state.exports).toHaveLength(2);
  expect(state.exports.every((params) => params.size === 0)).toBe(true);
  const persisted = await page.evaluate(() =>
    JSON.stringify(
      [localStorage, sessionStorage].flatMap((storage) =>
        Array.from({ length: storage.length }, (_, i) => storage.getItem(storage.key(i)!)),
      ),
    ),
  );
  expect(persisted).not.toContain("newsletter@example.cz");
});

test("an uncertain customer update requires refreshing the authoritative state before another save", async ({
  page,
}) => {
  const state = await mockCustomers(page);
  state.loseResponse = true;
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto(`/admin/klienti/${customerId}`);
  await page.getByRole("textbox", { name: "Telefon", exact: true }).fill("777999888");
  await page.getByRole("button", { name: "Uložit zákazníka", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Výsledek uložení není potvrzený");
  await expect(page.getByRole("button", { name: "Uložit zákazníka", exact: true })).toBeDisabled();
  expect(state.updates).toHaveLength(1);
  await page.getByRole("button", { name: "Načíst aktuálního zákazníka", exact: true }).click();
  await expect(page.getByRole("button", { name: "Uložit zákazníka", exact: true })).toBeEnabled();
  await expect(page.getByRole("textbox", { name: "Telefon", exact: true })).toHaveValue(
    "777999888",
  );
  expect(state.updates).toHaveLength(1);
});
