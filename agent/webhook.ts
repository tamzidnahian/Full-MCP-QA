import { createServer, IncomingMessage, ServerResponse } from "http";
import { URL } from "url";
import { loadEnv, requiredEnv } from "./env";
import { processTicket } from "./autonomousRunner";

loadEnv();

const port = Number(process.env.AGENT_WEBHOOK_PORT ?? "8787");
const running = new Set<string>();

function readBody(request: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100_000) reject(new Error("Webhook body too large."));
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function send(response: ServerResponse, status: number, payload: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}

function issueKeyFromPayload(payload: any) {
  return String(payload.issueKey ?? payload.issue?.key ?? payload.key ?? "").trim();
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (request.method !== "POST" || url.pathname !== "/jira/webhook") {
      send(response, 404, { ok: false, error: "not_found" });
      return;
    }

    const expectedSecret = requiredEnv("JIRA_WEBHOOK_SECRET");
    const suppliedSecret = url.searchParams.get("secret") || request.headers["x-qa-agent-secret"];
    if (suppliedSecret !== expectedSecret) {
      send(response, 401, { ok: false, error: "unauthorized" });
      return;
    }

    const rawBody = await readBody(request);
    const payload = rawBody ? JSON.parse(rawBody) : {};
    const issueKey = issueKeyFromPayload(payload);
    if (!issueKey) {
      send(response, 400, { ok: false, error: "missing_issue_key" });
      return;
    }

    if (running.has(issueKey)) {
      send(response, 202, { ok: true, skipped: true, reason: "issue_already_running", issueKey });
      return;
    }

    running.add(issueKey);
    processTicket(issueKey, "webhook")
      .then((result) => {
        console.log(`Webhook QA complete for ${issueKey}. Passed: ${result.passed}`);
      })
      .catch((error) => {
        console.error(`Webhook QA failed for ${issueKey}:`, error);
      })
      .finally(() => running.delete(issueKey));

    send(response, 202, { ok: true, accepted: true, issueKey });
  } catch (error: any) {
    send(response, 500, { ok: false, error: String(error?.message ?? error) });
  }
});

server.listen(port, () => {
  console.log(`Jira QA webhook listening on http://localhost:${port}/jira/webhook`);
});
