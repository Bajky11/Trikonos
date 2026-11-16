import { expect, it } from "vite-plus/test";
import { catalogLines } from "./validation";
import type { CatalogCartItem } from "./storage";

it("sends only catalog IDs and quantities, never snapshot prices or custom drafts", () => {
  const item: CatalogCartItem = {
    kind: "catalog",
    motifId: "motif",
    productTypeId: "type",
    cutId: "cut",
    colorId: "color",
    size: "M",
    name: "Snapshot",
    quantity: 2,
    unitPrice: 1,
  };
  const lines = catalogLines([
    {
      id: "custom-print",
      name: "Návrh",
      type: "male",
      color: "Bílá",
      size: "M",
      price: 123,
      quantity: 1,
    },
    item,
    { ...item, size: "obsolete" },
  ]);
  expect(lines.map((line) => line.index)).toEqual([1, 2]);
  expect(lines[0]?.input).toEqual({
    isCustom: false,
    motifId: "motif",
    productTypeId: "type",
    cutId: "cut",
    colorId: "color",
    size: "M",
    quantity: 2,
  });
  expect(lines[1]?.input).toBeNull();
});
