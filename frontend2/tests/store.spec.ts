import { expect, test } from "@playwright/test";
import { Buffer } from "node:buffer";

test("home, default artwork, gallery, seasonal panels and FAQ", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Triko z hor, které má duši." })).toBeVisible();
  await expect(page.getByLabel("Pozadí hero")).toHaveCount(0);
  await page.getByRole("button", { name: "Prohlédnout vše" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Další fotografie" }).click();
  await expect(page.locator(".gallery-caption")).toContainText("2 / 9");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Vánoce Prohlédnout motivy" }).click();
  await expect(page.getByRole("button", { name: "Zpět na sezony" })).toBeVisible();
  await page.getByRole("button", { name: "Zpět na sezony" }).click();
  await page.getByRole("button", { name: "Odkud jsou motivy?" }).click();
  await expect(page.getByText("Vznikají s inspirací v horách")).toBeVisible();
  expect(errors).toEqual([]);
});

test("catalog filters, pagination, product options and persistent cart", async ({ page }) => {
  await page.goto("/tricka");
  await expect(page.locator(".catalog-grid .product-card")).toHaveCount(12);
  await expect(page.getByRole("status")).toContainText("z 200 triček");
  await page.getByRole("button", { name: "Bitcoin", exact: true }).click();
  await expect(page).toHaveURL(/kategorie=bitcoin/);
  await expect(page.getByRole("status")).toContainText("z 16 triček");
  await page.getByRole("button", { name: "Stránka 2", exact: true }).click();
  await expect(page.locator(".catalog-grid .product-card")).toHaveCount(4);
  await page.locator(".product-card-link").first().click();
  await expect(page).toHaveURL(/\/produkt\/bitcoin-/);
  await page.getByText("Dětské", { exact: true }).click();
  await page.getByText("Bílá", { exact: true }).click();
  await page.getByText("110/116", { exact: true }).click();
  await page.getByLabel("Počet kusů", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Přidat do košíku" }).click();
  await expect(page.getByRole("button", { name: "Košík, počet položek: 2" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Košík, počet položek: 2" })).toBeVisible();
  await page.goto("/produkt/neexistuje");
  await expect(page.getByRole("heading", { name: "Tohle tričko jsme nenašli." })).toBeVisible();
});

test("custom print selection, editing, upload, removal and cart", async ({ page }) => {
  await page.goto("/#vlastni-potisk");
  const section = page.locator("#vlastni-potisk");
  await section.getByRole("button", { name: "Do košíku za" }).click();
  await expect(section.getByRole("status")).toContainText("Nejprve vyberte");
  await section.getByRole("button", { name: "Naše potisky", exact: true }).click();
  await page.getByRole("button", { name: "Motiv 1", exact: true }).click();
  await expect(section.locator(".design-dimensions")).toBeVisible();
  const move = section.getByRole("button", { name: "Posunout potisk." });
  const before = await move.getAttribute("y");
  await move.focus();
  await page.keyboard.press("ArrowDown");
  await expect(move).not.toHaveAttribute("y", before!);
  const beforeDrag = await move.getAttribute("x");
  const bounds = await move.boundingBox();
  if (!bounds) throw new Error("Print drag handle is not visible");
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 30, bounds.y + bounds.height / 2 + 20);
  await page.mouse.up();
  await expect(move).not.toHaveAttribute("x", beforeDrag!);
  const resize = section.getByRole("button", { name: "Změnit velikost potisku." });
  const widthBefore = await move.getAttribute("width");
  await resize.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(move).not.toHaveAttribute("width", widthBefore!);
  await section.getByRole("button", { name: "Černá", exact: true }).click();
  await expect(section.getByRole("group", { name: "Náhled trička – Černá" })).toBeVisible();
  await section.getByRole("button", { name: "Přidat jeden kus" }).click();
  await section.getByRole("button", { name: "Do košíku za" }).click();
  await expect(page.getByRole("button", { name: "Košík, počet položek: 2" })).toBeVisible();
  await section.getByRole("button", { name: "Odebrat potisk" }).click();
  await expect(section.locator(".design-dimensions")).toHaveCount(0);
  await section.locator("input[type=file]").setInputFiles({
    name: "invalid.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image"),
  });
  await expect(section.getByRole("status")).toContainText("Vyberte PNG");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=",
    "base64",
  );
  await section
    .locator("input[type=file]")
    .setInputFiles({ name: "moje.png", mimeType: "image/png", buffer: png });
  await expect(section.locator(".design-dimensions")).toContainText("moje.png");
});

test("admin search, all routes, dictionaries CRUD, validation and persistence", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Přehled", exact: true })).toBeVisible();
  await page.getByRole("searchbox").fill("Petra");
  await expect(page.getByRole("cell", { name: "Petra Malá" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Jan Novák" })).toHaveCount(0);
  await page.getByRole("searchbox").fill("nic-takoveho");
  await expect(page.getByRole("status")).toContainText("Žádná objednávka");
  for (const [route, heading] of [
    ["objednavky", "Objednávky"],
    ["produkty", "Produkty"],
    ["klienti", "Klienti"],
    ["sezony", "Sezóny"],
  ]) {
    await page.goto(`/admin/${route}`);
    await expect(page.locator(".admin-header h1")).toHaveText(heading!);
  }
  await page.goto("/admin/ciselniky");
  await page.getByRole("button", { name: "+ Přidat" }).click();
  await page.getByLabel("Název").fill("Bílá");
  await page.getByRole("button", { name: "Uložit", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("už existuje");
  await page.getByLabel("Název").fill("Testovací barva");
  await page.getByRole("button", { name: "Uložit", exact: true }).click();
  await expect(page.getByRole("rowheader", { name: "Testovací barva" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Upravit: Testovací barva" }).click();
  await page.getByLabel("Název").fill("Upravená barva");
  await page.getByRole("button", { name: "Uložit", exact: true }).click();
  await page.getByRole("button", { name: "Smazat: Upravená barva" }).click();
  await page.getByRole("button", { name: "Smazat", exact: true }).click();
  await expect(page.getByRole("rowheader", { name: "Upravená barva" })).toHaveCount(0);
  await page.getByRole("tab", { name: "Střihy" }).click();
  await expect(page.getByRole("rowheader", { name: "Oversize", exact: true })).toBeVisible();
});

test("demo login navigates without sending credentials or calling backend", async ({ page }) => {
  const apiCalls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/") || request.url().includes(":8000"))
      apiCalls.push(request.url());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await page.getByLabel("Přihlašovací jméno").fill("demo");
  await page.getByLabel("Heslo", { exact: true }).fill("not-stored");
  await page.getByRole("button", { name: "Přihlásit se" }).click();
  await expect(page).toHaveURL("/admin");
  expect(apiCalls).toEqual([]);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain("not-stored");
});
