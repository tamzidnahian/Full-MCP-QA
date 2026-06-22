import { isRealValue } from "./config";
import { loadEnv } from "./env";
import { latestQaRun } from "./historyStore";

loadEnv();

type JsonRpcRequest = {
  id?: string | number;
  method?: string;
  params?: any;
};

function send(id: JsonRpcRequest["id"], result: unknown) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

function sendError(id: JsonRpcRequest["id"], code: number, message: string) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n");
}

async function handle(request: JsonRpcRequest) {
  if (request.method === "initialize") {
    send(request.id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "website-qa-agent", version: "0.1.0" },
    });
    return;
  }

  if (request.method === "tools/list") {
    send(request.id, {
      tools: [
        {
          name: "qa_agent_status",
          description: "Return Website QA Agent configuration and latest run status.",
          inputSchema: { type: "object", properties: {} },
        },
      ],
    });
    return;
  }

  if (request.method === "tools/call" && request.params?.name === "qa_agent_status") {
    send(request.id, {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
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
              latestRun: latestQaRun() ?? null,
            },
            null,
            2,
          ),
        },
      ],
    });
    return;
  }

  if (request.id !== undefined) sendError(request.id, -32601, `Unknown method: ${request.method}`);
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split(/\r?\n/);
  buffer = lines.pop() ?? "";

  for (const line of lines) {
    if (!line.trim()) continue;
    handle(JSON.parse(line)).catch((error) => sendError(undefined, -32603, String(error)));
  }
});
