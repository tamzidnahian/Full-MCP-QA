import { test, expect } from '@playwright/test';

test('Verify the Hacker News homepage loads correctly and exposes useful navigation links', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Hacker News');
    
    await expect(await page.getByRole('link', { name: 'Hacker News', exact: true })).toBeVisible();
    await expect(await page.getByRole('link', { name: 'new', exact: true })).toBeVisible();
    await expect(await page.locator('.titleline > a').first()).toBeVisible();
});