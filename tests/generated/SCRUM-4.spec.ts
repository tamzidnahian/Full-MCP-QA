import { test, expect } from '@playwright/test';

test('Verify the Hacker News homepage loads correctly and exposes useful navigation links', async ({ page }) => {
  await page.goto('/');

  // Check that the page title is 'Hacker News'
  await expect(page).toHaveTitle('Hacker News');

  // Verify the Hacker News header link is visible
  await expect(await page.getByRole('link', { name: 'Hacker News', exact: true })).toBeVisible();

  // Verify the top navigation new link is visible
  await expect(await page.getByRole('link', { name: 'new', exact: true })).toBeVisible();

  // Verify at least one story/content link is visible
  await expect(await page.locator('.titleline > a').first()).toBeVisible();
});