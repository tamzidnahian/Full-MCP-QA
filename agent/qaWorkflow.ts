import { appendFileSync, mkdirSync, writeFileSync } from "fs";
import { execFileSync } from "child_process";
import { chromium } from "@playwright/test";
import { z } from "zod";
import { commentOnTicket, getTicket } from "./jiraClient";
import { requiredEnv } from "./env";
import { validate } from "./guard";
import { codeModel, planModel } from "./llm";
import { publishResult } from "./integrations";
import { recentLessons, saveQaRun } from "./historyStore";

export type Ticket = {
  key: string;
  summary: string;
  description: string;
  status?: string;
};

export type GeneratedTest =
  | {
      ok: true;
      code: string;
    }
  | {
      ok: false;
      code: string;
      reason: string;
    };

export type RunMode = "manual" | "auto" | "watch" | "webhook" | "explicit";

const Plan = z.object({
  scenario: z.string(),
  steps: z.array(z.string()),
  assertions: z.array(z.string()),
});

export const guide = `
Agent output rules:
- Output must be one Playwright .ts file, nothing else.
- Import test and expect from '@playwright/test'.
- Use role, label, text, test-id, or CSS locators only when stable.
- Do not use XPath, waitForTimeout, test.skip, test.fixme, or test.only.
- Test must not submit forms or modify application data unless the ticket explicitly asks for it.
- Prefer page.goto('/') and rely on Playwright baseURL.
- Use the browser snapshot when provided and do not invent selectors that are absent from the current page.
- Prefer expect(page).toHaveURL(...) over exact page.url() equality; allow a normal trailing slash on homepages.
- For Hacker News story links, prefer page.locator('.titleline > a').first(); Hacker News no longer uses a.storylink.
- For the Hacker News More pagination link, use page.getByRole('link', { name: 'More' }).
`;

function npxBin() {
  return process.platform === "win32" ? "cmd.exe" : "npx";
}

function playwrightArgs(testFile: string) {
  const args = ["playwright", "test", testFile];
  return process.platform === "win32" ? ["/c", "npx.cmd", ...args] : args;
}

export async function inspectTarget(targetUrl: string) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(targetUrl);

  const title = await page.title();
  const links = await page.getByRole("link").evaluateAll((elements) =>
    elements.slice(0, 100).map((element) => ({
      text: element.textContent?.trim(),
      href: element.getAttribute("href"),
    })),
  );

  await browser.close();
  return JSON.stringify({ title, links }, null, 2);
}

