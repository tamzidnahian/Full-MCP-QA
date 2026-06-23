import { callMcpOperation } from "./mcpClient";

export type JiraTicket = {
  key: string;
  summary: string;
  description: string;
  status?: string;
};

export async function getTicket(key: string) {
  return callMcpOperation<JiraTicket>("jira.getIssue", { key });
}

export async function findReadyTickets(maxResults = 5) {
  return callMcpOperation<JiraTicket[]>("jira.findReadyIssues", { maxResults });
}

export async function commentOnTicket(key: string, text: string) {
  await callMcpOperation("jira.commentIssue", { key, text });
}

export async function updateTicket(key: string, fields: { summary?: string; description?: string }) {
  await callMcpOperation("jira.updateIssue", { key, ...fields });
}

export async function addLabel(key: string, label: string) {
  if (!label) return;
  await callMcpOperation("jira.addLabel", { key, label });
}

export async function removeLabel(key: string, label: string) {
  if (!label) return;
  await callMcpOperation("jira.removeLabel", { key, label });
}

export async function transitionTicket(key: string, transitionId: string) {
  if (!transitionId) return;
  await callMcpOperation("jira.transitionIssue", { key, transitionId });
}
