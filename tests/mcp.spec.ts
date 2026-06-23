import { expect, test } from "@playwright/test";
import { loadMcpConfig, assertToolAllowed } from "../agent/mcp/config";
import { parseMcpOutput } from "../agent/mcp/gateway";
import { recordMcpAudit } from "../agent/historyStore";

const Database = require("better-sqlite3");

test("MCP allowlist accepts known tools and blocks unknown tools", () => {
  const config = loadMcpConfig();

  expect(() => assertToolAllowed(config, "jira", "get_issue")).not.toThrow();
  expect(() => assertToolAllowed(config, "jira", "delete_issue")).toThrow(/allowlisted/);
});

test("MCP gateway parses JSON text responses", () => {
  const output = parseMcpOutput({
    content: [{ type: "text", text: JSON.stringify({ ok: true, value: 42 }) }],
  });

  expect(output).toEqual({ ok: true, value: 42 });
});

test("MCP audit records are redacted before SQLite storage", async () => {
  await recordMcpAudit({
    server: "unit",
    tool: "redaction_check",
    input: { Authorization: "Bearer abcdefghijklmnopqrstuvwxyz123456" },
    output: { email: "person@example.com" },
    ok: true,
    durationMs: 1,
  });

  const database = new Database("state/agent.sqlite");
  const row = database
    .prepare("SELECT * FROM mcp_audit WHERE server_name = ? AND tool_name = ? ORDER BY id DESC LIMIT 1")
    .get("unit", "redaction_check");

  expect(row.input_json).not.toContain("abcdefghijklmnopqrstuvwxyz123456");
  expect(row.output_json).not.toContain("person@example.com");
  expect(row.input_json).toContain("[REDACTED]");
  expect(row.output_json).toContain("[REDACTED]");
});
