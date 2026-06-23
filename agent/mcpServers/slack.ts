import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadEnv } from "../env";
import { notifySlack } from "../slackClient";
import { jsonContent } from "./common";

loadEnv();

const server = new McpServer({
  name: "website-qa-agent-slack",
  version: "0.1.0",
});

server.tool("post_message", { text: z.string(), channel: z.string().optional() }, async ({ text }) => {
  return jsonContent({ ok: await notifySlack(text) });
});

server.connect(new StdioServerTransport());
