import { afterEach, expect, it, vi } from "vite-plus/test";
import type { OrderCreate } from "../api/generated/models";
import { DeliveryTypeEnum, PaymentMethodEnum } from "../api/generated/models";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("keeps the exact pending request through reload, replaces personal data with a receipt and refuses unsafe terms URLs", async () => {
  const store = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  });
  vi.stubGlobal("window", { location: { origin: "https://shop.example" } });
  const session = await import("./session");
  const body: OrderCreate = {
    orderId: "50000000-0000-0000-0000-000000000001",
    customer: { email: "private@example.cz" },
    billing: { fullName: "Jana", street: "Soukromá 1", city: "Praha", zip: "11000" },
    shipping: { sameAsBilling: true },
    delivery: { deliveryType: DeliveryTypeEnum.PERSONAL_PICKUP },
    paymentMethod: PaymentMethodEnum.BANK_TRANSFER,
    termsAccepted: true,
    items: [],
  };
  session.saveAttempt({
    kind: "pending",
    body,
    createdAt: Date.now(),
    cartKey: "[]",
    uncertain: false,
  });
  vi.resetModules();
  const reloaded = await import("./session");
  const pending = reloaded.readCheckout();
  expect(pending?.kind).toBe("pending");
  if (pending?.kind !== "pending") throw new Error("Missing attempt");
  expect(pending.uncertain).toBe(true);
  expect(pending.body).toEqual(body);
  reloaded.rememberAccessToken("email-token");
  expect(reloaded.readCheckout()?.kind).toBe("pending");
  reloaded.rememberReceipt({
    kind: "receipt",
    cartKey: "[]",
    createdAt: Date.now(),
    response: {
      orderNumber: "TRK-1",
      accessToken: "secret",
      status: "NEW",
      requiresQuote: false,
      subtotal: 0,
      shippingCost: 0,
      total: 0,
      currency: "CZK",
      items: [],
    },
  });
  expect(store.get(session.checkoutSessionKey)).not.toContain("private@example.cz");
  expect(store.get(session.checkoutSessionKey)).not.toContain("Soukromá");
  expect(reloaded.readAccessToken()).toBe("");
  expect(reloaded.safeTermsUrl("javascript:alert(1)")).toBe("");
  expect(reloaded.safeTermsUrl("")).toBe("");
  expect(reloaded.safeTermsUrl("/terms.pdf")).toBe("https://shop.example/terms.pdf");
  reloaded.clearCheckout();
  expect(reloaded.readCheckout()).toBeNull();
  vi.stubGlobal("sessionStorage", {
    getItem: () => null,
    setItem: () => {
      throw new Error("Storage blocked");
    },
  });
  expect(() =>
    reloaded.saveAttempt({
      kind: "pending",
      body,
      createdAt: Date.now(),
      cartKey: "[]",
      uncertain: false,
    }),
  ).toThrow("Storage blocked");
  expect(reloaded.readCheckout()).toBeNull();
});
