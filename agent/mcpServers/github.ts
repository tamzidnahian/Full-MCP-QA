import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  addIssueComment,
  createBranch,
  createGitHubIssue,
  createOrUpdateFile,
  createPullRequest,
  findPullRequest,
} from "../githubClient";
import { loadEnv } from "../env";
import { jsonContent } from "./common";

loadEnv();

const server = new McpServer({
  name: "website-qa-agent-github",
  version: "0.1.0",
});

server.tool(
  "create_issue",
  {
    title: z.string().min(1),
    body: z.string(),
    labels: z.array(z.string()).optional(),
  },
  async (input) => {
    return jsonContent({ url: await createGitHubIssue(input) });
  },
);

server.tool(
  "create_branch",
  {
    branch: z.string().min(1),
    baseBranch: z.string().optional(),
  },
  async ({ branch, baseBranch }) => {
    return jsonContent(await createBranch(branch, baseBranch));
  },
);

server.tool(
  "create_or_update_file",
  {
    branch: z.string().min(1),
    path: z.string().min(1),
    content: z.string(),
    message: z.string().min(1),
  },
  async (input) => {
    return jsonContent(await createOrUpdateFile(input));
  },
);

server.tool(
  "find_pull_request",
  {
    branch: z.string().min(1),
    baseBranch: z.string().optional(),
  },
  async ({ branch, baseBranch }) => {
    return jsonContent(await findPullRequest(branch, baseBranch));
  },
);

server.tool(
  "create_pull_request",
  {
    title: z.string().min(1),
    body: z.string(),
    head: z.string().min(1),
    base: z.string().optional(),
  },
  async (input) => {
    return jsonContent(await createPullRequest(input));
  },
);

server.tool(
  "add_issue_comment",
  {
    issueNumber: z.number().int().positive(),
    body: z.string(),
  },
  async ({ issueNumber, body }) => {
    return jsonContent(await addIssueComment(issueNumber, body));
  },
);

server.connect(new StdioServerTransport());
