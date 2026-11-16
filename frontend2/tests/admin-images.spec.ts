import { expect, test } from "@playwright/test";
import { mockAuthApi, mockStoreApi } from "./api-fixtures";
import { existingMotif, mockAdminCatalog } from "./admin-catalog-fixtures";

test("uploads photos with CSRF, handles rejection, edits metadata, changes the main image and deletes with confirmation", async ({
  page,
}) => {
  await mockStoreApi(page);
  await mockAuthApi(page, true);
  await mockAdminCatalog(page, [existingMotif()]);
  const writes: { token?: string; type?: string }[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/images") && request.method() !== "GET") {
      writes.push({
        token: request.headers()["x-csrftoken"],
        type: request.headers()["content-type"],
      });
    }
  });
  await page.goto("/produkt/puvodni-url");
  await expect(page.getByRole("heading", { name: "Používaný motiv", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Administrace" })
    .getByRole("link", { name: "Produkty" })
    .click();
  await page.getByRole("button", { name: "Fotografie", exact: true }).click();
  const panel = page
    .getByRole("dialog")
    .filter({ has: page.getByRole("heading", { name: "Fotografie: Používaný motiv" }) });
  await expect(panel.getByText("Motiv zatím nemá fotografie.")).toBeVisible();
  const upload = panel.getByRole("form", { name: "Nahrát fotografii" });
  await upload.getByLabel("Soubor fotografie").setInputFiles({
    name: "photo.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6YQAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await upload.getByRole("textbox", { name: "Popisek fotografie" }).fill("První foto");
  await page.route(
    "**/api/v1/admin/motifs/*/images",
    (route) =>
      route.fulfill({
        status: 413,
        json: { error: { code: "FILE_TOO_LARGE", message: "Soubor je příliš velký." } },
      }),
    { times: 1 },
  );
  await upload.getByRole("button", { name: "Nahrát fotografii", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("Soubor je příliš velký.");
  await expect(panel.locator(".admin-image-card")).toHaveCount(0);
  await upload.getByRole("button", { name: "Nahrát fotografii", exact: true }).click();
  await expect(panel.locator(".admin-image-card")).toHaveCount(1);
  await upload.getByLabel("Soubor fotografie").setInputFiles({
    name: "second.webp",
    mimeType: "image/webp",
    buffer: Buffer.from("mock image content"),
  });
  await upload.getByRole("textbox", { name: "Popisek fotografie" }).fill("Druhé foto");
  await upload.getByRole("button", { name: "Nahrát fotografii", exact: true }).click();
  await expect(panel.locator(".admin-image-card")).toHaveCount(2);
  await panel
    .locator(".admin-image-card")
    .nth(1)
    .getByRole("button", { name: "Upravit popisek a barvu" })
    .click();
  const editor = page
    .getByRole("dialog")
    .filter({ has: page.getByRole("heading", { name: "Upravit fotografii", exact: true }) });
  await editor.getByRole("textbox", { name: "Popisek fotografie" }).fill("Nová hlavní fotografie");
  await editor.getByRole("combobox", { name: "Barva fotografie" }).click();
  await page.getByRole("option", { name: "Bílá", exact: true }).click();
  await editor.getByRole("button", { name: "Uložit fotografii", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(panel.locator(".admin-image-card").nth(1)).toContainText("Bílá");
  await panel.getByRole("button", { name: "Posunout fotografii 2 doleva" }).click();
  await expect(panel.locator(".admin-image-card").first()).toContainText("Nová hlavní fotografie");
  await panel
    .locator(".admin-image-card")
    .nth(1)
    .getByRole("button", { name: "Smazat fotografii", exact: true })
    .click();
  const confirmation = page
    .getByRole("dialog")
    .filter({ has: page.getByRole("heading", { name: "Smazat fotografii?", exact: true }) });
  await confirmation.getByRole("button", { name: "Zrušit", exact: true }).click();
  await expect(panel.locator(".admin-image-card")).toHaveCount(2);
  await panel
    .locator(".admin-image-card")
    .nth(1)
    .getByRole("button", { name: "Smazat fotografii", exact: true })
    .click();
  await confirmation.getByRole("button", { name: "Trvale smazat fotografii" }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(panel.locator(".admin-image-card")).toHaveCount(1);
  await panel.getByRole("button", { name: "Zavřít", exact: true }).click();
  await page.getByRole("link", { name: "← Zpět na web" }).click();
  await page
    .getByRole("region", { name: "Výběr z kolekce" })
    .getByRole("link", { name: /Používaný motiv/ })
    .click();
  await expect(
    page.getByRole("img", { name: "Nová hlavní fotografie", exact: true }).first(),
  ).toBeVisible();
  expect(writes).toHaveLength(6);
  expect(writes.every((write) => write.token === "bootstrap-token")).toBe(true);
  expect(
    writes.slice(0, 3).every((write) => write.type?.startsWith("multipart/form-data; boundary=")),
  ).toBe(true);
});
