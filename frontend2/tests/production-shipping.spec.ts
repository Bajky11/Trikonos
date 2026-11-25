import { expect, test } from "@playwright/test";
import { mockAuthApi, mockStoreApi, options } from "./api-fixtures";
import { adminOrderId, mockAdminOrders } from "./admin-orders-fixtures";
import type { Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await mockStoreApi(page);
  await mockAuthApi(page, true);
});

async function mockExpedition(page: Page) {
  const state = await mockAdminOrders(page);
  Object.assign(state.order, {
    status: "PROCESSING",
    carrier: { id: "90000000-0000-0000-0000-000000000001", name: "Packeta", code: "PACKETA" },
    deliveryType: "HOME_DELIVERY",
    subtotal: 69900,
    total: 69900,
    isLocked: true,
  });
  state.order.items[0]!.unitPrice = 34950;
  const shipment = { posts: [] as unknown[], lost: false, labels: 0, syncs: 0, emails: 0 };
  await page.route(`**/api/v1/admin/orders/${adminOrderId}/shipment`, async (route) => {
    expect(route.request().headers()["x-csrftoken"]).toBe("bootstrap-token");
    shipment.posts.push(route.request().postDataJSON());
    if (shipment.lost)
      return route.fulfill({ status: 502, json: { error: { code: "CARRIER_API_ERROR" } } });
    Object.assign(state.order, {
      carrierShipmentId: "packet-1234",
      trackingNumber: "Z123456",
      updatedAt: "2026-11-16T12:00:00Z",
    });
    await route.fulfill({ json: state.order });
  });
  await page.route(`**/api/v1/admin/orders/${adminOrderId}/shipment/label`, async (route) => {
    expect(route.request().headers()["accept"]).toBe("*/*");
    shipment.labels++;
    state.order.shipmentStatus = "LABEL_PRINTED";
    await route.fulfill({ contentType: "application/pdf", body: "%PDF-1.4\nmock label\n%%EOF" });
  });
  await page.route(`**/api/v1/admin/orders/${adminOrderId}/shipment/status`, async (route) => {
    shipment.syncs++;
    state.order.shipmentStatus = "IN_TRANSIT";
    await route.fulfill({ json: state.order });
  });
  await page.route(`**/api/v1/admin/orders/${adminOrderId}/resend-email`, async (route) => {
    expect(route.request().headers()["x-csrftoken"]).toBe("bootstrap-token");
    expect(route.request().postDataJSON()).toEqual({ type: "ORDER_RECEIVED" });
    shipment.emails++;
    await route.fulfill({ status: 204 });
  });
  return { state, shipment };
}

