import { chromium } from "@playwright/test";

export async function inspectTarget(targetUrl: string, linkLimit = 100) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(targetUrl);

  const title = await page.title();
  const links = await page.getByRole("link").evaluateAll((elements, limit) =>
    elements.slice(0, limit).map((element) => ({
      text: element.textContent?.trim(),
      href: element.getAttribute("href"),
    })),
    linkLimit,
  );
  const buttons = await page.getByRole("button").evaluateAll((elements) =>
    elements.slice(0, 20).map((element) => element.textContent?.trim()),
  );

  await browser.close();
  return JSON.stringify({ title, links, buttons }, null, 2);
}
