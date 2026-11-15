import type { Page } from "@playwright/test";
import type {
  AdminMotifDetail,
  AdminMotifImage,
  AdminMotifVariant,
} from "../src/api/generated/models";
import type {
  AdminMotifsCreateMutationBody,
  AdminMotifVariantsCreateMutationBody,
} from "../src/api/generated/api";
import { categories } from "./api-fixtures";

export function existingMotif(): AdminMotifDetail {
  return {
    id: "20000000-0000-0000-0000-000000000001",
    name: "Používaný motiv",
    slug: "puvodni-url",
    price: 59900,
    category: { id: categories[0]!.id, name: categories[0]!.name },
    isActive: true,
    position: 0,
    images: [],
    description: "",
    ordersCount: 1,
    createdAt: "2026-11-15T12:00:00Z",
    updatedAt: "2026-11-15T12:00:00Z",
  };
}

export async function mockAdminCatalog(
  page: Page,
  initial: AdminMotifDetail[] = [],
  inUse = false,
) {
  let records: (Omit<AdminMotifDetail, "images"> & { images: AdminMotifImage[] })[] = initial.map(
    (item) => ({ ...structuredClone(item), images: structuredClone([...(item.images ?? [])]) }),
  );
  let variants: AdminMotifVariant[] = [];
  let sequence = 100;
  const id = () => `20000000-0000-0000-0000-${String(sequence++).padStart(12, "0")}`;
  const responsePage = <T>(results: T[]) => ({
    count: results.length,
    results,
    next: null,
    previous: null,
  });

  await page.route(/\/api\/v1\/admin\/motifs(?:\?.*)?$/, (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as AdminMotifsCreateMutationBody;
      const category = categories.find((item) => item.id === body.category)!;
      const item: AdminMotifDetail = {
        ...body,
        id: id(),
        slug: body.slug ?? "auto-slug",
        category: { id: category.id, name: category.name },
        images: [],
        ordersCount: 0,
        createdAt: "2026-11-15T12:00:00Z",
        updatedAt: "2026-11-15T12:00:00Z",
      };
      records.push({ ...item, images: [] });
      return route.fulfill({ status: 201, json: item });
    }
    const params = new URL(route.request().url()).searchParams;
    return route.fulfill({
      json: responsePage(
        records.filter(
          (item) =>
            (!params.get("q") ||
              item.name.toLowerCase().includes(params.get("q")!.toLowerCase())) &&
            (!params.get("category") || item.category.id === params.get("category")) &&
            (!params.has("isActive") || item.isActive === (params.get("isActive") === "true")),
        ),
      ),
    });
  });
  await page.route(/\/api\/v1\/admin\/motifs\/[0-9a-f-]+$/, (route) => {
    const currentId = new URL(route.request().url()).pathname.split("/").at(-1);
    const item = records.find((record) => record.id === currentId)!;
    if (route.request().method() === "DELETE") {
      if (inUse)
        return route.fulfill({
          status: 409,
          json: { error: { code: "IN_USE", message: "In use" } },
        });
      records = records.filter((record) => record.id !== currentId);
      return route.fulfill({ status: 204 });
    }
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON() as AdminMotifsCreateMutationBody;
      const category = categories.find((category) => category.id === body.category)!;
      Object.assign(item, body, {
        slug: body.slug ?? "unexpected-regenerated-slug",
        category: { id: category.id, name: category.name },
      });
    }
    return route.fulfill({ json: item });
  });
  await page.route(/\/api\/v1\/admin\/motif-variants(?:\?.*)?$/, (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as AdminMotifVariantsCreateMutationBody;
      const duplicate = variants.some(
        (item) =>
          item.motifId === body.motifId &&
          item.productTypeId === body.productTypeId &&
          item.cutId === body.cutId &&
          item.colorId === body.colorId &&
          item.size === body.size,
      );
      if (duplicate)
        return route.fulfill({
          status: 409,
          json: { error: { code: "DUPLICATE_VARIANT", message: "Duplicate" } },
        });
      const item = { ...body, id: id() };
      variants.push(item);
      return route.fulfill({ status: 201, json: item });
    }
    return route.fulfill({
      json: responsePage(
        variants.filter(
          (item) => item.motifId === new URL(route.request().url()).searchParams.get("motif"),
        ),
      ),
    });
  });
  await page.route(/\/api\/v1\/admin\/motif-variants\/[0-9a-f-]+$/, (route) => {
    const currentId = new URL(route.request().url()).pathname.split("/").at(-1);
    if (route.request().method() === "DELETE") {
      variants = variants.filter((item) => item.id !== currentId);
      return route.fulfill({ status: 204 });
    }
    const item = variants.find((item) => item.id === currentId)!;
    Object.assign(item, route.request().postDataJSON());
    return route.fulfill({ json: item });
  });

  await page.route(/\/api\/v1\/admin\/motifs\/[0-9a-f-]+\/images(?:\/[^/?]+)?$/, (route) => {
    const parts = new URL(route.request().url()).pathname.split("/");
    const item = records.find((record) => record.id === parts[5])!;
    const imageId = parts[7];
    if (imageId === "reorder") {
      const body = route.request().postDataJSON() as { ids: string[] };
      item.images = body.ids.map((id, position) => ({
        ...item.images!.find((image) => image.id === id)!,
        position,
      }));
    } else if (route.request().method() === "DELETE") {
      item.images = item.images!.filter((image) => image.id !== imageId);
      return route.fulfill({ status: 204 });
    } else if (route.request().method() === "PATCH") {
      Object.assign(
        item.images!.find((image) => image.id === imageId)!,
        route.request().postDataJSON(),
      );
    } else {
      const body = route.request().postData() ?? "";
      const part = (name: string) =>
        new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`).exec(body)?.[1] ?? "";
      const url =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6YQAAAABJRU5ErkJggg==";
      item.images!.push({
        id: id(),
        url,
        thumbnailSmallUrl: url,
        thumbnailLargeUrl: url,
        altText: part("altText"),
        colorId: part("colorId") || null,
        position: item.images!.length,
      });
      return route.fulfill({ status: 201, json: item });
    }
    return route.fulfill({ json: item });
  });

  const publicItem = (item: AdminMotifDetail) => ({
    id: item.id,
    slug: item.slug,
    name: item.name,
    price: item.price,
    currency: "CZK",
    mainImage: item.images?.[0]?.url ?? null,
    category: {
      name: item.category.name,
      slug: categories.find((category) => category.id === item.category.id)!.slug,
    },
  });
  await page.route(/\/api\/v1\/motifs(?:\?.*)?$/, (route) =>
    route.fulfill({ json: responsePage(records.filter((item) => item.isActive).map(publicItem)) }),
  );
  await page.route(/\/api\/v1\/motifs\/[^/?]+$/, (route) => {
    const slug = new URL(route.request().url()).pathname.split("/").at(-1);
    const item = records.find((item) => item.slug === slug && item.isActive);
    return item
      ? route.fulfill({
          json: {
            ...publicItem(item),
            description: item.description,
            images: item.images,
            variants: variants.filter((variant) => variant.motifId === item.id && variant.isActive),
          },
        })
      : route.fulfill({ status: 404, json: {} });
  });
  await page.route(/\/api\/v1\/motifs\/[^/?]+\/related$/, (route) => route.fulfill({ json: [] }));
}
