import { spawn } from "child_process";
import { expect, test } from "@playwright/test";

function npxBin() {
  return process.platform === "win32" ? "cmd.exe" : "npx";
}

function serverArgs() {
  return process.platform === "win32" ? ["/c", "npx.cmd", "tsx", "agent/mcpServer.ts"] : ["tsx", "agent/mcpServer.ts"];
}

test("status MCP server exposes redacted QA status", async () => {
  const child = spawn(npxBin(), serverArgs(), {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const lines: string[] = [];
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    lines.push(
      ...String(chunk)
        .split(/\r?\n/)
        .filter(Boolean),
    );
  });

  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }) + "\n");
  child.stdin.write(
    JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "qa_agent_status", arguments: {} } }) +
      "\n",
  );

  const response = await new Promise<any>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for status MCP response.")), 10_000);
    const interval = setInterval(() => {
      const parsed = lines.map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return undefined;
        }
      });
      const status = parsed.find((message) => message?.id === 2);
      if (status) {
        clearTimeout(timeout);
        clearInterval(interval);
        resolve(status);
      }
    }, 100);
  });

  child.kill();

  const text = response.result.content[0].text;
  expect(text).toContain("jiraConfigured");
  expect(text).toContain("latestRun");
  expect(text).not.toContain("test_code");
});
