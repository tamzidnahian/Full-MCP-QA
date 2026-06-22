import { loadEnv } from "./env";
import { isRealValue } from "./config";

loadEnv();

type GitHubIssueInput = {
  title: string;
  body: string;
  labels?: string[];
};

function githubRepo() {
  return process.env.GITHUB_REPO;
}

function githubToken() {
  return process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
}

export async function createGitHubIssue(input: GitHubIssueInput) {
  const repo = githubRepo();
  const token = githubToken();
  if (!isRealValue(repo) || !isRealValue(token)) return undefined;

  const response = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "website-qa-agent",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub ${response.status}: ${body}`);
  }

  const issue = await response.json();
  return String(issue.html_url ?? "");
}
