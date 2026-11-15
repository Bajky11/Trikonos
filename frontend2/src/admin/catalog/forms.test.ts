import { expect, it } from "vite-plus/test";
import { parsePrice } from "./forms";

it("converts monetary input to exact haléře without accepting invalid precision or overflow", () => {
  expect(parsePrice("499,90")).toBe(49990);
  expect(parsePrice("0.29")).toBe(29);
  expect(parsePrice("0")).toBe(0);
  expect(parsePrice("1.001")).toBeNull();
  expect(parsePrice("-1")).toBeNull();
  expect(parsePrice("21474836.48")).toBeNull();
});
