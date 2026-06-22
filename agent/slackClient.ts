import { loadEnv } from "./env";

loadEnv();

export async function notifySlack(text: string) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  const botToken = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHANNEL_ID;

  const response = webhookUrl
    ? await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
    : botToken && channel
      ? await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${botToken}`,
            "Content-Type": "application/json; charset=utf-8",
          },
          body: JSON.stringify({ channel, text }),
        })
      : undefined;

  if (!response) return false;

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Slack ${response.status}: ${body}`);
  }

  if (!webhookUrl) {
    const body = await response.json();
    if (!body.ok) throw new Error(`Slack API error: ${body.error ?? "unknown_error"}`);
  }

  return true;
}
