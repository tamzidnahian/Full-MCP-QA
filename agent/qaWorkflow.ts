import { appendFileSync, mkdirSync, writeFileSync } from "fs";
import { commentOnTicket, getTicket } from "./jiraOps";
import { publishResult } from "./integrations";
import { saveQaRun } from "./historyStore";
import { generateTestWithGraph } from "./qaGraph";
import { redact, redactRecord } from "./redact";
import { runGeneratedTest } from "./testRunner";
import { withSpan } from "./telemetry";

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

export const guide = `
Agent output rules:
- Output must be one Playwright .ts file, nothing else.
- Import test and expect from '@playwright/test'.
- Use role, label, text, test-id, or CSS locators only when stable.
- Do not use page.locator('text=...'); prefer page.getByRole(...), page.getByText(...), or exact CSS for stable page structure.
- Do not use XPath, waitForTimeout, test.skip, test.fixme, or test.only.
- Test must not submit forms or modify application data unless the ticket explicitly asks for it.
- Prefer page.goto('/') and rely on Playwright baseURL.
- Use the browser snapshot when provided and do not invent selectors that are absent from the current page.
- Avoid unscoped role/text locators for very short or common labels; scope them to a stable container, use a stable href/CSS selector, or assert first() only when multiple matches are acceptable.
- If the browser snapshot lists a link href, prefer page.locator('a[href="..."]') or a scoped href selector over a short accessible name.
- Every visibility assertion must target one unique element, or intentionally use first() for repeated lists/content.
- Prefer expect(page).toHaveURL(...) over exact page.url() equality; allow a normal trailing slash on homepages.
`;

function safeTicketKey(ticketKey: string) {
  return ticketKey.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 80);
}

export async function generateTest(ticket: Ticket): Promise<GeneratedTest> {
  return generateTestWithGraph(ticket, guide);
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
    summary: ticket.summary,
    passed: false,
    testPath: "not written (guard failed)",
    failureLog: reason,
  });
  const endedAt = Date.now();

  await commentOnTicket(
    ticket.key,
    `AI-QA: BLOCKED. Guard failed before writing a test. Reason: ${redact(reason, 500)}.${
      published.githubIssueUrl ? " GitHub issue: " + published.githubIssueUrl : ""
    }${published.warnings.length ? " Publish warnings: " + redact(published.warnings.join(" | "), 500) : ""} ${issueImprovementHint(
      reason,
    )}`,
  );
  const after = await getTicket(ticket.key).catch(() => undefined);

  saveQaRun({
    ticketKey: ticket.key,
    summary: ticket.summary,
    status: "blocked",
    failureLog: redact(reason),
    githubIssueUrl: published.githubIssueUrl,
    githubPullRequestUrl: published.githubPullRequestUrl,
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
  const ticketFileKey = safeTicketKey(ticket.key);
  mkdirSync("tests/generated", { recursive: true });
  const testPath = `tests/generated/${ticketFileKey}.spec.ts`;
  writeFileSync(testPath, code);

  const testRun = await runGeneratedTest({
    ticketKey: ticket.key,
    testPath,
    testFile: `generated/${ticketFileKey}.spec.ts`,
  });
  const passed = testRun.passed;
  const failureLog = testRun.failureLog;

  const endedAt = Date.now();
  mkdirSync("metrics", { recursive: true });
  appendFileSync(
    "metrics/ledger.jsonl",
    JSON.stringify(redactRecord({
      ticket: ticket.key,
      passed,
      mode,
      failureLog: failureLog ? failureLog.slice(0, 500) : undefined,
      testPath,
      ts: endedAt,
    })) + "\n",
  );

  const published = await withSpan(
    "qa.publish",
    { "ticket.key": ticket.key, "qa.status": passed ? "passed" : "failed", "test.path": testPath },
    async () =>
      publishResult({
        ticketKey: ticket.key,
        summary: ticket.summary,
        passed,
        testPath,
        testCode: code,
        failureLog,
      }),
  );

  await commentOnTicket(
    ticket.key,
    `AI-QA: ${passed ? "PASSED" : "FAILED"}.${failureLog ? " Failure log: " + redact(failureLog, 500) : ""}${
      published.githubIssueUrl ? " GitHub issue: " + published.githubIssueUrl : ""
    }${published.githubPullRequestUrl ? " GitHub PR: " + published.githubPullRequestUrl : ""}${
      published.warnings.length ? " Publish warnings: " + redact(published.warnings.join(" | "), 500) : ""
    }${!passed ? " " + issueImprovementHint(failureLog) : ""}`,
  );
  const after = await getTicket(ticket.key).catch(() => undefined);

  saveQaRun({
    ticketKey: ticket.key,
    summary: ticket.summary,
    testPath,
    testCode: redact(code),
    status: passed ? "passed" : "failed",
    failureLog: redact(failureLog),
    githubIssueUrl: published.githubIssueUrl,
    githubPullRequestUrl: published.githubPullRequestUrl,
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
    githubPullRequestUrl: published.githubPullRequestUrl,
    publishWarnings: published.warnings,
  };
}
