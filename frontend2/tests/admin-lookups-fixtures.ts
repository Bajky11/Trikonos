import type { Page } from "@playwright/test";
import type { LookupKind } from "../src/admin/lookups/api";
import { categories, options } from "./api-fixtures";

type Row = {
  id: string;
  name: string;
  position: number;
  isActive: boolean;
  slug?: string;
  hexValue?: string;
  price?: number;
  productType?: string;
  widthMm?: number;
  heightMm?: number;
};

export async function mockAdminLookups(page: Page) {
  const base = { position: 0, isActive: true };
  const rows: Record<LookupKind, Row[]> = {
    categories: categories.map((item) => ({ ...base, ...item })),
    colors: [
      ...options.colors.map((item) => ({ ...base, ...item })),
      ...Array.from({ length: 20 }, (_, index) => ({
        ...base,
        id: `extra-${index}`,
        name: `Další barva ${index + 1}`,
        hexValue: "#123456",
        position: index + 1,
      })),
    ],
    cuts: options.cuts.map((item) => ({ ...base, ...item })),
    "product-types": options.productTypes.map((item) => ({ ...base, ...item })),
    "print-areas": [],
  };
  let sequence = 100;
  await page.route(
    /\/api\/v1\/admin\/(categories|colors|cuts|product-types|print-areas)(?:\/[^/?]+)?(?:\?.*)?$/,
    (route) => {
      const url = new URL(route.request().url());
      const parts = url.pathname.split("/");
      const kind = parts[4] as LookupKind;
      const id = parts[5];
      const method = route.request().method();
      if (method === "DELETE") {
        if (kind === "categories" && id === categories[0]!.id)
          return route.fulfill({
            status: 409,
            json: { error: { code: "IN_USE", message: "In use" } },
          });
        rows[kind] = rows[kind].filter((row) => row.id !== id);
        return route.fulfill({ status: 204 });
      }
      if (method === "POST" || method === "PATCH") {
        const data = route.request().postDataJSON() as Omit<Row, "id">;
        if (
          rows[kind].some(
            (row) =>
              row.id !== id &&
              row.name === data.name &&
              (kind !== "print-areas" || row.productType === data.productType),
          )
        ) {
          return route.fulfill({
            status: 400,
            json: {
              error: {
                code: "VALIDATION_ERROR",
                message: "Položka už existuje.",
                fields: { name: ["Tento název už existuje."] },
              },
            },
          });
        }
        if (kind === "categories" && !data.slug) data.slug = "unexpected-regenerated-slug";
        if (data.hexValue) data.hexValue = data.hexValue.toUpperCase();
        if (id) {
          const row = rows[kind].find((row) => row.id === id)!;
          Object.assign(row, data);
          return route.fulfill({ json: row });
        }
        const row = {
          ...base,
          ...data,
          id: `30000000-0000-0000-0000-${String(sequence++).padStart(12, "0")}`,
        };
        rows[kind].push(row);
        return route.fulfill({ status: 201, json: row });
      }
      const params = url.searchParams;
      const filtered = rows[kind]
        .filter(
          (row) =>
            (!params.get("q") || row.name.toLowerCase().includes(params.get("q")!.toLowerCase())) &&
            (!params.has("isActive") || row.isActive === (params.get("isActive") === "true")) &&
            (!params.get("productType") || row.productType === params.get("productType")),
        )
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
      const current = Number(params.get("page") ?? 1);
      // Keep lookup loading multi-page even when the caller requests pageSize=100.
      const size = Math.min(Number(params.get("pageSize") ?? 20), 20);
      return route.fulfill({
        json: {
          count: filtered.length,
          results: filtered.slice((current - 1) * size, current * size),
          next:
            current * size < filtered.length
              ? `${url.origin}${url.pathname}?page=${current + 1}`
              : null,
          previous: null,
        },
      });
    },
  );
  await page.route("**/api/v1/catalog/options", (route) =>
    route.fulfill({
      json: {
        ...options,
        colors: rows.colors.filter((item) => item.isActive),
        cuts: rows.cuts.filter((item) => item.isActive),
        productTypes: rows["product-types"]
          .filter((item) => item.isActive)
          .map((item) => ({
            ...item,
            printAreas: rows["print-areas"].filter(
              (area) => area.isActive && area.productType === item.id,
            ),
          })),
      },
    }),
  );
}
