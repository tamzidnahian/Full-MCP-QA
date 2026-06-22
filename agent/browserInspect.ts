import { chromium } from "@playwright/test";
import { loadEnv, requiredEnv } from "./env";

loadEnv();

async function main() {
  const url = requiredEnv("TARGET_URL");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url);

  const title = await page.title();
  const links = await page.getByRole("link").evaluateAll((elements) =>
    elements.slice(0, 20).map((element) => ({
      text: element.textContent?.trim(),
      href: element.getAttribute("href"),
    })),
  );
  const buttons = await page.getByRole("button").evaluateAll((elements) =>
    elements.slice(0, 20).map((element) => element.textContent?.trim()),
  );

  console.log(JSON.stringify({ url, title, links, buttons }, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
