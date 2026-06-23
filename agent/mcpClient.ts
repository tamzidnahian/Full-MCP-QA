import { McpGateway } from "./mcp/gateway";

const gateway = new McpGateway();

export function callMcpOperation<T = unknown>(operationName: string, input: Record<string, unknown> = {}) {
  return gateway.callOperation<T>(operationName, input);
}

export async function closeMcpGateway() {
  await gateway.close();
}
