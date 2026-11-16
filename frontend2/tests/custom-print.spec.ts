import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { CartValidate } from "../src/api/generated/models";
import { mockStoreApi, options, motifs } from "./api-fixtures";

const areaId = "40000000-0000-0000-0000-000000000001";
const squareId = "40000000-0000-0000-0000-000000000002";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=",
  "base64",
);
async function mockCustomOptions(page: Page) {
  await mockStoreApi(page);
  await page.route("**/api/v1/catalog/options", (route) =>
    route.fulfill({
      json: {
        ...options,
        productTypes: [
          {
            ...options.productTypes[0],
            printAreas: [
              { id: areaId, name: "Přední strana", widthMm: 300, heightMm: 400 },
              { id: squareId, name: "Kapsa", widthMm: 100, heightMm: 100 },
            ],
          },
        ],
      },
    }),
  );
  await page.route("**/media/designs/*.png", (route) =>
    route.fulfill({ body: png, contentType: "image/png" }),
  );
}
function uploadResponse(sequence = 1) {
  return {
    fileToken: `signed-token-${sequence}`,
    url: `/media/designs/${sequence}.png`,
    fileName: `${sequence}.png`,
    size: 100,
    mimeType: "image/png",
    widthPx: 200,
    heightPx: 100,
  };
}

test("uploads a selected design, edits backend-sized placement and validates a persistent mixed cart for a quote", async ({
  page,
}) => {
  await mockCustomOptions(page);
  await page.addInitScript(
    (item) => {
      if (!localStorage.getItem("trikonos-cart-v2"))
        localStorage.setItem("trikonos-cart-v2", JSON.stringify([item]));
    },
    {
      kind: "catalog",
      motifId: motifs[0]!.id,
      productTypeId: options.productTypes[0]!.id,
      cutId: options.cuts[0]!.id,
      colorId: options.colors[0]!.id,
      size: "L",
      quantity: 1,
      name: "Katalogový motiv",
      unitPrice: 69900,
    },
  );
  await page.route("**/api/v1/uploads/designs", (route) => {
    expect(route.request().headers()["x-csrftoken"]).toBe("bootstrap-token");
    expect(route.request().headers()["content-type"]).toMatch(/^multipart\/form-data; boundary=/);
    return route.fulfill({ status: 201, json: uploadResponse() });
  });
  const requests: CartValidate[] = [];
  await page.route("**/api/v1/cart/validate", (route) => {
    const body = route.request().postDataJSON() as CartValidate;
    requests.push(body);
    return route.fulfill({
      json: {
        items: body.items.map((item) => ({
          valid: true,
          errors: [],
          itemLabel: item.isCustom
            ? "Vlastní potisk / Tričko / Pánské / Černá / L"
            : "Katalogový motiv",
          unitPrice: item.isCustom ? null : 69900,
          lineTotal: item.isCustom ? null : 69900 * item.quantity,
        })),
        subtotal: null,
        shippingCost: null,
        total: null,
        requiresQuote: true,
      },
    });
  });
  await page.goto("/#vlastni-potisk");
  const section = page.locator("#vlastni-potisk");
  await section.getByRole("button", { name: "Naše potisky", exact: true }).click();
  await page.getByRole("button", { name: "Motiv 1", exact: true }).click();
  await expect(section.locator(".design-dimensions")).toContainText("Motiv 1.png");
  const move = section.getByRole("button", { name: "Posunout potisk." });
  const before = await move.getAttribute("y");
  await move.focus();
  await page.keyboard.press("ArrowDown");
  await expect(move).not.toHaveAttribute("y", before!);
  const bounds = await move.boundingBox();
  if (!bounds) throw new Error("Missing design move handle");
  const beforeX = await move.getAttribute("x");
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 30, bounds.y + bounds.height / 2 + 20);
  await page.mouse.up();
  await expect(move).not.toHaveAttribute("x", beforeX!);
  const width = await move.getAttribute("width");
  await section.getByRole("button", { name: "Změnit velikost potisku." }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(move).not.toHaveAttribute("width", width!);
  await section.getByLabel("Tisková plocha", { exact: true }).selectOption(squareId);
  await section.getByLabel("Barva", { exact: true }).selectOption(options.colors[1]!.id);
  await section.getByLabel("Velikost", { exact: true }).selectOption("L");
  await section.getByRole("spinbutton", { name: "Počet kusů vlastního potisku" }).fill("2");
  await section.getByRole("button", { name: "Přidat návrh do košíku k nacenění" }).click();
  await page.getByRole("button", { name: "Košík, počet položek: 3" }).click();
  await expect(page.getByText("Košík je ověřený a bude vyžadovat nacenění.")).toBeVisible();
  const custom = page.getByRole("region", { name: "Vlastní potisk – Motiv 1.png" });
  await expect(custom).toContainText("Podklad a varianta byly ověřené");
  await expect(custom).not.toContainText("0 Kč");
  await expect(page.getByRole("region", { name: "Souhrn košíku" })).toContainText("699 Kč");
  const input = requests.at(-1)!.items.find((item) => item.isCustom)!;
  expect(input.quantity).toBe(2);
  expect(input).not.toHaveProperty("unitPrice");
  expect(input).not.toHaveProperty("motifId");
  expect(input.placements![0]!.fileToken).toBe("signed-token-1");
  expect(input.placements![0]!.printAreaId).toBe(squareId);
  expect(input.placements![0]!.x! + input.placements![0]!.width).toBeLessThanOrEqual(100);
  expect(input.placements![0]!.y! + input.placements![0]!.height).toBeLessThanOrEqual(100);
  const saved = await page.evaluate(() => localStorage.getItem("trikonos-cart-v2"));
  expect(saved).not.toContain("data:");
  expect(saved).not.toContain("base64");
  await page.reload();
  await expect(page.getByText("Košík je ověřený a bude vyžadovat nacenění.")).toBeVisible();
});