export async function generateTest(ticket: Ticket): Promise<GeneratedTest> {
  const targetUrl = requiredEnv("TARGET_URL");
  const snapshot = await inspectTarget(targetUrl);
  const lessons = recentLessons(targetUrl);
  const plan = await planModel.withStructuredOutput(Plan).invoke(
    `${guide}\nTarget website: ${targetUrl}\n\nBrowser snapshot:\n${snapshot}\n\nLessons from previous runs:\n${lessons}\n\nTicket ${ticket.key}: ${ticket.summary}\n${ticket.description}\nProduce a concise safe UI test plan.`,
  );
  const codeResponse = await codeModel.invoke(
    `${guide}\nTarget website: ${targetUrl}\n\nBrowser snapshot:\n${snapshot}\n\nLessons from previous runs:\n${lessons}\n\nWrite ONE Playwright .ts test for this plan. Output ONLY code.\n${JSON.stringify(plan)}`,
  );
  const code = String(codeResponse.content).replace(/```ts|```typescript|```/g, "").trim();
  const guard = validate(code);

  if (!guard.ok) {
    return {
      ok: false,
      code,
      reason: guard.reason ?? "Generated test failed safety guard.",
    };
  }

  return { ok: true, code };
}

function issueImprovementHint(reason: string) {
  const lower = reason.toLowerCase();
  if (lower.includes("guard") || lower.includes("modify") || lower.includes("submit")) {
    return "Suggested issue improvement: clarify whether the test must be read-only and explicitly say which actions are allowed.";
  }
  if (lower.includes("no tests found") || lower.includes("selector") || lower.includes("locator") || lower.includes("visible")) {
    return "Suggested issue improvement: include stable visible UI expectations such as exact headings, link text, or route names.";
  }
  if (lower.includes("url") || lower.includes("route") || lower.includes("page")) {
    return "Suggested issue improvement: include the exact page or route the test should open.";
  }
  return "Suggested issue improvement: add clearer acceptance criteria with the target page, visible UI checks, and read-only safety expectations.";
}

export async function publishGuardFailure(ticket: Ticket, reason: string, mode: RunMode = "auto") {
  const startedAt = Date.now();
  const published = await publishResult({
    ticketKey: ticket.key,
    passed: false,
    testPath: "not written (guard failed)",
    failureLog: reason,
  });
  const endedAt = Date.now();

  await commentOnTicket(
    ticket.key,
    `AI-QA: BLOCKED. Guard failed before writing a test. Reason: ${reason}.${
      published.githubIssueUrl ? " GitHub issue: " + published.githubIssueUrl : ""
    }${published.warnings.length ? " Publish warnings: " + published.warnings.join(" | ") : ""} ${issueImprovementHint(
      reason,
    )}`,
  );
  const after = await getTicket(ticket.key).catch(() => undefined);

  saveQaRun({
    ticketKey: ticket.key,
    summary: ticket.summary,
    status: "blocked",
    failureLog: reason,
    githubIssueUrl: published.githubIssueUrl,
    jiraStatusBefore: ticket.status,
    jiraStatusAfter: after?.status,
    triggerSource: mode,
    startedAt,
    endedAt,
  });
}

export async function runAndPublishTest(
  ticket: Ticket,
  code: string,
  mode: RunMode = "manual",
) {
  const startedAt = Date.now();
  mkdirSync("tests/generated", { recursive: true });
  const testPath = `tests/generated/${ticket.key}.spec.ts`;
  writeFileSync(testPath, code);

  let passed = false;
  let failureLog = "";
  try {
    execFileSync(npxBin(), playwrightArgs(`generated/${ticket.key}.spec.ts`), { stdio: "pipe" });
    passed = true;
  } catch (error: any) {
    failureLog = String(error.stdout ?? error.stderr ?? error).slice(0, 1500);
  }

  const endedAt = Date.now();
  mkdirSync("metrics", { recursive: true });
  appendFileSync(
    "metrics/ledger.jsonl",
    JSON.stringify({
      ticket: ticket.key,
      passed,
      mode,
      failureLog: failureLog ? failureLog.slice(0, 500) : undefined,
      testPath,
      ts: endedAt,
    }) + "\n",
  );

  const published = await publishResult({
    ticketKey: ticket.key,
    passed,
    testPath,
    failureLog,
  });

  await commentOnTicket(
    ticket.key,
    `AI-QA: ${passed ? "PASSED" : "FAILED"}.${failureLog ? " Failure log: " + failureLog.slice(0, 500) : ""}${
      published.githubIssueUrl ? " GitHub issue: " + published.githubIssueUrl : ""
    }${
      published.warnings.length ? " Publish warnings: " + published.warnings.join(" | ") : ""
    }${!passed ? " " + issueImprovementHint(failureLog) : ""}`,
  );
  const after = await getTicket(ticket.key).catch(() => undefined);

  saveQaRun({
    ticketKey: ticket.key,
    summary: ticket.summary,
    testPath,
    testCode: code,
    status: passed ? "passed" : "failed",
    failureLog,
    githubIssueUrl: published.githubIssueUrl,
    jiraStatusBefore: ticket.status,
    jiraStatusAfter: after?.status,
    triggerSource: mode,
    startedAt,
    endedAt,
  });

  return {
    passed,
    failureLog,
    testPath,
    githubIssueUrl: published.githubIssueUrl,
    publishWarnings: published.warnings,
  };
}
