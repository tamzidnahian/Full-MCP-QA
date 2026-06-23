import { test, expect } from '@playwright/test';

test('Verify the Hacker News homepage loads correctly and exposes stable navigation elements', async ({ page }) => {
  await page.goto('/');

  // Assert that the page title is 'Hacker News'
  await expect(page).toHaveTitle('Hacker News');

  // Verify that the Hacker News header link is visible
  const headerLink = page.locator('a[href="news"]');
  await expect(headerLink).toBeVisible();

  // Verify that the 'new' link is visible
  const newLink = page.locator('a[href="newest"]');
  await expect(newLink).toBeVisible();

  // Verify that at least one story/content link is visible
  const firstStoryLink = page.locator('.titleline > a').first();
  await expect(firstStoryLink).toBeVisible();
});