test("handles upload rejection and expired file tokens without losing the saved custom draft", async ({
  page,
}) => {
  await mockCustomOptions(page);
  let reject = true;
  await page.route("**/api/v1/uploads/designs", (route) =>
    reject
      ? route.fulfill({
          status: 413,
          json: { error: { code: "FILE_TOO_LARGE", message: "Too large" } },
        })
      : route.fulfill({ status: 201, json: uploadResponse() }),
  );
  await page.route("**/api/v1/cart/validate", (route) =>
    route.fulfill({
      status: 422,
      json: { error: { code: "INVALID_FILE_TOKEN", message: "Expired" } },
    }),
  );
  await page.goto("/#vlastni-potisk");
  const section = page.locator("#vlastni-potisk");
  const file = section.getByLabel("Nahrát vlastní potisk", { exact: true });
  await file.setInputFiles({ name: "unsupported.webp", mimeType: "image/webp", buffer: png });
  await expect(section.getByRole("alert")).toContainText("Vyberte PNG nebo JPG");
  await file.setInputFiles({ name: "moje.png", mimeType: "image/png", buffer: png });
  await expect(section.getByRole("alert")).toContainText("příliš velký");
  await expect(
    section.getByRole("button", { name: "Přidat návrh do košíku k nacenění" }),
  ).toBeDisabled();
  reject = false;
  await file.setInputFiles({ name: "moje.png", mimeType: "image/png", buffer: png });
  await expect(section.locator(".design-dimensions")).toContainText("moje.png");
  await section.getByRole("button", { name: "Přidat návrh do košíku k nacenění" }).click();
  await page.getByRole("button", { name: "Košík, počet položek: 1" }).click();
  await expect(page.getByRole("alert")).toContainText("neplatný nebo vypršel");
  await expect(page.getByRole("region", { name: "Vlastní potisk – moje.png" })).toBeVisible();
  await page.evaluate(() => {
    const items = JSON.parse(localStorage.getItem("trikonos-cart-v2")!);
    items[0].upload.uploadedAt = Date.now() - 8 * 86400000;
    localStorage.setItem("trikonos-cart-v2", JSON.stringify(items));
  });
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Platnost podkladu vypršela");
  await expect(page.getByRole("link", { name: "Nahrát podklad znovu v editoru" })).toBeVisible();
  await page.getByRole("button", { name: "Odebrat položku" }).click();
  await expect(page.getByText("Košík je prázdný.", { exact: true })).toBeVisible();
});
