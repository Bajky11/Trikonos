import type { Page } from "@playwright/test";
import type { ConfigResponse, CatalogOptionsResponse, Me } from "../src/api/generated/models";

export const admin: Me = { id: "admin-id", email: "admin@example.com", name: "Test Admin" };

export async function mockAuthApi(page: Page, authenticated = false) {
  let active = authenticated;
  await page.route("**/api/v1/admin/auth/me", (route) =>
    route.fulfill(
      active
        ? { json: admin }
        : { status: 403, json: { error: { code: "AUTHENTICATION_REQUIRED" } } },
    ),
  );
  await page.route("**/api/v1/admin/auth/csrf", (route) =>
    route.fulfill({
      status: 204,
      headers: { "X-CSRFToken": "bootstrap-token", "Access-Control-Expose-Headers": "X-CSRFToken" },
    }),
  );
  await page.route("**/api/v1/admin/auth/login", (route) => {
    active = true;
    return route.fulfill({
      json: admin,
      headers: { "X-CSRFToken": "rotated-token", "Access-Control-Expose-Headers": "X-CSRFToken" },
    });
  });
  await page.route("**/api/v1/admin/auth/logout", (route) => {
    active = false;
    return route.fulfill({ status: 204 });
  });
  return {
    setAuthenticated(value: boolean) {
      active = value;
    },
  };
}

export const config: ConfigResponse = {
  shopName: "Trikonoš",
  contactEmail: "test@example.com",
  contactPhone: "",
  instagramUrl: "",
  bankAccount: "",
  topbarText: "",
  paymentMethods: [],
  deliveryTypes: [],
};

export const options: CatalogOptionsResponse = {
  productTypes: [],
  cuts: [],
  colors: [],
  sizes: [],
  carriers: [],
};

export async function mockStoreApi(page: Page) {
  await mockAuthApi(page);
  await page.route("**/api/v1/config", (route) => route.fulfill({ json: config }));
  await page.route("**/api/v1/catalog/options", (route) => route.fulfill({ json: options }));
}
