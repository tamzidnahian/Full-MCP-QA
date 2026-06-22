# Website QA Agent

Standalone Jira-to-Playwright QA agent for testing any website URL, then posting results to Jira, Slack, and GitHub when those integrations are configured.

## Setup

1. Copy `.env.example` to `.env`.
2. Fill in `TARGET_URL`, Jira credentials, and `OPENAI_API_KEY`.
3. Optional: fill `SLACK_WEBHOOK_URL`, `GITHUB_REPO`, `GITHUB_TOKEN`, `JIRA_TRANSITION_DONE_ID`, and `JIRA_WEBHOOK_SECRET`.
4. Install dependencies:

```powershell
npm install
npx playwright install chromium
```

## Commands

Run the baseline target smoke test:

```powershell
npm run test
```

Check any Jira issue before generation:

```powershell
npm run agent:check-ticket -- ISSUE-KEY
```

Run autonomous QA once for all ready Jira tickets:

```powershell
npm run agent:auto
```

Run autonomous QA once for one explicit issue:

```powershell
npm run agent:auto -- --issue ISSUE-KEY
```

Run continuously, polling Jira for ready tickets:

```powershell
npm run agent:auto -- --watch
```

Start the Jira webhook listener:

```powershell
npm run agent:webhook
```

Jira Automation should send a `POST` request to `/jira/webhook?secret=...` with this JSON body:

```json
{
  "issueKey": "{{issue.key}}"
}
```

Find and save a Done-like Jira transition id:

```powershell
npm run agent:find-transition
npm run agent:find-transition -- ISSUE-KEY
```

Generate a test and pause for manual approval:

```powershell
npm run agent:start -- ISSUE-KEY
```

Approve or reject:

```powershell
npm run agent:resume -- ISSUE-KEY approve
npm run agent:resume -- ISSUE-KEY reject
```

Generated tests are written to `tests/generated/` only after approval.

Autonomous mode looks for Jira issues matching `JIRA_LABEL`, skips issues already labeled with `JIRA_AUTONOMOUS_FAILURE_LABEL`, and requires no approval prompt. It still guard-checks generated code before writing or running it. Failed or unsafe tickets are labeled with `JIRA_AUTONOMOUS_FAILURE_LABEL` so the watcher does not retry the same failing ticket forever.

Webhook mode uses the same autonomous flow as `agent:auto -- --issue ISSUE-KEY`. Duplicate webhooks for the same currently running issue are accepted but skipped.

On approval, the agent now:

- runs the generated Playwright test
- writes run history to SQLite and `metrics/ledger.jsonl`
- comments the result back to Jira
- sends a Slack message when `SLACK_WEBHOOK_URL` is set, or when `SLACK_BOT_TOKEN` and `SLACK_CHANNEL_ID` are set
- creates a GitHub issue for failed tests when `GITHUB_REPO` and either `GITHUB_TOKEN` or `GITHUB_PERSONAL_ACCESS_TOKEN` are set
- transitions passed Jira tickets when `JIRA_TRANSITION_DONE_ID` is set

Blank optional integration values are skipped, so local test generation still works while Slack, GitHub, or Jira transition credentials are being added. Public comments and notifications do not include model token usage.

Check stored run history:

```powershell
npm run agent:history
```

## GitHub Actions CI

The workflow in `.github/workflows/qa-agent.yml` runs every 12 hours and can also be triggered manually from GitHub Actions.

It runs:

- `npm run typecheck`
- `npm test`
- `npm run agent:auto`

Configure these repository secrets before enabling scheduled runs:

```text
TARGET_URL
JIRA_BASE_URL
JIRA_EMAIL
JIRA_API_TOKEN
JIRA_PROJECT_KEY
JIRA_LABEL
JIRA_TRANSITION_DONE_ID
JIRA_AUTONOMOUS_FAILURE_LABEL
OPENAI_API_KEY
SLACK_WEBHOOK_URL
SLACK_BOT_TOKEN
SLACK_CHANNEL_ID
```

The workflow uses `GITHUB_REPO=tamzidnahian/Full-MCP-QA` and the built-in GitHub Actions `GITHUB_TOKEN` for failure issue creation. It uploads Playwright reports, test results, metrics, and `state/agent.sqlite` as artifacts, and caches `state/` so future scheduled runs can reuse QA history.

## MCP

Run the local MCP server:

```powershell
npm run mcp:server
```

It exposes `qa_agent_status`, which reports configured integrations and the latest QA metric.

## First Target

Default target:

```env
TARGET_URL=https://news.ycombinator.com
```

Good first Jira issue description:

```text
As a reader, I want to open Hacker News so that I can browse current stories.

Acceptance criteria:
- Open the homepage.
- The Hacker News navigation/header is visible.
- At least one story link is visible.
- The More link is visible.
- The test runs in Chromium.
- The test must not log in, vote, comment, or modify data.
```
