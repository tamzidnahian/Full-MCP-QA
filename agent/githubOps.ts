import { isRealValue } from "./config";
import { callMcpOperation } from "./mcpClient";

type GitHubIssueInput = {
  title: string;
  body: string;
  labels?: string[];
};

type PullRequestInput = {
  ticketKey: string;
  testPath: string;
  code: string;
  summary: string;
};

type UrlResult = {
  url?: string;
  htmlUrl?: string;
};

function githubConfigured() {
  return isRealValue(process.env.GITHUB_REPO) && isRealValue(process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN);
}

function githubBaseBranch() {
  return process.env.GITHUB_BASE_BRANCH || "main";
}

function safeTicketKey(ticketKey: string) {
  return ticketKey.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 80);
}

function resultUrl(result: UrlResult | undefined) {
  return result?.url || result?.htmlUrl || undefined;
}

export async function createGitHubIssue(input: GitHubIssueInput) {
  if (!githubConfigured()) return undefined;
  const result = await callMcpOperation<UrlResult>("github.createIssue", input);
  return resultUrl(result);
}

export async function createGeneratedTestPullRequest(input: PullRequestInput) {
  if (!githubConfigured()) return undefined;

  const baseBranch = githubBaseBranch();
  const branch = `ai-qa/${safeTicketKey(input.ticketKey)}`;

  await callMcpOperation("github.createBranch", { branch, baseBranch });
  await callMcpOperation("github.createOrUpdateFile", {
    branch,
    path: input.testPath,
    content: input.code,
    message: `Add AI QA test for ${input.ticketKey}`,
  });

  const existing = await callMcpOperation<UrlResult>("github.findPullRequest", { branch, baseBranch });
  const existingUrl = resultUrl(existing);
  if (existingUrl) return existingUrl;

  const created = await callMcpOperation<UrlResult>("github.createPullRequest", {
    title: `AI-QA test for ${input.ticketKey}`,
    head: branch,
    base: baseBranch,
    body:
      `Generated Playwright QA test for Jira issue ${input.ticketKey}.\n\n` +
      `Summary: ${input.summary}\n\n` +
      `Test file: \`${input.testPath}\``,
  });
  return resultUrl(created);
}
