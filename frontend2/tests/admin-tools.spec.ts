import { expect, test } from "@playwright/test";
import { admin, mockAuthApi, mockStoreApi } from "./api-fixtures";
import { adminOrderId, adminItemId, mockAdminOrders } from "./admin-orders-fixtures";
import { existingMotif, mockAdminCatalog } from "./admin-catalog-fixtures";

test("accounts use invitation creation, preserve LAST_ADMIN errors and prevent own deletion", async ({
  page,
}) => {
  await mockStoreApi(page);
  await mockAuthApi(page, true);
  const users = [{ ...admin, isActive: true, createdAt: "2026-11-16T10:00:00Z" }];
  const invitations: unknown[] = [];
  await page.route(/\/api\/v1\/admin\/users(?:\/[^/?]+)?(?:\?.*)?$/, (route) => {
    const request = route.request(),
      id = new URL(request.url()).pathname.split("/")[5];
    if (request.method() === "GET")
      return route.fulfill({
        json: { count: users.length, results: users, next: null, previous: null },
      });
    expect(request.headers()["x-csrftoken"]).toBe("bootstrap-token");
    if (request.method() === "POST") {
      const body = request.postDataJSON();
      invitations.push(body);
      const user = { ...body, id: "new-admin", isActive: true, createdAt: "2026-11-16T10:00:00Z" };
      users.push(user);
      return route.fulfill({ status: 201, json: user });
    }
    if (request.method() === "PATCH") {
      const body = request.postDataJSON();
      if (id === admin.id && !body.isActive)
        return route.fulfill({ status: 409, json: { error: { code: "LAST_ADMIN" } } });
      const user = users.find((user) => user.id === id)!;
      Object.assign(user, body);
      return route.fulfill({ json: user });
    }
    users.splice(
      users.findIndex((user) => user.id === id),
      1,
    );
    return route.fulfill({ status: 204 });
  });
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/admin/uzivatele");
  const own = page.getByRole("row").filter({ hasText: admin.email });
  await expect(own.getByRole("button", { name: "Smazat účet", exact: true })).toBeDisabled();
  await own.getByRole("button", { name: "Upravit účet", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("checkbox", { name: "Aktivní účet", exact: true })
    .uncheck();
  await page.getByRole("dialog").getByRole("button", { name: "Uložit účet", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Poslední aktivní účet");
  await page.getByRole("dialog").getByRole("button", { name: "Zavřít", exact: true }).click();
  await page.getByRole("button", { name: "Vytvořit účet", exact: true }).click();
  await page
    .getByRole("textbox", { name: "E-mail nového účtu", exact: true })
    .fill("invited@example.cz");
  await page
    .getByRole("textbox", { name: "Jméno administrátora", exact: true })
    .fill("Pozvaný admin");
  await page.getByRole("dialog").getByRole("button", { name: "Uložit účet", exact: true }).click();
  await expect(page.getByRole("cell", { name: "invited@example.cz", exact: true })).toBeVisible();
  expect(invitations).toEqual([{ email: "invited@example.cz", name: "Pozvaný admin" }]);
  await page
    .getByRole("row")
    .filter({ hasText: "invited@example.cz" })
    .getByRole("button", { name: "Smazat účet", exact: true })
    .click();
  await expect(page.getByRole("cell", { name: "invited@example.cz", exact: true })).toHaveCount(0);
});

test("password recovery is generic, removes tokens from the address, rejects an old link and never persists passwords", async ({
  page,
}) => {
  await mockStoreApi(page);
  await mockAuthApi(page, false);
  const requests: Record<string, string>[] = [];
  let valid = false;
  await page.route("**/api/v1/admin/auth/password-reset", (route) => {
    expect(route.request().headers()["x-csrftoken"]).toBe("bootstrap-token");
    requests.push(route.request().postDataJSON());
    return route.fulfill({ status: 204 });
  });
  await page.route("**/api/v1/admin/auth/password-reset/confirm", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill(
      valid
        ? { status: 204 }
        : { status: 400, json: { error: { code: "VALIDATION_ERROR", message: "Invalid token" } } },
    );
  });
  await page.goto("/zapomenute-heslo");
  await page.getByRole("textbox", { name: "E-mail účtu", exact: true }).fill("unknown@example.cz");
  await page.getByRole("button", { name: "Vyžádat odkaz", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Pokud účet existuje");
  await page.goto("/admin/nastavit-heslo?uid=uid-secret&token=token-secret");
  await expect(page).toHaveURL(/\/admin\/nastavit-heslo$/);
  const fill = async () => {
    await page.getByLabel(/^Nové heslo/).fill("Strong test password 42!");
    await page.getByLabel(/^Zopakovat nové heslo/).fill("Strong test password 42!");
  };
  await fill();
  await page.getByRole("button", { name: "Uložit nové heslo", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("neplatný");
  await expect(page.getByLabel(/^Nové heslo/)).toHaveValue("");
  valid = true;
  await fill();
  await page.getByRole("button", { name: "Uložit nové heslo", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Heslo bylo nastavené");
  expect(requests[1]).toEqual({
    uid: "uid-secret",
    token: "token-secret",
    newPassword: "Strong test password 42!",
  });
  const stored = await page.evaluate(() =>
    JSON.stringify(
      [localStorage, sessionStorage].flatMap((storage) =>
        Object.keys(storage).map((key) => storage.getItem(key)),
      ),
    ),
  );
  expect(stored).not.toContain("Strong test");
  expect(stored).not.toContain("token-secret");
});

test("changing a password clears fields and cached access before returning to login", async ({
  page,
}) => {
  await mockStoreApi(page);
  const auth = await mockAuthApi(page, true);
  await page.route("**/api/v1/admin/auth/password", (route) => {
    expect(route.request().postDataJSON()).toEqual({
      currentPassword: "old-test-password",
      newPassword: "New test password 42!",
    });
    auth.setAuthenticated(false);
    return route.fulfill({ status: 204 });
  });
  await page.goto("/admin/heslo");
  await page.getByLabel(/^Současné heslo/).fill("old-test-password");
  await page.getByLabel(/^Nové heslo/).fill("New test password 42!");
  await page.getByLabel(/^Zopakovat nové heslo/).fill("New test password 42!");
  await page.getByRole("button", { name: "Uložit nové heslo", exact: true }).click();
  await expect(page).toHaveURL(/\/prihlaseni$/);
  await expect(page.locator(".admin-app")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Heslo bylo změněné");
});

test("global search opens motif editing and order detail, where placement repair respects bounds", async ({
  page,
}) => {
  await mockStoreApi(page);
  await mockAuthApi(page, true);
  const motif = existingMotif();
  await mockAdminCatalog(page, [motif]);
  const state = await mockAdminOrders(page);
  const placement = state.order.items[0]!.placements[0]!;
  await page.route(/\/api\/v1\/admin\/search(?:\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        orders: [
          {
            id: adminOrderId,
            orderNumber: state.order.orderNumber,
            customerEmail: state.order.customer.email,
            status: "QUOTE_REQUESTED",
          },
        ],
        customers: [],
        motifs: [{ id: motif.id, name: motif.name, slug: motif.slug }],
      },
    }),
  );
  const patches: unknown[] = [];
  await page.route(
    `**/api/v1/admin/orders/${adminOrderId}/items/${adminItemId}/placements/${placement.id}`,
    (route) => {
      const body = route.request().postDataJSON();
      patches.push(body);
      Object.assign(placement, body);
      return route.fulfill({ json: { ...state.order, updatedAt: "2026-11-16T15:00:00Z" } });
    },
  );
  await page.goto("/admin");
  await page.getByRole("button", { name: "Globální hledání", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Hledat objednávky, zákazníky a motivy", exact: true })
    .fill("test");
  await page.getByRole("dialog").getByRole("link", { name: motif.name, exact: true }).click();
  await expect(
    page.getByRole("dialog").getByRole("textbox", { name: "Název motivu", exact: true }),
  ).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Zavřít", exact: true }).click();
  await page.getByRole("button", { name: "Globální hledání", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Hledat objednávky, zákazníky a motivy", exact: true })
    .fill("test");
  await page
    .getByRole("dialog")
    .getByRole("link", { name: /TRK-2026-0042/ })
    .click();
  const editor = page.getByRole("group", { name: "Oprava umístění podkladu", exact: true });
  await editor.getByRole("spinbutton", { name: "Šířka (mm)", exact: true }).fill("9999");
  await editor.getByRole("button", { name: "Uložit umístění", exact: true }).click();
  await expect(editor.getByRole("alert")).toContainText("uvnitř");
  expect(patches).toHaveLength(0);
  await editor.getByRole("spinbutton", { name: "Šířka (mm)", exact: true }).fill("120");
  await editor.getByRole("spinbutton", { name: "X (mm)", exact: true }).fill("10");
  await editor.getByRole("button", { name: "Uložit umístění", exact: true }).click();
  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0]).toEqual({
    printAreaId: placement.printArea.id,
    x: 10,
    y: 0,
    width: 120,
    height: 100,
    rotationDeg: 0,
  });
});

test("reorder loads every page including inactive rows and sends the full unfiltered order", async ({
  page,
}) => {
  await mockStoreApi(page);
  await mockAuthApi(page, true);
  const rows = Array.from({ length: 22 }, (_, index) => ({
    id: `90000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`,
    name: `Barva ${index + 1}`,
    hexValue: "#123456",
    isActive: index !== 21,
    position: index * 10,
  }));
  const writes: { ids: string[] }[] = [];
  await page.route(/\/api\/v1\/admin\/colors(?:\?.*)?$/, (route) => {
    const query = new URL(route.request().url()).searchParams,
      pageNumber = Number(query.get("page") || 1);
    const filtered = query.get("isActive") === "true" ? rows.filter((row) => row.isActive) : rows;
    return route.fulfill({
      json: {
        count: filtered.length,
        results: filtered.slice((pageNumber - 1) * 20, pageNumber * 20),
        next: pageNumber * 20 < filtered.length ? "?page=2" : null,
        previous: null,
      },
    });
  });
  await page.route("**/api/v1/admin/colors/reorder", (route) => {
    writes.push(route.request().postDataJSON());
    expect(route.request().headers()["x-csrftoken"]).toBe("bootstrap-token");
    return route.fulfill({ status: 204 });
  });
  await page.goto("/admin/ciselniky");
  await page.getByRole("button", { name: "Změnit pořadí", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByText("Barva 22 (neaktivní)", { exact: false }),
  ).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Výš: Barva 2", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Uložit pořadí", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(writes[0]!.ids).toHaveLength(22);
  expect(writes[0]!.ids.slice(0, 2)).toEqual([rows[1]!.id, rows[0]!.id]);
});
