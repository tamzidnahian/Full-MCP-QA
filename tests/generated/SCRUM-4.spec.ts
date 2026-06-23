import { test, expect } from '@playwright/test';

test('Verify the Hacker News homepage loads correctly and exposes stable navigation elements', async ({ page }) => {
  await page.goto('/');

  // Assert that the page title is 'Hacker News'
  await expect(page).toHaveTitle('Hacker News');

  // Verify that the Hacker News header link is visible
  await expect(page.locator('a[href="news"]')).toBeVisible();

  // Verify that the top navigation 'new' link is visible
  await expect(page.locator('a[href="newest"]')).toBeVisible();

  // Verify that at least one story/content link is visible
  await expect(page.locator('.titleline > a').first()).toBeVisible();
});