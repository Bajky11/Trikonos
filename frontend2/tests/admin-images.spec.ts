import { expect, test } from "@playwright/test";
import { mockAuthApi, mockStoreApi } from "./api-fixtures";
import { existingMotif, mockAdminCatalog } from "./admin-catalog-fixtures";

test("opens a larger shirt preview from the first motif column", async ({ page }) => {
  const motif = { ...existingMotif(), designImageUrl: "/media/design.png" };
  await mockStoreApi(page);
  await mockAuthApi(page, true);
  await mockAdminCatalog(page, [motif]);
  await page.goto("/admin/produkty");

  const table = page.getByRole("table", { name: "Motivy" });
  await expect(table.getByRole("columnheader").first()).toHaveText("Náhled");
  const thumbnail = table
    .getByRole("row", { name: new RegExp(motif.name) })
    .getByRole("cell")
    .first()
    .getByRole("button", { name: `Zvětšit náhled: ${motif.name}` });
  await thumbnail.click();
  const dialog = page.getByRole("dialog", { name: motif.name });
  const image = dialog.getByRole("img", { name: `${motif.name} na tričku` });
  await expect(image.locator("image").first()).toHaveAttribute("href", "/assets/tshirt.png");
  await expect(image.locator("image").last()).toHaveAttribute("href", /\/media\/design\.png$/);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(thumbnail).toBeFocused();
});

test("adds an independent design PNG to an existing motif by dropping it", async ({ page }) => {
  await mockStoreApi(page);
  await mockAuthApi(page, true);
  await mockAdminCatalog(page, [existingMotif()]);
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6YQAAAABJRU5ErkJggg==";
  await page.route("**/media/design.png", (route) =>
    route.fulfill({ contentType: "image/png", body: Buffer.from(png, "base64") }),
  );
  await page.goto("/admin/produkty");
  await page.getByRole("button", { name: "Upravit", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Upravit motiv" });
  const dropzone = dialog.getByRole("button", { name: /^Vybrat (jiné )?PNG/ });
  const preview = dialog.getByRole("img", { name: "Náhled samotného motivu" });
  const dataTransfer = await page.evaluateHandle((png) => {
    const transfer = new DataTransfer();
    const bytes = Uint8Array.from(atob(png), (char) => char.charCodeAt(0));
    transfer.items.add(new File([bytes], "design.png", { type: "image/png" }));
    return transfer;
  }, png);
  await dropzone.dispatchEvent("drop", { dataTransfer });
  await dataTransfer.dispose();
  await expect(dialog.getByText("Vybraný soubor: design.png")).toBeVisible();
  await expect(preview).toHaveAttribute("src", /^blob:/);
  const imageBox = await preview.boundingBox();
  const dropzoneBox = await dropzone.boundingBox();
  expect(imageBox!.x + imageBox!.width).toBeLessThan(dropzoneBox!.x);
  expect(Math.abs(imageBox!.y - dropzoneBox!.y)).toBeLessThanOrEqual(1);
  const upload = page.waitForRequest(
    (request) => request.url().endsWith("/design-image") && request.method() === "POST",
  );
  await dialog.getByRole("button", { name: "Uložit a zavřít", exact: true }).click();
  expect((await upload).headers()["content-type"]).toContain("multipart/form-data");
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Upravit", exact: true }).click();
  await expect(preview).toHaveAttribute("src", /\/media\/design\.png$/);
  await expect(dialog.getByRole("checkbox", { name: "Odebrat PNG motivu" })).toHaveCount(0);
  await expect(dialog.getByText("Motiv zatím nemá fotografie.")).toBeVisible();
});

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
    .getByRole("link", { name: "Motivy" })
    .click();
  await page.getByRole("button", { name: "Upravit", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Upravit motiv" });
  const panel = dialog.getByRole("region", { name: "Fotografie hotového produktu (volitelné)" });
  const name = dialog.getByRole("textbox", { name: "Název motivu" });
  await name.fill("Neuložený název");
  await expect(dialog.getByRole("button", { name: "Duplikovat motiv" })).toBeDisabled();
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
  await upload.getByText("Popis a přiřazení fotografie (volitelné)").click();
  await upload.getByRole("textbox", { name: "Alternativní text" }).fill("První foto");
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
  await upload.getByText("Popis a přiřazení fotografie (volitelné)").click();
  await upload.getByRole("textbox", { name: "Alternativní text" }).fill("Druhé foto");
  await upload.getByRole("button", { name: "Nahrát fotografii", exact: true }).click();
  await expect(panel.locator(".admin-image-card")).toHaveCount(2);
  await panel
    .locator(".admin-image-card")
    .nth(1)
    .getByRole("button", { name: "Upravit popisek a barvu" })
    .click();
  const editor = panel.getByRole("form", { name: "Upravit fotografii" });
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await editor.getByRole("textbox", { name: "Alternativní text" }).fill("Nová hlavní fotografie");
  await editor.getByRole("combobox", { name: "Zobrazovat při výběru barvy" }).click();
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
  const confirmation = panel.getByRole("group", { name: "Smazat fotografii?" });
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
  await expect(name).toHaveValue("Neuložený název");
  await dialog.getByRole("button", { name: "Zavřít", exact: true }).click();
  await page.getByRole("link", { name: "← Zpět na web" }).click();
  await page
    .getByRole("region", { name: "Výběr z kolekce" })
    .getByRole("link", { name: /Používaný motiv/ })
    .click();
  await page.getByRole("button", { name: "Nová hlavní fotografie, obrázek 2" }).click();
  await expect(
    page.getByRole("img", { name: "Nová hlavní fotografie", exact: true }).first(),
  ).toBeVisible();
  expect(writes).toHaveLength(6);
  expect(writes.every((write) => write.token === "bootstrap-token")).toBe(true);
  expect(
    writes.slice(0, 3).every((write) => write.type?.startsWith("multipart/form-data; boundary=")),
  ).toBe(true);
});
