import { afterEach, expect, it, vi } from "vite-plus/test";
import {
  clearShipmentAttempt,
  hasShipmentAttempt,
  shipmentAttemptKey,
  startShipmentAttempt,
} from "./shipmentAttempt";

afterEach(() => vi.unstubAllGlobals());

it("keeps ambiguous shipment attempts until verified and refuses a retry or unavailable storage", () => {
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  });
  startShipmentAttempt("order-id");
  expect(hasShipmentAttempt("order-id")).toBe(true);
  expect(stored.get(shipmentAttemptKey("order-id"))).toMatch(/^\d+$/);
  expect(() => startShipmentAttempt("order-id")).toThrow("Nejprve ověřte");
  clearShipmentAttempt("order-id");
  expect(hasShipmentAttempt("order-id")).toBe(false);
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: () => {
      throw new Error("Storage blocked");
    },
  });
  expect(() => startShipmentAttempt("order-id")).toThrow("Storage blocked");
});
