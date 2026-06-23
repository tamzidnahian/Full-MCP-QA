import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { isRealValue } from "./config";
import { loadEnv } from "./env";
import { latestQaRun } from "./historyStore";
import { jsonContent } from "./mcpServers/common";

loadEnv();

function safeLatestRun() {
  const latestRun = latestQaRun();
  if (!latestRun) return null;
  const { test_code, failure_log, ...rest } = latestRun;
  return {
    ...rest,
    hasTestCode: Boolean(test_code),
    failureLogPreview: failure_log ? String(failure_log).slice(0, 200) : "",
  };
}

function statusPayload() {
  return {
    targetUrl: process.env.TARGET_URL,
    jiraConfigured: Boolean(
      isRealValue(process.env.JIRA_BASE_URL) &&
        isRealValue(process.env.JIRA_EMAIL) &&
        isRealValue(process.env.JIRA_API_TOKEN),
    ),
    openAiConfigured: isRealValue(process.env.OPENAI_API_KEY),
    slackConfigured: Boolean(
      isRealValue(process.env.SLACK_WEBHOOK_URL) ||
        (isRealValue(process.env.SLACK_BOT_TOKEN) && isRealValue(process.env.SLACK_CHANNEL_ID)),
    ),
    githubConfigured: Boolean(
      isRealValue(process.env.GITHUB_REPO) &&
        (isRealValue(process.env.GITHUB_TOKEN) || isRealValue(process.env.GITHUB_PERSONAL_ACCESS_TOKEN)),
    ),
    jiraTransitionConfigured: isRealValue(process.env.JIRA_TRANSITION_DONE_ID),
    telemetryEnabled: process.env.OTEL_ENABLED === "true",
    latestRun: safeLatestRun(),
  };
}

const server = new McpServer({
  name: "website-qa-agent-status",
  version: "0.1.0",
});

server.tool("qa_agent_status", {}, async () => jsonContent(statusPayload()));

server.connect(new StdioServerTransport());