test("production uses explicit shared filters, links to orders and renders the existing print sheet", async ({
  page,
}) => {
  await mockAdminOrders(page);
  let summaryFailed = true;
  const calls: { kind: string; query: URLSearchParams }[] = [];
  await page.route(/\/api\/v1\/admin\/production\/(summary|orders)(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url()),
      kind = url.pathname.split("/").at(-1)!;
    calls.push({ kind, query: url.searchParams });
    if (kind === "summary" && summaryFailed) return route.fulfill({ status: 503, json: {} });
    await route.fulfill({
      json:
        kind === "summary"
          ? [{ productType: "Tričko", cut: "Pánské", color: "Bílá", size: "L", quantity: 2 }]
          : [
              {
                id: adminOrderId,
                orderNumber: "TRK-2026-0042",
                status: "PROCESSING",
                productionStatus: "NOT_STARTED",
                createdAt: "2026-11-16T12:00:00Z",
                items: [
                  {
                    id: "item-1",
                    motif: null,
                    isCustom: true,
                    customText: "Týmový potisk",
                    productType: "Tričko",
                    cut: "Pánské",
                    color: "Bílá",
                    size: "L",
                    quantity: 2,
                    productionStatus: "WAITING",
                    productionRevision: 0,
                    placements: [
                      {
                        id: "placement-1",
                        printArea: "Přední strana",
                        x: 0,
                        y: 0,
                        width: 200,
                        height: 100,
                        rotationDeg: 0,
                        url: "/media/designs/team.png",
                      },
                    ],
                  },
                ],
              },
            ],
    });
  });
  await page.route(/\/api\/v1\/admin\/print-areas(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: "80000000-0000-0000-0000-000000000005",
            name: "Přední strana",
            productTypeId: options.productTypes[0]!.id,
            widthMm: 300,
            heightMm: 400,
          },
        ],
      },
    }),
  );
  await page.clock.setFixedTime(new Date(2026, 10, 23, 12));
  await page.goto("/admin/vyroba");
  await expect(page.getByText("Výroba: Nezahájeno")).toBeVisible();
  await expect(page.getByText("Objednávka: Ve výrobě")).toBeVisible();
  await expect(page.getByText("0 / 2 ks hotovo")).toBeVisible();
  await expect(page.getByText("Týmový potisk")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Vyberte datum", exact: true }).first(),
  ).toBeVisible();
  const filterHeights = await page.locator(".production-filters > .MuiFormControl-root").evaluateAll(
    (fields) => fields.map((field) => field.getBoundingClientRect().height),
  );
  expect(filterHeights).toHaveLength(3);
  expect(new Set(filterHeights).size).toBe(1);
  await expect(page.getByRole("button", { name: "Obnovit data" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Souhrn výroby");
  await expect(page.getByRole("button", { name: "Tisk přehledu", exact: true })).toBeDisabled();
  summaryFailed = false;
  await page.getByRole("button", { name: "Zkusit znovu", exact: true }).click();
  await expect(page.getByRole("table", { name: "Souhrn výroby", exact: true })).toBeVisible();
  await expect(page.getByText("2 ks celkem")).toBeVisible();
  await page.getByRole("button", { name: "Zobrazit položky" }).click();
  await expect(
    page.getByRole("table", { name: "Položky objednávky TRK-2026-0042", exact: true }),
  ).toContainText("200 × 100 mm");
  await page.setViewportSize({ width: 1024, height: 900 });
  const itemRow = page.locator(".production-item-row").first();
  const quantity = await itemRow.locator('[data-label="Kusů"]').boundingBox();
  const status = await itemRow.getByRole("combobox").boundingBox();
  expect(quantity && status && quantity.x + quantity.width <= status.x).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(new Set(calls.map((call) => call.kind))).toEqual(new Set(["summary", "orders"]));
  expect(calls.every((call) => call.query.get("status") === "PAID,PROCESSING")).toBe(true);
  await page.getByRole("button", { name: "Vyberte datum", exact: true }).first().click();
  await page.getByRole("gridcell", { name: "1", exact: true }).click();
  await expect
    .poll(
      () =>
        new Set(
          calls
            .filter((call) => call.query.get("createdFrom") === "2026-11-01")
            .map((call) => call.kind),
        ).size,
    )
    .toBe(2);
  await expect(page.getByText("Týmový potisk")).toBeVisible();
  await expect(page.getByRole("link", { name: "Otevřít podklad" })).toBeVisible();
  await page.getByRole("button", { name: "Výchozí filtry" }).click();
  await expect(page).toHaveURL(/\/admin\/vyroba$/);
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByText("Týmový potisk")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  const mobileStatus = itemRow.locator('[data-label="Stav výroby"]');
  await expect(mobileStatus).toHaveCSS("grid-column", "1 / -1");
  await expect(itemRow.locator('[data-label="Kusů"]')).toHaveCSS("text-align", "left");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Skrýt položky" }).click();
  await page.getByRole("button", { name: "Vyrobeno 0", exact: true }).click();
  await expect(page.getByText("V tomto stavu výroby nejsou žádné objednávky.")).toBeVisible();
  await expect(page.getByText("Týmový potisk")).toBeHidden();
  await expect(page.getByRole("table", { name: "Souhrn výroby", exact: true })).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(page.getByText("Týmový potisk")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Výrobní přehled" })).toBeVisible();
  await page.emulateMedia({ media: "screen" });
  await page.getByRole("button", { name: "Všechny 1", exact: true }).click();
  await page.getByRole("button", { name: "Zobrazit položky" }).click();
  await page.getByRole("link", { name: "Výrobní list", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Výrobní list — TRK-2026-0042" })).toBeVisible();
  await expect(page.getByText(/x=0, y=0 mm/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Vytisknout výrobní list", exact: true }),
  ).toBeEnabled();
  await page.emulateMedia({ media: "print" });
  await expect(
    page.getByRole("button", { name: "Vytisknout výrobní list", exact: true }),
  ).toBeHidden();
  await expect(page.getByRole("heading", { name: "Výrobní list — TRK-2026-0042" })).toBeVisible();
});

test("tracks internal production across reload, completion and correction", async ({ page }) => {
  let started = false;
  let itemStatus = "WAITING";
  let revision = 0;
  await page.route(/\/api\/v1\/admin\/production\/summary(?:\?.*)?$/, (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route(/\/api\/v1\/admin\/production\/orders(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: [
        {
          id: adminOrderId,
          orderNumber: "TRK-2026-0042",
          status: "PAID",
          createdAt: "2026-11-16T12:00:00Z",
          productionStatus: !started
            ? "NOT_STARTED"
            : itemStatus === "DONE"
              ? "DONE"
              : "IN_PROGRESS",
          items: [
            {
              id: "item-1",
              motif: "Bitcoin",
              isCustom: false,
              customText: "",
              productType: "Tričko",
              cut: "Pánské",
              color: "Bílá",
              size: "L",
              quantity: 2,
              productionStatus: itemStatus,
              productionRevision: revision,
              placements: [],
            },
          ],
        },
      ],
    }),
  );
  await page.route(`**/api/v1/admin/production/orders/${adminOrderId}/start`, (route) => {
    expect(route.request().headers()["x-csrftoken"]).toBe("bootstrap-token");
    started = true;
    return route.fulfill({ status: 204 });
  });
  await page.route(`**/api/v1/admin/production/orders/${adminOrderId}/items/item-1`, (route) => {
    const data = route.request().postDataJSON();
    expect(data.expectedStatus).toBe(itemStatus);
    expect(data.expectedRevision).toBe(revision);
    itemStatus = data.status;
    revision++;
    return route.fulfill({ status: 204 });
  });
  await page.goto("/admin/vyroba");
  await expect(page.getByText("Výroba: Nezahájeno")).toBeVisible();
  await page.getByRole("button", { name: "Zobrazit položky" }).click();
  const itemStatusControl = page.getByRole("combobox", { name: "Stav výroby položky Bitcoin" });
  await expect(itemStatusControl).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByText("Tiskový podklad ověřte u motivu")).toHaveCount(0);
  await page.getByRole("button", { name: "Začít pracovat" }).click();
  await expect(page.getByText("Výroba: Rozpracováno")).toBeVisible();
  await itemStatusControl.click();
  await page.getByRole("option", { name: "Vyrábím", exact: true }).click();
  await expect.poll(() => itemStatus).toBe("IN_PROGRESS");
  await page.reload();
  await page.getByRole("button", { name: "Zobrazit položky" }).click();
  await expect(itemStatusControl).toHaveText("Vyrábím");
  await itemStatusControl.click();
  await page.getByRole("option", { name: "Vyrobeno", exact: true }).click();
  await expect(page.getByText("Výroba: Vyrobeno")).toBeVisible();
  await expect(page.getByText("2 / 2 ks hotovo")).toBeVisible();
  await expect(page.getByRole("progressbar", { name: /Postup výroby objednávky/ })).toHaveAttribute(
    "aria-valuenow",
    "100",
  );
  await itemStatusControl.click();
  await page.getByRole("option", { name: "Čeká", exact: true }).click();
  await expect(page.getByText("Výroba: Rozpracováno")).toBeVisible();
});

test("creates a packet once, downloads a real PDF blob, syncs shipment independently and resends an email explicitly", async ({
  page,
}) => {
  const { state, shipment } = await mockExpedition(page);
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto(`/admin/objednavky/${adminOrderId}`);
  await page.getByRole("textbox", { name: "Hmotnost zásilky (kg)", exact: true }).fill("0,500");
  await page.getByRole("button", { name: "Vytvořit zásilku u Packety", exact: true }).click();
  await expect(page.getByText(/ID u dopravce: packet-1234/)).toBeVisible();
  expect(shipment.posts).toEqual([{ weight: "0.500" }]);
  expect(
    await page.evaluate(
      (id) => localStorage.getItem(`trikonos-shipment-attempt-v1:${id}`),
      adminOrderId,
    ),
  ).toBeNull();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Stáhnout PDF štítek", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("TRK-2026-0042-label.pdf");
  await expect.poll(() => state.order.shipmentStatus).toBe("LABEL_PRINTED");
  expect(shipment.labels).toBe(1);
  await expect(
    page.getByRole("button", { name: "Ověřit stav u Packety", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Ověřit stav u Packety", exact: true }).click();
  await expect.poll(() => shipment.syncs).toBe(1);
  expect(state.order.shipmentStatus).toBe("IN_TRANSIT");
  expect(state.order.status).toBe("PROCESSING");
  expect(state.order.paymentStatus).toBe("PENDING");
  await expect(
    page.getByRole("button", { name: "Znovu odeslat e-mail", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Znovu odeslat e-mail", exact: true }).click();
  await expect.poll(() => shipment.emails).toBe(1);
  expect(shipment.posts).toHaveLength(1);
});

test("shows the carrier's invalid-label error without pretending the PDF was downloaded", async ({
  page,
}) => {
  const { state } = await mockExpedition(page);
  state.order.carrierShipmentId = "111";
  await page.route(`**/api/v1/admin/orders/${adminOrderId}/shipment/label`, (route) =>
    route.fulfill({
      status: 502,
      json: { error: { code: "CARRIER_API_ERROR", message: "Packeta nevrátila platný štítek." } },
    }),
  );
  const downloads: string[] = [];
  page.on("download", (download) => downloads.push(download.suggestedFilename()));
  await page.goto(`/admin/objednavky/${adminOrderId}`);
  await page.getByRole("button", { name: "Stáhnout PDF štítek" }).click();
  await expect(page.getByText("Packeta nevrátila platný štítek.")).toBeVisible();
  expect(downloads).toEqual([]);
});

test("does not force unsupported distinct-recipient shipping through the backend", async ({
  page,
}) => {
  const { state, shipment } = await mockExpedition(page);
  state.order.shipping.fullName = "Petr Novák";
  await page.goto(`/admin/objednavky/${adminOrderId}`);
  await expect(page.getByText(/Současný backend předává Packetě jméno/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Vytvořit zásilku u Packety", exact: true }),
  ).toBeDisabled();
  expect(shipment.posts).toHaveLength(0);
});

test("persists an ambiguous carrier creation across refresh and reload without retrying", async ({
  page,
}) => {
  const { shipment } = await mockExpedition(page);
  shipment.lost = true;
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto(`/admin/objednavky/${adminOrderId}`);
  await page.getByRole("textbox", { name: "Hmotnost zásilky (kg)", exact: true }).fill("1");
  await page.getByRole("button", { name: "Vytvořit zásilku u Packety", exact: true }).click();
  await expect(page.getByText(/Výsledek změny není potvrzený/)).toBeVisible();
  await page.getByRole("button", { name: "Načíst aktuální stav", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Vytvořit zásilku u Packety", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Vytvořit zásilku u Packety", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText(/Ověřte ji podle čísla objednávky/)).toBeVisible();
  expect(shipment.posts).toHaveLength(1);
  const marker = await page.evaluate(
    (id) => localStorage.getItem(`trikonos-shipment-attempt-v1:${id}`),
    adminOrderId,
  );
  expect(marker).toMatch(/^\d+$/);
  expect(marker).not.toContain("jana");
});
