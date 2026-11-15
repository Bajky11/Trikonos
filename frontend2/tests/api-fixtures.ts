import type { Page } from "@playwright/test";
import type {
  ConfigResponse,
  CatalogOptionsResponse,
  Me,
  MotifList,
  MotifDetail,
  Category,
} from "../src/api/generated/models";

export const admin: Me = { id: "admin-id", email: "admin@example.com", name: "Test Admin" };

export async function mockAuthApi(page: Page, authenticated = false) {
  let active = authenticated;
  await page.route("**/api/v1/admin/auth/me", (route) =>
    route.fulfill(
      active
        ? { json: admin }
        : { status: 403, json: { error: { code: "AUTHENTICATION_REQUIRED" } } },
    ),
  );
  await page.route("**/api/v1/admin/auth/csrf", (route) =>
    route.fulfill({
      status: 204,
      headers: { "X-CSRFToken": "bootstrap-token", "Access-Control-Expose-Headers": "X-CSRFToken" },
    }),
  );
  await page.route("**/api/v1/admin/auth/login", (route) => {
    active = true;
    return route.fulfill({
      json: admin,
      headers: { "X-CSRFToken": "rotated-token", "Access-Control-Expose-Headers": "X-CSRFToken" },
    });
  });
  await page.route("**/api/v1/admin/auth/logout", (route) => {
    active = false;
    return route.fulfill({ status: 204 });
  });
  return {
    setAuthenticated(value: boolean) {
      active = value;
    },
  };
}

export const config: ConfigResponse = {
  shopName: "Trikonoš",
  contactEmail: "test@example.com",
  contactPhone: "",
  instagramUrl: "",
  bankAccount: "",
  topbarText: "",
  paymentMethods: [],
  deliveryTypes: [],
};

export const options: CatalogOptionsResponse = {
  productTypes: [
    { id: "00000000-0000-0000-0000-000000000001", name: "Tričko", price: 10000, printAreas: [] },
  ],
  cuts: [{ id: "00000000-0000-0000-0000-000000000002", name: "Pánské" }],
  colors: [
    { id: "00000000-0000-0000-0000-000000000003", name: "Bílá", hexValue: "#ffffff" },
    { id: "00000000-0000-0000-0000-000000000004", name: "Černá", hexValue: "#000000" },
  ],
  sizes: [
    { value: "M", label: "M" },
    { value: "L", label: "L" },
  ],
  carriers: [],
};

export const categories: Category[] = [
  {
    id: "00000000-0000-0000-0000-000000000010",
    name: "Bitcoin",
    slug: "bitcoin",
    position: 0,
    motifCount: 13,
  },
  {
    id: "00000000-0000-0000-0000-000000000011",
    name: "Retro",
    slug: "retro",
    position: 1,
    motifCount: 1,
  },
];
export const motifs: MotifList[] = Array.from({ length: 14 }, (_, index) => ({
  id: `10000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`,
  slug: `motiv-${index + 1}`,
  name: `Motiv ${index + 1}`,
  price: 59900,
  currency: "CZK",
  mainImage: null,
  category: { name: index < 13 ? "Bitcoin" : "Retro", slug: index < 13 ? "bitcoin" : "retro" },
}));

async function mockCatalogApi(page: Page) {
  await page.route("**/api/v1/categories", (route) => route.fulfill({ json: categories }));
  await page.route(/\/api\/v1\/motifs(?:\?.*)?$/, (route) => {
    const url = new URL(route.request().url());
    const category = url.searchParams.get("category");
    const q = url.searchParams.get("q")?.toLowerCase();
    const visible = motifs.filter(
      (item) =>
        (!category || item.category.slug === category) &&
        (!q || item.name.toLowerCase().includes(q)),
    );
    const pageSize = Number(url.searchParams.get("pageSize") ?? 24);
    const pageNumber = Number(url.searchParams.get("page") ?? 1);
    if (pageNumber > Math.max(1, Math.ceil(visible.length / pageSize)))
      return route.fulfill({ status: 404, json: {} });
    return route.fulfill({
      json: {
        count: visible.length,
        next: null,
        previous: null,
        results: visible.slice((pageNumber - 1) * pageSize, pageNumber * pageSize),
      },
    });
  });
  await page.route(/\/api\/v1\/motifs\/[^/?]+$/, (route) => {
    const slug = new URL(route.request().url()).pathname.split("/").at(-1);
    const item = motifs.find((motif) => motif.slug === slug);
    if (!item) return route.fulfill({ status: 404, json: {} });
    const detail: MotifDetail = {
      ...item,
      description: "Motiv z API",
      images: [],
      variants: [
        {
          productTypeId: options.productTypes[0]!.id,
          cutId: options.cuts[0]!.id,
          colorId: options.colors[0]!.id,
          size: "L",
        },
        {
          productTypeId: options.productTypes[0]!.id,
          cutId: options.cuts[0]!.id,
          colorId: options.colors[1]!.id,
          size: "M",
        },
      ],
    };
    return route.fulfill({ json: detail });
  });
  await page.route(/\/api\/v1\/motifs\/[^/?]+\/related$/, (route) =>
    route.fulfill({ json: motifs.slice(0, 3) }),
  );
}

export async function mockStoreApi(page: Page) {
  await mockAuthApi(page);
  await mockCatalogApi(page);
  await page.route("**/api/v1/config", (route) => route.fulfill({ json: config }));
  await page.route("**/api/v1/catalog/options", (route) => route.fulfill({ json: options }));
}
