import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { cartStorageKey, loadCart, validCartItem } from "./storage";

afterEach(() => vi.unstubAllGlobals());

describe("cart storage", () => {
  it("restores real catalog IDs and minor-unit price snapshots", () => {
    const item = {
      kind: "catalog",
      motifId: "10000000-0000-0000-0000-000000000001",
      productTypeId: "00000000-0000-0000-0000-000000000001",
      cutId: "00000000-0000-0000-0000-000000000002",
      colorId: "00000000-0000-0000-0000-000000000003",
      name: "Motiv",
      size: "L",
      quantity: 2,
      unitPrice: 69900,
    };
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => (key === cartStorageKey ? JSON.stringify([item]) : null),
    });
    expect(loadCart()).toEqual([item]);
    expect(validCartItem({ ...item, motifId: "fake-demo-id" })).toBe(false);
    expect(validCartItem({ ...item, unitPrice: 699.5 })).toBe(false);
  });

  it("preserves legacy custom drafts but drops old demo catalog items", () => {
    const draft = {
      id: "custom-print",
      name: "Vlastní potisk",
      type: "male",
      size: "M",
      color: "Bílá",
      quantity: 1,
      price: 456,
    };
    vi.stubGlobal("localStorage", {
      getItem: (key: string) =>
        key === cartStorageKey ? null : JSON.stringify([draft, { ...draft, id: "bitcoin-1" }]),
    });
    expect(loadCart()).toEqual([draft]);
  });
});
