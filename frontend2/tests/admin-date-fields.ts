import type { Page } from "@playwright/test";

export async function fillAdminDate(page: Page, label: string, sections: Record<string, string>) {
  const field = page.getByRole("group", { name: label, exact: true });
  for (const [name, digits] of Object.entries(sections)) {
    await field.getByRole("spinbutton", { name, exact: true }).click();
    await page.keyboard.type(digits);
  }
  await page.keyboard.press("Tab");
}
