import { describe, expect, it } from "vite-plus/test";
import { filterProducts, products, stripProducts } from "./catalog";

describe("local demo catalog", () => {
  it("preserves imported products and all 192 demo products", () => {
    expect(products).toHaveLength(200);
    expect(new Set(products.map((product) => product.id)).size).toBe(200);
  });
  it("filters categories and bestseller flags", () => {
    expect(filterProducts("bitcoin")).toHaveLength(16);
    expect(filterProducts("top")).toHaveLength(48);
    expect(filterProducts("missing")).toEqual([]);
  });
  it("shows eight evenly sampled products on the home page", () => {
    expect(stripProducts("all").every((product) => product.imported)).toBe(true);
    expect(stripProducts("retro")).toHaveLength(8);
    expect(stripProducts("retro").every((product) => product.category === "retro")).toBe(true);
    expect(stripProducts("missing")).toEqual([]);
  });
});
