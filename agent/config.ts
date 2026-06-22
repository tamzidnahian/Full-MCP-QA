export function isRealValue(value: string | undefined) {
  if (!value) return false;

  return !["https://your-domain.atlassian.net", "you@example.com", "your-org/your-repo", "your_slack_webhook_url"].includes(
    value,
  );
}
