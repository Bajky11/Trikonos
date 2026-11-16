import type { OrderCreate, OrderCreateResponse } from "../api/generated/models";

export type Attempt = {
  kind: "pending";
  body: OrderCreate;
  cartKey: string;
  createdAt: number;
  uncertain: boolean;
};
export type Receipt = {
  kind: "receipt";
  response: OrderCreateResponse;
  cartKey: string;
  createdAt: number;
};
type CheckoutRecord = Attempt | Receipt;
export const checkoutSessionKey = "trikonos-checkout-v1";
let fallback: CheckoutRecord | null = null;
const accessKey = "trikonos-order-access-v1";
let accessFallback: string | null = null;

export function rememberAccessToken(token: string) {
  accessFallback = token;
  try {
    sessionStorage.setItem(accessKey, token);
  } catch {
    /* Can still display this link in memory. */
  }
}
export function readAccessToken() {
  if (accessFallback !== null) return accessFallback;
  try {
    return sessionStorage.getItem(accessKey) ?? "";
  } catch {
    return "";
  }
}

export function readCheckout(): CheckoutRecord | null {
  if (fallback) return fallback;
  try {
    const value = JSON.parse(
      sessionStorage.getItem(checkoutSessionKey) ?? "null",
    ) as CheckoutRecord | null;
    if (!value || typeof value.cartKey !== "string" || !Number.isFinite(value.createdAt))
      return null;
    if (
      value.kind === "pending" &&
      typeof value.body?.orderId === "string" &&
      Array.isArray(value.body.items)
    )
      return { ...value, uncertain: true };
    if (
      value.kind === "receipt" &&
      typeof value.response?.accessToken === "string" &&
      typeof value.response.orderNumber === "string"
    )
      return value;
  } catch {
    /* Unavailable/corrupt storage must not crash the storefront. */
  }
  return null;
}

export function saveAttempt(attempt: Attempt) {
  // Must succeed BEFORE sending: a reload must retain the idempotency key/body.
  sessionStorage.setItem(checkoutSessionKey, JSON.stringify(attempt));
  fallback = attempt;
}
export function rememberReceipt(receipt: Receipt) {
  fallback = receipt;
  accessFallback = "";
  try {
    sessionStorage.removeItem(accessKey);
  } catch {
    /* The current receipt takes priority in memory. */
  }
  try {
    sessionStorage.setItem(checkoutSessionKey, JSON.stringify(receipt));
    return true;
  } catch {
    return false;
  } // Keep the old pending record on disk: a retry reuses its orderId.
}
export function clearCheckout() {
  sessionStorage.removeItem(checkoutSessionKey);
  fallback = null;
}
export function safeTermsUrl(value: string | undefined) {
  if (!value?.trim()) return "";
  try {
    const url = new URL(value, window.location.origin);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}
