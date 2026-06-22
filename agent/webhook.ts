import { createServer, IncomingMessage, ServerResponse } from "http";
import { createHmac, timingSafeEqual } from "crypto";
import { URL } from "url";
import { loadEnv, requiredEnv } from "./env";
import { processTicket } from "./autonomousRunner";

loadEnv();

const port = Number(process.env.AGENT_WEBHOOK_PORT ?? "8787");
const running = new Set<string>();
const recentRequests = new Map<string, number>();
const signatureWindowMs = Number(process.env.AGENT_WEBHOOK_SIGNATURE_WINDOW_MS ?? "300000");

function readBody(request: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100_000) {
        request.destroy();
        reject(new Error("Webhook body too large."));
      }
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

function isIssueKey(value: string) {
  return /^[A-Z][A-Z0-9]+-\d+$/.test(value);
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function validateSignature(request: IncomingMessage, rawBody: string) {
  const secret = requiredEnv("JIRA_WEBHOOK_SECRET");
  const sharedSecret = headerValue(request.headers["x-qa-agent-secret"]);
  if (process.env.AGENT_WEBHOOK_ALLOW_SHARED_SECRET === "true" && sharedSecret && safeEqual(sharedSecret, secret)) {
    return true;
  }

  const timestamp = headerValue(request.headers["x-qa-agent-timestamp"]);
  const signature = headerValue(request.headers["x-qa-agent-signature"]);
  if (!timestamp || !signature) return false;

  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber) || Math.abs(Date.now() - timestampNumber) > signatureWindowMs) return false;

  const expected = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
  if (!safeEqual(signature, expected)) return false;

  const requestKey = `${timestamp}:${signature}`;
  const now = Date.now();
  for (const [key, seenAt] of recentRequests) {
    if (now - seenAt > signatureWindowMs) recentRequests.delete(key);
  }
  if (recentRequests.has(requestKey)) return false;
  recentRequests.set(requestKey, now);
  return true;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (request.method !== "POST" || url.pathname !== "/jira/webhook") {
      send(response, 404, { ok: false, error: "not_found" });
      return;
    }

    const rawBody = await readBody(request);
    if (!validateSignature(request, rawBody)) {
      send(response, 401, { ok: false, error: "unauthorized" });
      return;
    }

    const payload = rawBody ? JSON.parse(rawBody) : {};
    const issueKey = issueKeyFromPayload(payload);
    if (!issueKey || !isIssueKey(issueKey)) {
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
