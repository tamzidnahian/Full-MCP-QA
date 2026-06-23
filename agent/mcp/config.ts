import { readFileSync } from "fs";
import { resolve } from "path";
import { z } from "zod";
import { loadEnv } from "../env";

loadEnv();

const ServerConfig = z.object({
  transport: z.enum(["stdio", "http"]),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  url: z.string().optional(),
  allowedTools: z.array(z.string()).default([]),
});

const OperationConfig = z.object({
  server: z.string(),
  tool: z.string(),
});

const McpConfigSchema = z.object({
  permissionMode: z.literal("allowlist").default("allowlist"),
  servers: z.record(z.string(), ServerConfig),
  operations: z.record(z.string(), OperationConfig),
});

export type McpServerConfig = z.infer<typeof ServerConfig>;
export type McpConfig = z.infer<typeof McpConfigSchema>;

function expandEnv(value: string) {
  return value.replace(/\$\{([A-Z0-9_]+)(?::-(.*?))?\}/g, (_match, key: string, fallback: string | undefined) => {
    return process.env[key] ?? fallback ?? "";
  });
}

function expandConfigValue<T>(value: T): T {
  if (typeof value === "string") return expandEnv(value) as T;
  if (Array.isArray(value)) return value.map(expandConfigValue) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, expandConfigValue(entry)]),
    ) as T;
  }
  return value;
}

export function loadMcpConfig(path = resolve("mcp.config.json")): McpConfig {
  const parsed = McpConfigSchema.parse(expandConfigValue(JSON.parse(readFileSync(path, "utf8"))));

  for (const [operationName, operation] of Object.entries(parsed.operations)) {
    assertToolAllowed(parsed, operation.server, operation.tool, operationName);
  }

  return parsed;
}

export function assertToolAllowed(config: McpConfig, serverName: string, toolName: string, operationName = toolName) {
  const server = config.servers[serverName];
  if (!server) throw new Error(`MCP server is not configured for operation ${operationName}: ${serverName}`);
  if (config.permissionMode === "allowlist" && !server.allowedTools.includes(toolName)) {
    throw new Error(`MCP tool is not allowlisted for operation ${operationName}: ${serverName}.${toolName}`);
  }
  if (server.transport === "stdio" && !server.command) {
    throw new Error(`MCP stdio server ${serverName} is missing a command.`);
  }
  if (server.transport === "http" && !server.url) {
    throw new Error(`MCP HTTP server ${serverName} is missing a url.`);
  }
}

export function getOperation(config: McpConfig, operationName: string) {
  const operation = config.operations[operationName];
  if (!operation) throw new Error(`Unknown MCP operation: ${operationName}`);
  assertToolAllowed(config, operation.server, operation.tool, operationName);
  return operation;
}
