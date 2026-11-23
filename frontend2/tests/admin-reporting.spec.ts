import { expect, test } from "@playwright/test";
import { mockAuthApi, mockStoreApi } from "./api-fixtures";
import { adminOrderId } from "./admin-orders-fixtures";

test("uses real dashboard data and downloads Excel with the current filters", async ({ page }) => {
  await mockStoreApi(page);
  await mockAuthApi(page, true);
  await page.route("**/api/v1/admin/dashboard", (route) =>
    route.fulfill({
      json: {
        ordersToday: 2,
        ordersYesterday: 1,
        revenueToday: 34500,
        revenueYesterday: 10000,
        newCustomers7d: 3,
        pendingQuotes: 4,
        ordersToProcess: 5,
        unpaidInvoices: 6,
        recentOrders: [
          {
            id: adminOrderId,
            orderNumber: "TEST_TRK-2026-0042",
            customerName: "Jana",
            status: "NEW",
            createdAt: "2026-11-23T12:00:00Z",
            total: null,
          },
        ],
      },
    }),
  );
  await page.route("**/api/v1/admin/stats/**", (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/v1\/admin\/orders\?/, (route) =>
    route.fulfill({ json: { results: [], count: 40 } }),
  );
  await page.route("**/api/v1/admin/orders/export?*", (route) => {
    const query = new URL(route.request().url()).searchParams;
    expect(query.get("status")).toBe("NEW");
    expect(query.has("page")).toBe(false);
    return route.fulfill({
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      body: "mock Excel download",
    });
  });
  await page.goto("/admin");
  await expect(page.getByRole("link", { name: "TEST_TRK-2026-0042" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Docházejí skladem" })).toHaveCount(0);
  await page.goto("/admin/objednavky?status=NEW&page=2");
  page.once("dialog", (dialog) => void dialog.accept());
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportovat do Excelu" }).click();
  expect((await download).suggestedFilename()).toBe("objednavky.xlsx");
});

test("keeps the storefront cart within the viewport and wraps the admin navigation", async ({
  page,
}) => {
  await mockStoreApi(page);
  await mockAuthApi(page, true);
  for (const width of [375, 768]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    await expect(page.getByRole("button", { name: /Košík, počet/ })).toBeInViewport({ ratio: 1 });
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await expect(page.getByRole("navigation", { name: "Mobilní navigace" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.goto("/admin/sezony");
    await expect(page.getByRole("link", { name: "Svoz Packety" })).toBeInViewport({ ratio: 1 });
    expect(
      await page.locator(".admin-header").evaluate((node) => node.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
});

test("submits a courier batch once and surfaces an uncertain result", async ({ page }) => {
  await mockStoreApi(page);
  await mockAuthApi(page, true);
  await page.route("**/api/v1/admin/packeta-config", (route) =>
    route.fulfill({ json: { apiPasswordSet: true, pickupAddressId: "77" } }),
  );
  let posts = 0;
  await page.route(/\/api\/v1\/admin\/orders\?/, (route) => {
    const query = new URL(route.request().url()).searchParams;
    expect(query.get("pickupEligible")).toBe("true");
    return route.fulfill({
      json: {
        count: 1,
        results: [{ id: adminOrderId, orderNumber: "TRK-TEST-1", customerName: "Jana" }],
      },
    });
  });
  await page.route("**/api/v1/admin/courier-pickups", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [] });
    posts++;
    expect(route.request().headers()["x-csrftoken"]).toBe("bootstrap-token");
    expect(route.request().postDataJSON().orderIds).toEqual([adminOrderId]);
    return route.fulfill({ status: 502, json: { error: { message: "Výsledek není potvrzený." } } });
  });
  page.once("dialog", (dialog) => void dialog.accept());
  await page.goto("/admin/svoz");
  await page.getByRole("checkbox", { name: /TRK-TEST-1/ }).check();
  await page.getByLabel("Svoz od").fill("2099-01-01T10:00");
  await page.getByLabel("Svoz do").fill("2099-01-01T11:00");
  await page.getByRole("button", { name: "Objednat svoz", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("svoz neopakujte");
  await expect(page.getByRole("button", { name: "Objednat svoz", exact: true })).toBeDisabled();
  expect(posts).toBe(1);
});
