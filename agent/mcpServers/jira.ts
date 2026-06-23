import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { addLabel, commentOnTicket, findReadyTickets, getTicket, removeLabel, transitionTicket, updateTicket } from "../jiraClient";
import { loadEnv } from "../env";
import { jsonContent } from "./common";

loadEnv();

const server = new McpServer({
  name: "website-qa-agent-jira",
  version: "0.1.0",
});

server.tool("get_issue", { key: z.string().min(1) }, async ({ key }) => {
  return jsonContent(await getTicket(key));
});

server.tool("find_ready_issues", { maxResults: z.number().int().min(1).max(50).optional() }, async ({ maxResults }) => {
  return jsonContent(await findReadyTickets(maxResults ?? 5));
});

server.tool("comment_issue", { key: z.string().min(1), text: z.string() }, async ({ key, text }) => {
  await commentOnTicket(key, text);
  return jsonContent({ ok: true });
});

server.tool(
  "update_issue",
  {
    key: z.string().min(1),
    summary: z.string().optional(),
    description: z.string().optional(),
  },
  async ({ key, summary, description }) => {
    await updateTicket(key, { summary, description });
    return jsonContent({ ok: true });
  },
);

server.tool("add_label", { key: z.string().min(1), label: z.string().min(1) }, async ({ key, label }) => {
  await addLabel(key, label);
  return jsonContent({ ok: true });
});

server.tool("remove_label", { key: z.string().min(1), label: z.string().min(1) }, async ({ key, label }) => {
  await removeLabel(key, label);
  return jsonContent({ ok: true });
});

server.tool(
  "transition_issue",
  { key: z.string().min(1), transitionId: z.string().min(1) },
  async ({ key, transitionId }) => {
    await transitionTicket(key, transitionId);
    return jsonContent({ ok: true });
  },
);

server.connect(new StdioServerTransport());
