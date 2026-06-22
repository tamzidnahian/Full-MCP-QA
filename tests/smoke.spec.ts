import { expect, test } from "@playwright/test";

test("target homepage loads", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/.+/);
});
