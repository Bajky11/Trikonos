import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { cartStorageKey, loadCart, validCartItem } from "./storage";
import type { CustomCartItem } from "./storage";
import { validationLines } from "./validation";

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
  it("persists uploaded design metadata, maps mm and fileToken, and retains expired drafts without sending them", () => {
    const item: CustomCartItem = {
      kind: "custom",
      name: "Můj podklad",
      productTypeId: "00000000-0000-0000-0000-000000000001",
      cutId: "00000000-0000-0000-0000-000000000002",
      colorId: "00000000-0000-0000-0000-000000000003",
      size: "M",
      quantity: 1,
      upload: {
        fileToken: "signed-token",
        url: "/media/designs/test.png",
        fileName: "test.png",
        mimeType: "image/png",
        widthPx: 200,
        heightPx: 100,
        uploadedAt: Date.now(),
      },
      placement: {
        printAreaId: "00000000-0000-0000-0000-000000000004",
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        rotationDeg: 0,
      },
      areaWidthMm: 300,
      areaHeightMm: 400,
    };
    expect(validCartItem(item)).toBe(true);
    expect(validationLines([item])[0]?.input?.placements).toEqual([
      { ...item.placement, fileToken: "signed-token" },
    ]);
    expect(validationLines([item])[0]?.input).not.toHaveProperty("unitPrice");
    expect(
      validCartItem({ ...item, upload: { ...item.upload, url: "data:image/png;base64,large" } }),
    ).toBe(false);
    expect(validCartItem({ ...item, placement: { ...item.placement, x: 299 } })).toBe(false);
    const expired = { ...item, upload: { ...item.upload, uploadedAt: Date.now() - 8 * 86400000 } };
    expect(validCartItem(expired)).toBe(true);
    expect(validationLines([expired])[0]?.input).toBeNull();
    expect(validationLines([expired])[0]?.localError).toContain("vypršela");
  });
});
