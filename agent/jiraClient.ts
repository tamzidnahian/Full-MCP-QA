import { loadEnv, requiredEnv } from "./env";
import { isRealValue } from "./config";

loadEnv();

const jiraBaseUrl = () => requiredEnv("JIRA_BASE_URL").replace(/\/$/, "");

const authHeader = () => {
  const email = requiredEnv("JIRA_EMAIL");
  const token = requiredEnv("JIRA_API_TOKEN");
  return `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
};

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
    const text = await response.text();
    throw new Error(`Jira ${response.status}: ${text}`);
  }

  return response;
}

function adfToText(value: any): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(adfToText).filter(Boolean).join("\n");
  if (typeof value !== "object") return "";

  const ownText = typeof value.text === "string" ? value.text : "";
  const childText = adfToText(value.content);
  return [ownText, childText].filter(Boolean).join(value.type === "paragraph" ? "\n" : "");
}

function textToAdf(text: string) {
  return {
    type: "doc",
    version: 1,
    content: text.split(/\r?\n/).map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : [],
    })),
  };
}

export async function getTicket(key: string) {
  const response = await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(key)}`);
  const issue = await response.json();

  return {
    key: issue.key as string,
    summary: String(issue.fields?.summary ?? ""),
    description: adfToText(issue.fields?.description).trim(),
    status: String(issue.fields?.status?.name ?? ""),
  };
}

export async function searchTickets(jql: string, maxResults = 10) {
  const response = await jiraFetch(
    `/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=${maxResults}&fields=summary,description,status`,
  );
  const result = await response.json();

  return (result.issues ?? []).map((issue: any) => ({
    key: issue.key as string,
    summary: String(issue.fields?.summary ?? ""),
    description: adfToText(issue.fields?.description).trim(),
    status: String(issue.fields?.status?.name ?? ""),
  }));
}

export async function findReadyTickets(maxResults = 5) {
  const readyLabel = requiredEnv("JIRA_LABEL");
  const failureLabel = process.env.JIRA_AUTONOMOUS_FAILURE_LABEL || "ai-qa-failed";
  const projectClause = isRealValue(process.env.JIRA_PROJECT_KEY) ? `project = ${process.env.JIRA_PROJECT_KEY} AND ` : "";
  const jql =
    `${projectClause}labels = "${readyLabel}" AND labels not in ("${failureLabel}") ` +
    "AND statusCategory != Done ORDER BY updated ASC";

  return searchTickets(jql, maxResults);
}

export async function commentOnTicket(key: string, text: string) {
  await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(key)}/comment`, {
    method: "POST",
    body: JSON.stringify({
      body: {
        type: "doc",
        version: 1,
        content: [{ type: "paragraph", content: [{ type: "text", text }] }],
      },
    }),
  });
}

export async function updateTicket(key: string, fields: { summary?: string; description?: string }) {
  await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: JSON.stringify({
      fields: {
        ...(fields.summary ? { summary: fields.summary } : {}),
        ...(fields.description ? { description: textToAdf(fields.description) } : {}),
      },
    }),
  });
}

export async function addLabel(key: string, label: string) {
  if (!label) return;

  await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: JSON.stringify({
      update: {
        labels: [{ add: label }],
      },
    }),
  });
}

export async function removeLabel(key: string, label: string) {
  if (!label) return;

  await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: JSON.stringify({
      update: {
        labels: [{ remove: label }],
      },
    }),
  });
}

export async function transitionTicket(key: string, transitionId: string) {
  if (!transitionId) return;

  await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(key)}/transitions`, {
    method: "POST",
    body: JSON.stringify({
      transition: { id: transitionId },
    }),
  });
}
