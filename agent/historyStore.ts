import { mkdirSync } from "fs";
import { requiredEnv } from "./env";

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
  jiraStatusBefore?: string;
  jiraStatusAfter?: string;
  triggerSource: string;
  startedAt: number;
  endedAt: number;
};

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
        jira_status_before TEXT,
        jira_status_after TEXT,
        trigger_source TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER NOT NULL
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
        github_issue_url, jira_status_before, jira_status_after, trigger_source, started_at, ended_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      record.ticketKey,
      record.summary,
      record.targetUrl ?? requiredEnv("TARGET_URL"),
      record.testPath ?? "",
      record.testCode ?? "",
      record.status,
      record.failureLog ?? "",
      record.githubIssueUrl ?? "",
      record.jiraStatusBefore ?? "",
      record.jiraStatusAfter ?? "",
      record.triggerSource,
      record.startedAt,
      record.endedAt,
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
