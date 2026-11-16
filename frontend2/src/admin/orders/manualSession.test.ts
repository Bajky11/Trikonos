import { afterEach, expect, it, vi } from "vite-plus/test";
import { clearManual, manualOrderKey, readManual, storeManual } from "./manualSession";
import type { OrderCreate } from "../../api/generated/models";

afterEach(() => vi.unstubAllGlobals());
it("keeps an immutable attempt and replaces personal payload with a minimal created record", () => {
  const map = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => map.set(key, value),
    removeItem: (key: string) => map.delete(key),
  });
  const body = {
    orderId: "attempt-id",
    customer: { email: "private@example.cz" },
    items: [],
  } as unknown as OrderCreate;
  storeManual({ kind: "pending", actorId: "admin", body });
  expect(readManual()).toEqual({ kind: "pending", actorId: "admin", body });
  storeManual({ kind: "created", actorId: "admin", id: "attempt-id" });
  expect(map.get(manualOrderKey)).not.toContain("private@example.cz");
  clearManual();
  expect(readManual()).toBeNull();
  vi.stubGlobal("sessionStorage", {
    getItem: () => null,
    setItem: () => {
      throw new Error("blocked");
    },
  });
  expect(() => storeManual({ kind: "pending", actorId: "admin", body })).toThrow("blocked");
});
