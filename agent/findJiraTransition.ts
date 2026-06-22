import { loadEnv, requiredEnv } from "./env";

loadEnv();

const doneNames = ["done", "complete", "completed", "resolved", "close", "closed"];

function jiraBaseUrl() {
  return requiredEnv("JIRA_BASE_URL").replace(/\/$/, "");
}

function authHeader() {
  const email = requiredEnv("JIRA_EMAIL");
  const token = requiredEnv("JIRA_API_TOKEN");
  return `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
}

async function jiraFetch(path: string, init: RequestInit = {}) {
  const response = await fetch(`${jiraBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Jira ${response.status}: ${body}`);
  }

  return response.json();
}

async function findIssueKey() {
  const projectFilter = process.env.JIRA_PROJECT_KEY ? `project = ${process.env.JIRA_PROJECT_KEY} AND ` : "";
  const labelFilter = process.env.JIRA_LABEL ? `labels = "${process.env.JIRA_LABEL}" AND ` : "";
  const searches = [
    `${projectFilter}${labelFilter}statusCategory != Done ORDER BY updated DESC`,
    `${projectFilter}statusCategory != Done ORDER BY updated DESC`,
    `${labelFilter}ORDER BY updated DESC`,
    "ORDER BY updated DESC",
  ];

  for (const jql of searches) {
    const result = await jiraFetch(`/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=1&fields=summary,status`);
    const issue = result.issues?.[0];
    if (issue?.key) return issue.key as string;
  }

  return undefined;
}

function updateEnv(key: string, value: string) {
  const fs = require("fs") as typeof import("fs");
  const path = ".env";
  const lines = fs.existsSync(path) ? fs.readFileSync(path, "utf8").split(/\r?\n/) : [];
  let found = false;

  const next = lines.map((line) => {
    if (line.match(new RegExp(`^\\s*${key}\\s*=`))) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!found) next.push(`${key}=${value}`);
  fs.writeFileSync(path, next.join("\n").replace(/\n*$/, "\n"));
}

async function main() {
  const explicitIssue = process.argv[2];
  const issueKey = explicitIssue || (await findIssueKey());
  if (!issueKey) throw new Error("No Jira issue found to inspect transitions.");

  const result = await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`);
  const transitions = (result.transitions ?? []) as Array<{ id: string; name: string; to?: { name?: string } }>;
  const done = transitions.find((transition) => {
    const text = `${transition.name} ${transition.to?.name ?? ""}`.toLowerCase();
    return doneNames.some((name) => text.includes(name));
  });

  console.log(`Issue inspected: ${issueKey}`);
  console.log("Available transitions:");
  for (const transition of transitions) {
    console.log(`- ${transition.id}: ${transition.name}${transition.to?.name ? ` -> ${transition.to.name}` : ""}`);
  }

  if (!done) {
    console.log("No Done-like transition found. Add the correct id to JIRA_TRANSITION_DONE_ID manually.");
    return;
  }

  updateEnv("JIRA_TRANSITION_DONE_ID", done.id);
  console.log(`Saved JIRA_TRANSITION_DONE_ID from transition: ${done.name} (${done.id})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
