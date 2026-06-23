import { chromium } from "@playwright/test";
import { callMcpOperation } from "./mcpClient";
import { redact } from "./redact";
import { withSpan } from "./telemetry";

export async function inspectTarget(targetUrl: string, linkLimit = 100) {
  return withSpan("qa.target.inspect", { "target.origin": new URL(targetUrl).origin }, async () =>
    inspectTargetInner(targetUrl, linkLimit),
  );
}

async function inspectTargetInner(targetUrl: string, linkLimit = 100) {
  if (process.env.PLAYWRIGHT_MCP_ENABLED === "true") {
    try {
      await callMcpOperation("playwright.navigate", { url: targetUrl });
      const snapshot = await callMcpOperation("playwright.snapshot", {});
      await callMcpOperation("playwright.close", {}).catch(() => undefined);
      return typeof snapshot === "string" ? snapshot : JSON.stringify(snapshot, null, 2);
    } catch (error: any) {
      await callMcpOperation("playwright.close", {}).catch(() => undefined);
      console.warn(`Playwright MCP inspection failed; falling back to local browser: ${redact(error?.message ?? error, 500)}`);
    }
  }

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
