import { loadEnv } from "./env";
import { isRealValue } from "./config";
import { redact } from "./redact";

loadEnv();

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

function githubRepo() {
  return process.env.GITHUB_REPO;
}

function githubToken() {
  return process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
}

function githubBaseBranch() {
  return process.env.GITHUB_BASE_BRANCH || "main";
}

function authHeaders(token: string) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "website-qa-agent",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function contentPath(path: string) {
  return encodeURIComponent(path).replace(/%2F/g, "/");
}

async function githubFetch(path: string, init: RequestInit = {}) {
  const repo = githubRepo();
  const token = githubToken();
  if (!isRealValue(repo) || !isRealValue(token)) return undefined;
  const repoName = repo as string;
  const tokenValue = token as string;

  const response = await fetch(`https://api.github.com/repos/${repoName}${path}`, {
    ...init,
    headers: {
      ...authHeaders(tokenValue),
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub ${response.status}: ${redact(body, 1000)}`);
  }

  return response;
}

export async function createGitHubIssue(input: GitHubIssueInput) {
  const repo = githubRepo();
  const token = githubToken();
  if (!isRealValue(repo) || !isRealValue(token)) return undefined;
  const repoName = repo as string;
  const tokenValue = token as string;

  const response = await fetch(`https://api.github.com/repos/${repoName}/issues`, {
    method: "POST",
    headers: authHeaders(tokenValue),
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub ${response.status}: ${redact(body, 1000)}`);
  }

  const issue = await response.json();
  return String(issue.html_url ?? "");
}

async function getRepoOwner() {
  return githubRepo()?.split("/")[0] ?? "";
}

async function getRefSha(branch: string) {
  const response = await githubFetch(`/git/ref/heads/${encodeURIComponent(branch)}`);
  if (!response) return undefined;
  const ref = await response.json();
  return String(ref.object?.sha ?? "");
}

async function ensureBranch(branch: string, baseBranch: string) {
  const existing = await getRefSha(branch).catch(() => undefined);
  if (existing) return existing;

  const baseSha = await getRefSha(baseBranch);
  if (!baseSha) throw new Error(`Unable to find GitHub base branch ${baseBranch}.`);

  const response = await githubFetch("/git/refs", {
    method: "POST",
    body: JSON.stringify({
      ref: `refs/heads/${branch}`,
      sha: baseSha,
    }),
  });
  if (!response) return undefined;
  const ref = await response.json();
  return String(ref.object?.sha ?? "");
}

async function existingFileSha(path: string, branch: string) {
  const response = await githubFetch(`/contents/${contentPath(path)}?ref=${encodeURIComponent(branch)}`).catch(() => undefined);
  if (!response) return undefined;
  const file = await response.json();
  return typeof file.sha === "string" ? file.sha : undefined;
}

async function upsertFile(path: string, branch: string, content: string, message: string) {
  const sha = await existingFileSha(path, branch);
  await githubFetch(`/contents/${contentPath(path)}`, {
    method: "PUT",
    body: JSON.stringify({
      branch,
      message,
      content: Buffer.from(content, "utf8").toString("base64"),
      ...(sha ? { sha } : {}),
    }),
  });
}

async function existingPullRequest(branch: string, baseBranch: string) {
  const owner = await getRepoOwner();
  const response = await githubFetch(
    `/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}&base=${encodeURIComponent(baseBranch)}`,
  );
  if (!response) return undefined;
  const pulls = await response.json();
  const pull = Array.isArray(pulls) ? pulls[0] : undefined;
  return pull?.html_url ? String(pull.html_url) : undefined;
}

export async function createGeneratedTestPullRequest(input: PullRequestInput) {
  const repo = githubRepo();
  const token = githubToken();
  if (!isRealValue(repo) || !isRealValue(token)) return undefined;

  const baseBranch = githubBaseBranch();
  const safeTicketKey = input.ticketKey.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 80);
  const branch = `ai-qa/${safeTicketKey}`;
  await ensureBranch(branch, baseBranch);
  await upsertFile(input.testPath, branch, input.code, `Add AI QA test for ${input.ticketKey}`);

  const existingPr = await existingPullRequest(branch, baseBranch);
  if (existingPr) return existingPr;

  const response = await githubFetch("/pulls", {
    method: "POST",
    body: JSON.stringify({
      title: `AI-QA test for ${input.ticketKey}`,
      head: branch,
      base: baseBranch,
      body:
        `Generated Playwright QA test for Jira issue ${input.ticketKey}.\n\n` +
        `Summary: ${input.summary}\n\n` +
        `Test file: \`${input.testPath}\``,
    }),
  });
  if (!response) return undefined;
  const pull = await response.json();
  return String(pull.html_url ?? "");
}
