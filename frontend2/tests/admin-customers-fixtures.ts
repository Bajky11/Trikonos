import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { AdminCustomerDetail, PatchedAdminCustomerUpdate } from "../src/api/generated/models";
import { adminOrderId } from "./admin-orders-fixtures";

export const customerId = "80000000-0000-0000-0000-000000000003";
type MutableCustomer = { -readonly [Key in keyof AdminCustomerDetail]: AdminCustomerDetail[Key] };

export async function mockCustomers(page: Page) {
  const customer: MutableCustomer = {
    id: customerId,
    email: "jana@example.cz",
    phone: "777123456",
    firstName: "Jana",
    lastName: "Nováková",
    companyName: "Firma s.r.o.",
    marketingConsent: false,
    note: "",
    createdAt: "2026-11-16T10:00:00Z",
    ordersCount: 2,
    totalSpent: 69900,
    lastOrderAt: "2026-11-16T10:00:00Z",
    orders: [
      {
        id: adminOrderId,
        orderNumber: "TRK-2026-0042",
        status: "QUOTE_REQUESTED",
        total: null,
        currency: "CZK",
        createdAt: "2026-11-16T10:00:00Z",
      },
      {
        id: "80000000-0000-0000-0000-000000000099",
        orderNumber: "TRK-2026-0041",
        status: "CANCELLED",
        total: 69900,
        currency: "CZK",
        createdAt: "2026-11-15T10:00:00Z",
      },
    ],
  };
  const state = {
    customer,
    listFailed: false,
    exportFailed: false,
    loseResponse: false,
    updates: [] as PatchedAdminCustomerUpdate[],
    lists: [] as URLSearchParams[],
    exports: [] as URLSearchParams[],
  };
  await page.route(/\/api\/v1\/admin\/customers(?:\?.*)?$/, (route) => {
    const params = new URL(route.request().url()).searchParams;
    state.lists.push(params);
    if (state.listFailed) return route.fulfill({ status: 503, json: {} });
    const q = params.get("q")?.toLowerCase();
    const consent = params.get("marketingConsent");
    const match =
      (!q ||
        [
          customer.email,
          customer.phone,
          customer.firstName,
          customer.lastName,
          customer.companyName,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q)) &&
      (!consent || (consent === "true") === customer.marketingConsent);
    return route.fulfill({
      json: {
        count: match ? 21 : 0,
        results: match ? [customer] : [],
        next:
          match && params.get("page") !== "2"
            ? "http://localhost:8000/api/v1/admin/customers?page=2"
            : null,
        previous: null,
      },
    });
  });
  await page.route(`**/api/v1/admin/customers/${customerId}`, (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: customer });
    expect(route.request().headers()["x-csrftoken"]).toBe("bootstrap-token");
    const body = route.request().postDataJSON() as PatchedAdminCustomerUpdate;
    state.updates.push(body);
    if (body.email === "taken@example.cz")
      return route.fulfill({ status: 409, json: { error: { code: "EMAIL_TAKEN" } } });
    Object.assign(customer, body);
    if (state.loseResponse) {
      state.loseResponse = false;
      return route.fulfill({ status: 503, json: {} });
    }
    return route.fulfill({ json: customer });
  });
  await page.route(/\/api\/v1\/admin\/customers\/export-consents(?:\?.*)?$/, (route) => {
    state.exports.push(new URL(route.request().url()).searchParams);
    expect(route.request().headers()["accept"]).toBe("*/*");
    if (state.exportFailed) return route.fulfill({ status: 503, json: {} });
    return route.fulfill({
      contentType: "text/csv",
      body: `email\r\nnewsletter@example.cz\r\n${customer.marketingConsent ? `${customer.email}\r\n` : ""}`,
    });
  });
  return state;
}
