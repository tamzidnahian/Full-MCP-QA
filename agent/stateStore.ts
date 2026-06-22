import { mkdirSync } from "fs";

const Database = require("better-sqlite3");

export type PendingApproval = {
  ticketKey: string;
  code: string;
  ts: number;
};

function db() {
  mkdirSync("state", { recursive: true });
  const database = new Database("state/agent.sqlite");
  database
    .prepare(
      `CREATE TABLE IF NOT EXISTS pending_approvals (
        ticket_key TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        usage_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
    )
    .run();
  return database;
}

export function savePendingApproval(pending: PendingApproval) {
  db()
    .prepare(
      `INSERT INTO pending_approvals (ticket_key, code, usage_json, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(ticket_key) DO UPDATE SET
         code = excluded.code,
         usage_json = excluded.usage_json,
         created_at = excluded.created_at`,
    )
    .run(pending.ticketKey, pending.code, "[]", pending.ts);
}

export function getPendingApproval(ticketKey: string): PendingApproval | undefined {
  const row = db()
    .prepare("SELECT ticket_key, code, usage_json, created_at FROM pending_approvals WHERE ticket_key = ?")
    .get(ticketKey) as any;

  if (!row) return undefined;

    return {
    ticketKey: row.ticket_key,
    code: row.code,
    ts: row.created_at,
  };
}

export function deletePendingApproval(ticketKey: string) {
  db().prepare("DELETE FROM pending_approvals WHERE ticket_key = ?").run(ticketKey);
}
