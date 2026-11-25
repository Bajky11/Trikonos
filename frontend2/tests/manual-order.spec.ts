import { expect, test } from "@playwright/test";
import type { OrderCreate } from "../src/api/generated/models";
import { mockAuthApi, mockStoreApi, motifs, options } from "./api-fixtures";
import { sampleOrder } from "./admin-orders-fixtures";

test("creates a separate mixed manual order and recovers the same id/body after a lost result and reload", async ({
  page,
}) => {
  await mockStoreApi(page);
  await mockAuthApi(page, true);
  const area = {
    id: "80000000-0000-0000-0000-000000000005",
    name: "Přední strana",
    widthMm: 300,
    heightMm: 400,
  };
  await page.route("**/api/v1/catalog/options", (route) =>
    route.fulfill({
      json: {
        ...options,
        productTypes: options.productTypes.map((type) => ({ ...type, printAreas: [area] })),
      },
    }),
  );
  await page.route("**/api/v1/uploads/designs", (route) => {
    expect(route.request().headers()["x-csrftoken"]).toBe("bootstrap-token");
    return route.fulfill({
      status: 201,
      json: {
        fileToken: "manual-file-token",
        fileName: "team.png",
        url: "/media/designs/team.png",
        size: 100,
        mimeType: "image/png",
        widthPx: 100,
        heightPx: 100,
      },
    });
  });
  const posts: OrderCreate[] = [];
  let saved: ReturnType<typeof sampleOrder> | undefined;
  await page.route(/\/api\/v1\/admin\/orders(?:\?.*)?$/, (route) => {
    if (route.request().method() !== "POST")
      return route.fulfill({ json: { count: 0, results: [], next: null, previous: null } });
    const body = route.request().postDataJSON() as OrderCreate;
    posts.push(body);
    expect(route.request().headers()["x-csrftoken"]).toBe("bootstrap-token");
    if (!saved) {
      saved = {
        ...sampleOrder(),
        id: body.orderId!,
        orderNumber: "TRK-MANUAL-1",
        confirmedAt: null,
      };
      return route.fulfill({ status: 503, json: {} });
    }
    if (posts.length === 2)
      return route.fulfill({ status: 403, json: { error: { message: "Přihlášení vypršelo." } } });
    return route.fulfill({ status: 201, json: saved });
  });
  await page.route(/\/api\/v1\/admin\/orders\/[0-9a-f-]{36}$/, (route) =>
    route.fulfill({ json: saved }),
  );
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/admin/objednavky/nova");
  await page.getByRole("combobox", { name: "Motiv položky", exact: true }).fill(motifs[0]!.name);
  await page.getByRole("option", { name: motifs[0]!.name, exact: true }).click();
  await page.getByRole("combobox", { name: "Varianta položky", exact: true }).click();
  await page.getByRole("option", { name: /Tričko.*Pánské.*Bílá.*L/ }).click();
  await page.getByRole("textbox", { name: "Ruční cena za kus (Kč)", exact: true }).fill("250,50");
  await page.getByRole("button", { name: "Přidat do ruční objednávky", exact: true }).click();
  await page.getByRole("combobox", { name: "Druh položky", exact: true }).click();
  await page.getByRole("option", { name: "Vlastní potisk", exact: true }).click();
  for (const [label, value] of [
    ["Typ vlastního oděvu", "Tričko"],
    ["Střih", "Pánské"],
    ["Barva", "Bílá"],
    ["Velikost", "L"],
    ["Plocha vlastního potisku", "Přední strana"],
  ]) {
    await page.getByRole("combobox", { name: label!, exact: true }).click();
    await page.getByRole("option", { name: value!, exact: true }).click();
  }
  await page
    .getByLabel("PNG/JPG podklad", { exact: true })
    .setInputFiles({ name: "team.png", mimeType: "image/png", buffer: Buffer.from("test-image") });
  await expect(page.getByText(/Podklad nahraný: team.png/)).toBeVisible();
  await page.getByRole("textbox", { name: "Ruční cena za kus (Kč)", exact: true }).fill("");
  await page.getByRole("button", { name: "Přidat do ruční objednávky", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Položky ruční objednávky", exact: true }),
  ).toContainText("Vlastní potisk");
  await page.getByRole("textbox", { name: "Jméno zákazníka", exact: true }).fill("Jana");
  await page.getByRole("textbox", { name: "Příjmení zákazníka", exact: true }).fill("Nováková");
  await page
    .getByRole("textbox", { name: "E-mail zákazníka", exact: true })
    .fill("manual@example.cz");
  await page.getByRole("textbox", { name: "Ulice a číslo domu", exact: true }).fill("Horní 12");
  await page.getByRole("textbox", { name: "Obec", exact: true }).fill("Vrchlabí");
  await page.getByRole("textbox", { name: "PSČ", exact: true }).fill("54301");
  await page.getByRole("button", { name: "Založit ruční objednávku", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Dokončit ruční založení", exact: true }),
  ).toBeVisible();
  expect(posts).toHaveLength(1);
  expect(posts[0]!.items).toHaveLength(2);
  expect(posts[0]!.items[0]!.unitPrice).toBe(25050);
  expect(posts[0]!.items[1]!.placements![0]!.fileToken).toBe("manual-file-token");
  expect(posts[0]!.termsAccepted).toBeUndefined();
  await page.reload();
  await page.getByRole("button", { name: "Dokončit stejné založení", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Přihlášení vypršelo.");
  await expect(page.getByRole("heading", { name: "Dokončit ruční založení" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Dokončit stejné založení", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Objednávka TRK-MANUAL-1", exact: true }),
  ).toBeVisible();
  expect(posts[1]).toEqual(posts[0]);
  expect(posts[2]).toEqual(posts[0]);
  expect(saved?.confirmedAt).toBeNull();
  const record = await page.evaluate(() =>
    sessionStorage.getItem("trikonos-admin-order-attempt-v1"),
  );
  expect(record).not.toContain("manual@example.cz");
  expect(record).not.toContain("manual-file-token");
  expect(await page.evaluate(() => localStorage.getItem("trikonos-cart-v2"))).toBeNull();
});
