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
  await page.route(
    /\/api\/v1\/admin\/production\/(summary|placements)(?:\?.*)?$/,
    async (route) => {
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
                  orderNumber: "TRK-2026-0042",
                  itemLabel: "Vlastní týmový potisk",
                  printArea: "Přední strana",
                  width: 200,
                  height: 100,
                  rotationDeg: 0,
                  url: "/media/designs/team.png",
                },
              ],
      });
    },
  );
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
  await page.goto("/admin/vyroba");
  await expect(page.getByRole("alert")).toContainText("Souhrn výroby");
  await expect(
    page.getByRole("button", { name: "Vytisknout výrobní přehled", exact: true }),
  ).toBeDisabled();
  summaryFailed = false;
  await page.getByRole("button", { name: "Zkusit znovu", exact: true }).click();
  await expect(page.getByRole("table", { name: "Souhrn výroby", exact: true })).toBeVisible();
  await expect(page.getByRole("table", { name: "Výrobní podklady", exact: true })).toContainText(
    "200 × 100 mm",
  );
  expect(new Set(calls.map((call) => call.kind))).toEqual(new Set(["summary", "placements"]));
  expect(calls.every((call) => call.query.get("status") === "PAID,PROCESSING")).toBe(true);
  await page.getByLabel("Vytvořeno od", { exact: true }).fill("2026-11-01");
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
  await page.getByRole("combobox", { name: "Tisková plocha (jen podklady)" }).click();
  await page.getByRole("option", { name: "Přední strana", exact: true }).click();
  await expect
    .poll(() => calls.at(-1)?.query.get("printArea"))
    .toBe("80000000-0000-0000-0000-000000000005");
  const summaries = calls.filter((call) => call.kind === "summary");
  expect(summaries.every((call) => !call.query.has("printArea"))).toBe(true);
  await page.getByRole("link", { name: "TRK-2026-0042", exact: true }).click();
  await page.getByRole("link", { name: "TRK-2026-0042", exact: true }).click();
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
