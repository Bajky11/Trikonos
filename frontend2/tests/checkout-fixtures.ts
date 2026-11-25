import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import type {
  ConfigResponse,
  OrderCreate,
  OrderCreateResponse,
  OrderCustomerDetail,
} from "../src/api/generated/models";
import { config, options, motifs } from "./api-fixtures";

export const carrierId = "50000000-0000-0000-0000-000000000001";
export const checkoutCatalog = {
  kind: "catalog",
  motifId: motifs[0]!.id,
  productTypeId: options.productTypes[0]!.id,
  cutId: options.cuts[0]!.id,
  colorId: options.colors[0]!.id,
  size: "L",
  quantity: 1,
  name: "Katalogový motiv",
  unitPrice: 69900,
};
export const checkoutCustom = {
  kind: "custom",
  name: "Vlastní návrh",
  productTypeId: options.productTypes[0]!.id,
  cutId: options.cuts[0]!.id,
  colorId: options.colors[0]!.id,
  size: "L",
  quantity: 1,
  upload: {
    fileToken: "test-file-token",
    url: "/media/designs/test.png",
    fileName: "design.png",
    mimeType: "image/png",
    widthPx: 200,
    heightPx: 100,
    uploadedAt: Date.now(),
  },
  placement: {
    printAreaId: "50000000-0000-0000-0000-000000000002",
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    rotationDeg: 0,
  },
  areaWidthMm: 300,
  areaHeightMm: 400,
};

export async function mockCheckout(page: Page) {
  const state = {
    termsReady: true,
    packetaHomeDelivery: undefined as ConfigResponse["packetaHomeDelivery"],
    carriers: [{ id: carrierId, name: "Packeta", code: "PACKETA" }],
    price: 69900,
    shippingKnown: true,
    failFirstOrder: false,
    posts: [] as OrderCreate[],
    created: new Map<string, { response: OrderCreateResponse; body: OrderCreate }>(),
  };
  await page.route("**/api/v1/config", (route) =>
    route.fulfill({
      json: {
        ...config,
        packetaHomeDelivery: state.packetaHomeDelivery,
        termsUrl: state.termsReady ? "https://shop.example/terms" : "",
        paymentMethods: [
          { value: "BANK_TRANSFER", label: "Převodem" },
          { value: "CASH_ON_DELIVERY", label: "Dobírkou" },
          { value: "INVOICE", label: "Faktura se splatností" },
        ],
        deliveryTypes: [
          { value: "PERSONAL_PICKUP", label: "Osobní odběr" },
          { value: "HOME_DELIVERY", label: "Na adresu" },
          { value: "PICKUP_POINT", label: "Výdejní místo" },
        ],
      },
    }),
  );
  await page.route("**/api/v1/catalog/options", (route) =>
    route.fulfill({
      json: { ...options, carriers: state.carriers },
    }),
  );
  await page.route("**/api/v1/cart/validate", (route) => {
    const body = route.request().postDataJSON();
    const requiresQuote = body.items.some((item: { isCustom?: boolean }) => item.isCustom);
    const shippingCost =
      body.deliveryType === "PERSONAL_PICKUP"
        ? 0
        : !body.deliveryType || !state.shippingKnown
          ? null
          : 7900 + (body.paymentMethod === "CASH_ON_DELIVERY" ? 1000 : 0);
    const items = body.items.map((item: { isCustom?: boolean; quantity: number }) => ({
      valid: true,
      errors: [],
      itemLabel: item.isCustom ? "Vlastní potisk" : "Katalogový motiv",
      unitPrice: item.isCustom ? null : state.price,
      lineTotal: item.isCustom ? null : state.price * item.quantity,
    }));
    const subtotal = requiresQuote
      ? null
      : items.reduce((sum: number, item: { lineTotal: number }) => sum + item.lineTotal, 0);
    return route.fulfill({
      json: {
        items,
        subtotal,
        shippingCost,
        total: subtotal === null || shippingCost === null ? null : subtotal + shippingCost,
        requiresQuote,
      },
    });
  });
  await page.route("**/api/v1/orders", (route) => {
    const body = route.request().postDataJSON() as OrderCreate;
    state.posts.push(body);
    const prior = state.created.get(body.orderId!);
    if (prior) return route.fulfill({ status: 201, json: prior.response });
    const requiresQuote = body.items.some((item) => item.isCustom);
    const response: OrderCreateResponse = {
      orderNumber: "TRK-2026-000123",
      status: requiresQuote ? "QUOTE_REQUESTED" : "NEW",
      accessToken: "receipt-secret-token",
      requiresQuote,
      items: body.items.map((item) => ({
        itemLabel: item.isCustom ? "Vlastní potisk" : "Katalogový motiv",
        quantity: item.quantity,
        unitPrice: item.isCustom ? null : state.price,
      })),
      subtotal: requiresQuote
        ? null
        : state.price * body.items.reduce((sum, item) => sum + item.quantity, 0),
      shippingCost: body.expectedShippingCost ?? 0,
      total: body.expectedTotal ?? null,
      currency: "CZK",
    };
    state.created.set(body.orderId!, { response, body });
    if (state.failFirstOrder) {
      state.failFirstOrder = false;
      return route.fulfill({ status: 503, json: {} });
    }
    return route.fulfill({ status: 201, json: response });
  });
  await page.route("**/api/v1/orders/access/*", (route) => {
    expect(route.request().headers()["referer"]).toBeUndefined();
    if (!route.request().url().endsWith("/receipt-secret-token"))
      return route.fulfill({ status: 404, json: {} });
    const saved = [...state.created.values()][0]!;
    const { response, body } = saved;
    const billing = {
      ...body.billing,
      companyName: body.billing.companyName ?? "",
      country: body.billing.country ?? "CZ",
    };
    const detail: OrderCustomerDetail = {
      ...response,
      statusLabel: response.status,
      paymentStatus: "PENDING",
      paymentMethod: body.paymentMethod,
      deliveryType: body.delivery.deliveryType,
      carrierName: body.delivery.carrierId ? "Packeta" : null,
      pickupPointName: body.delivery.pickupPointName ?? "",
      trackingNumber: "",
      billing,
      shipping: body.shipping.sameAsBilling
        ? billing
        : {
            fullName: body.shipping.fullName!,
            companyName: body.shipping.companyName ?? "",
            street: body.shipping.street!,
            city: body.shipping.city!,
            zip: body.shipping.zip!,
            country: "CZ",
          },
      items: response.items.map((item) => ({ ...item, customText: "", placements: [] })),
      paymentInstructions:
        body.paymentMethod === "BANK_TRANSFER" && response.total !== null
          ? { bankAccount: "123456789/0100", amount: response.total, variableSymbol: "2026000123" }
          : null,
    };
    return route.fulfill({ json: detail, headers: { "Cache-Control": "no-store" } });
  });
  return state;
}
