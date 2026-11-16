import { expect, test } from "@playwright/test";

test.skip(!process.env.LIVE_API_TESTS, "Run bun run test:e2e:api with the Docker backend running.");
test.use({ baseURL: "http://localhost:5173" });

test("browser loads real Docker API over CORS with credentials", async ({ page }) => {
  // Same host, different ports: cookies can be sent, but fetch still needs credentials: include.
  await page.context().addCookies([
    {
      name: "trikonos_api_smoke",
      value: "credentials-check",
      url: "http://localhost:8000",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const configResponse = page.waitForResponse("http://localhost:8000/api/v1/config");
  const optionsResponse = page.waitForResponse("http://localhost:8000/api/v1/catalog/options");
  const catalogResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/v1/motifs",
  );
  await page.goto("/tricka");
  const [config, options] = await Promise.all([configResponse, optionsResponse]);
  for (const response of [config, options]) {
    expect(response.ok()).toBe(true);
    expect(response.headers()["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(response.headers()["access-control-allow-credentials"]).toBe("true");
    expect((await response.request().allHeaders()).cookie).toContain(
      "trikonos_api_smoke=credentials-check",
    );
  }
  const data = await config.json();
  expect(typeof data.shopName).toBe("string");
  expect(Array.isArray((await options.json()).productTypes)).toBe(true);
  await expect(page.getByRole("link", { name: `${data.shopName}, úvodní stránka` })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  const catalog = await (await catalogResponse).json();
  expect(Array.isArray(catalog.results)).toBe(true);
  if (!catalog.count) {
    await expect(page.getByText("Žádné motivy neodpovídají výběru.")).toBeVisible();
    return;
  }
  await page.locator(".catalog-grid .product-card-link").first().click();
  await expect(page.locator(".product-info h1")).toBeVisible();
  const colors = page.locator('label:has(input[name="color"])');
  if (!(await colors.count())) {
    await expect(page.getByText("Motiv zatím nemá dostupné varianty.")).toBeVisible();
    const lookups = await options.json();
    if (
      !lookups.productTypes.length ||
      !lookups.cuts.length ||
      !lookups.colors.length ||
      !lookups.sizes.length
    )
      return;
    // A local stale snapshot exercises unavailable variants without changing the DB.
    await page.evaluate(
      (item) => localStorage.setItem("trikonos-cart-v2", JSON.stringify([item])),
      {
        kind: "catalog",
        motifId: catalog.results[0].id,
        name: catalog.results[0].name,
        productTypeId: lookups.productTypes[0].id,
        cutId: lookups.cuts[0].id,
        colorId: lookups.colors[0].id,
        size: lookups.sizes[0].value,
        quantity: 1,
        unitPrice: catalog.results[0].price,
      },
    );
    const validation = page.waitForResponse("http://localhost:8000/api/v1/cart/validate");
    await page.goto("/kosik");
    expect((await validation).status()).toBe(200);
    await expect(page.getByText("Položka není dostupná nebo ji nelze ocenit.")).toBeVisible();
    return;
  }
  await colors.first().click();
  await page.locator('label:has(input[name="size"])').first().click();
  await page.getByRole("button", { name: "Přidat do košíku" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Košík, počet položek: 1" })).toBeVisible();
  const validation = page.waitForResponse("http://localhost:8000/api/v1/cart/validate");
  await page.getByRole("button", { name: "Košík, počet položek: 1" }).click();
  expect((await validation).status()).toBe(200);
  await expect(page.getByText("Aktuální cena:", { exact: false })).toBeVisible();
});
