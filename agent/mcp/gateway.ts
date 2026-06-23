import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getOperation, loadMcpConfig, type McpConfig, type McpServerConfig } from "./config";
import { recordMcpAudit } from "../historyStore";
import { redact } from "../redact";
import { withSpan } from "../telemetry";

type ClientEntry = {
  client: Client;
  close: () => Promise<void>;
};

function normalizeCommand(command: string) {
  if (process.platform === "win32" && command === "npx") return "npx.cmd";
  return command;
}

function errorMessage(error: unknown) {
  return redact(error instanceof Error ? error.message : String(error), 1500);
}

export function parseMcpOutput(raw: any) {
  const content = raw?.content;
  if (!Array.isArray(content)) return raw;

  const textItems = content.filter((item) => item?.type === "text" && typeof item.text === "string");
  if (textItems.length === 0) return raw;

  const text = textItems.map((item) => item.text).join("\n");
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export class McpGateway {
  private clients = new Map<string, ClientEntry>();

  constructor(private readonly config: McpConfig = loadMcpConfig()) {}

  async callOperation<T = unknown>(operationName: string, input: Record<string, unknown> = {}): Promise<T> {
    const operation = getOperation(this.config, operationName);
    return this.callTool<T>(operation.server, operation.tool, input, operationName);
  }

  async callTool<T = unknown>(
    serverName: string,
    toolName: string,
    input: Record<string, unknown> = {},
    operationName = `${serverName}.${toolName}`,
  ): Promise<T> {
    return withSpan(
      "mcp.call",
      { "mcp.server": serverName, "mcp.tool": toolName, "mcp.operation": operationName },
      async () => {
        const startedAt = Date.now();
        try {
          const entry = await this.clientFor(serverName);
          const raw = await entry.client.callTool({ name: toolName, arguments: input });
          const output = parseMcpOutput(raw);

          if ((raw as any)?.isError) {
            throw new Error(typeof output === "string" ? output : JSON.stringify(output));
          }

          await recordMcpAudit({
            server: serverName,
            tool: toolName,
            input,
            output,
            ok: true,
            durationMs: Date.now() - startedAt,
          });
          return output as T;
        } catch (error) {
          await recordMcpAudit({
            server: serverName,
            tool: toolName,
            input,
            ok: false,
            error: `${operationName}: ${errorMessage(error)}`,
            durationMs: Date.now() - startedAt,
          });
          throw error;
        }
      },
    );
  }

  async close() {
    const entries = Array.from(this.clients.values());
    this.clients.clear();
    await Promise.allSettled(entries.map((entry) => entry.close()));
  }

  private async clientFor(serverName: string) {
    const existing = this.clients.get(serverName);
    if (existing) return existing;

    const server = this.config.servers[serverName];
    if (!server) throw new Error(`MCP server is not configured: ${serverName}`);

    const client = new Client({
      name: `website-qa-agent-${serverName}`,
      version: "0.1.0",
    });
    const transport = this.createTransport(server);
    await client.connect(transport);

    const entry: ClientEntry = {
      client,
      close: async () => {
        await client.close();
      },
    };
    this.clients.set(serverName, entry);
    return entry;
  }

  private createTransport(server: McpServerConfig) {
    if (server.transport === "http") {
      return new StreamableHTTPClientTransport(new URL(server.url as string));
    }

    return new StdioClientTransport({
      command: normalizeCommand(server.command as string),
      args: server.args ?? [],
      cwd: process.cwd(),
    });
  }
}
