import { callMcpOperation } from "./mcpClient";

export async function notifySlack(text: string) {
  const result = await callMcpOperation<{ ok?: boolean }>("slack.postMessage", { text });
  return Boolean(result?.ok);
}
