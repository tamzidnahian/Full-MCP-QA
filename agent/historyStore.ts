import { mkdirSync } from "fs";
import { requiredEnv } from "./env";
import { redact } from "./redact";

const Database = require("better-sqlite3");

export type RunStatus = "passed" | "failed" | "blocked";

export type QaRunRecord = {
  ticketKey: string;
  summary: string;
  targetUrl?: string;
  testPath?: string;
  testCode?: string;
  status: RunStatus;
  failureLog?: string;
  githubIssueUrl?: string;
  githubPullRequestUrl?: string;
  jiraStatusBefore?: string;
  jiraStatusAfter?: string;
  triggerSource: string;
  startedAt: number;
  endedAt: number;
};

export type McpAuditRecord = {
  server: string;
  tool: string;
  input?: unknown;
  output?: unknown;
  ok: boolean;
  error?: string;
  durationMs: number;
  createdAt?: number;
};

function safeJson(value: unknown) {
  try {
    return redact(JSON.stringify(value ?? {}));
  } catch {
    return redact(String(value ?? ""));
  }
}

function db() {
  mkdirSync("state", { recursive: true });
  const database = new Database("state/agent.sqlite");
  database
    .prepare(
      `CREATE TABLE IF NOT EXISTS qa_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_key TEXT NOT NULL,
        summary TEXT NOT NULL,
        target_url TEXT,
        test_path TEXT,
        test_code TEXT,
        status TEXT NOT NULL,
        failure_log TEXT,
        github_issue_url TEXT,
        github_pull_request_url TEXT,
        jira_status_before TEXT,
        jira_status_after TEXT,
        trigger_source TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER NOT NULL
      )`,
    )
    .run();
  const columns = database.prepare("PRAGMA table_info(qa_runs)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "github_pull_request_url")) {
    database.prepare("ALTER TABLE qa_runs ADD COLUMN github_pull_request_url TEXT").run();
  }
  database
    .prepare(
      `CREATE TABLE IF NOT EXISTS job_locks (
        ticket_key TEXT PRIMARY KEY,
        mode TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
    )
    .run();
  database
    .prepare(
      `CREATE TABLE IF NOT EXISTS mcp_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_name TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        input_json TEXT NOT NULL,
        output_json TEXT,
        ok INTEGER NOT NULL,
        error TEXT,
        duration_ms INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      )`,
    )
    .run();
  return database;
}

export function saveQaRun(record: QaRunRecord) {
  db()
    .prepare(
      `INSERT INTO qa_runs (
        ticket_key, summary, target_url, test_path, test_code, status, failure_log,
        github_issue_url, github_pull_request_url, jira_status_before, jira_status_after, trigger_source, started_at, ended_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      record.ticketKey,
      record.summary,
      record.targetUrl ?? requiredEnv("TARGET_URL"),
      record.testPath ?? "",
      redact(record.testCode ?? ""),
      record.status,
      redact(record.failureLog ?? ""),
      record.githubIssueUrl ?? "",
      record.githubPullRequestUrl ?? "",
      record.jiraStatusBefore ?? "",
      record.jiraStatusAfter ?? "",
      record.triggerSource,
      record.startedAt,
      record.endedAt,
    );
}

export function acquireJobLock(ticketKey: string, mode: string, ttlMs = 30 * 60 * 1000) {
  const database = db();
  const now = Date.now();
  database.prepare("DELETE FROM job_locks WHERE created_at < ?").run(now - ttlMs);

  try {
    database
      .prepare("INSERT INTO job_locks (ticket_key, mode, created_at) VALUES (?, ?, ?)")
      .run(ticketKey, mode, now);
    return true;
  } catch (error: any) {
    if (String(error?.code ?? "").includes("SQLITE_CONSTRAINT")) return false;
    throw error;
  }
}

export function releaseJobLock(ticketKey: string) {
  db().prepare("DELETE FROM job_locks WHERE ticket_key = ?").run(ticketKey);
}

export async function recordMcpAudit(record: McpAuditRecord) {
  db()
    .prepare(
      `INSERT INTO mcp_audit (
        server_name, tool_name, input_json, output_json, ok, error, duration_ms, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      record.server,
      record.tool,
      safeJson(record.input ?? {}),
      typeof record.output === "undefined" ? null : safeJson(record.output),
      record.ok ? 1 : 0,
      record.error ? redact(record.error, 1500) : null,
      record.durationMs,
      record.createdAt ?? Date.now(),
    );
}

export function latestQaRun() {
  return db().prepare("SELECT * FROM qa_runs ORDER BY ended_at DESC, id DESC LIMIT 1").get() as any | undefined;
}

export function recentQaRuns(targetUrl: string, limit = 5) {
  return db()
    .prepare("SELECT * FROM qa_runs WHERE target_url = ? ORDER BY ended_at DESC, id DESC LIMIT ?")
    .all(targetUrl, limit) as any[];
}

export function recentLessons(targetUrl: string, limit = 5) {
  const rows = recentQaRuns(targetUrl, limit);
  const failures = rows.filter((row) => row.status !== "passed" && row.failure_log);
  if (failures.length === 0) return "No prior failures recorded for this target.";

  return failures
    .map((row) => `- ${row.ticket_key} ${row.status}: ${String(row.failure_log).slice(0, 300)}`)
    .join("\n");
}

export function printHistory(limit = 10) {
  const rows = db()
    .prepare("SELECT * FROM qa_runs ORDER BY ended_at DESC, id DESC LIMIT ?")
    .all(limit) as any[];

  for (const row of rows) {
    console.log(
      `${row.ticket_key} ${row.status} ${row.trigger_source} ${new Date(row.ended_at).toISOString()} ${row.test_path}`,
    );
  }
}
