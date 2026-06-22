import { test, expect } from '@playwright/test';

test('Open the Hacker News homepage and verify elements are visible', async ({ page }) => {
  await page.goto('/');

  // Verify the page URL is correct
  await expect(page).toHaveURL('https://news.ycombinator.com/');

  // Check that the Hacker News navigation/header is visible
  const header = page.locator('text=Hacker News');
  await expect(header).toBeVisible();

  // Ensure at least one story link is visible
  const storyLink = page.locator('.titleline > a').first();
  await expect(storyLink).toBeVisible();

  // Verify that the More link is visible
  const moreLink = page.getByRole('link', { name: 'More' });
  await expect(moreLink).toBeVisible();
});