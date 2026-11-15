import type { Page } from "@playwright/test";
import type { ConfigResponse, CatalogOptionsResponse } from "../src/api/generated/models";

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
  await page.route("**/api/v1/config", (route) => route.fulfill({ json: config }));
  await page.route("**/api/v1/catalog/options", (route) => route.fulfill({ json: options }));
}
