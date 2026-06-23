# Website QA Agent

Standalone Jira-to-Playwright QA agent for testing any website URL, then posting results to Jira, Slack, and GitHub when those integrations are configured. External integrations run through a local MCP gateway with allowlisted operations and redacted SQLite audit logging.

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

Production webhook requests should send a `POST` request to `/jira/webhook` with this JSON body:

```json
{
  "issueKey": "{{issue.key}}"
}
```

Use these headers:

```text
X-QA-Agent-Timestamp: <unix epoch milliseconds>
X-QA-Agent-Signature: sha256=<HMAC_SHA256(JIRA_WEBHOOK_SECRET, timestamp + "." + raw_body)>
```

If you connect directly from Jira Automation and cannot compute an HMAC signature, set `AGENT_WEBHOOK_ALLOW_SHARED_SECRET=true` and send `X-QA-Agent-Secret: <JIRA_WEBHOOK_SECRET>`. Do not put the secret in the URL.

Find and save a Done-like Jira transition id:

```powershell
npm run agent:find-transition
npm run agent:find-transition -- ISSUE-KEY
```

Autonomous mode looks for Jira issues matching `JIRA_LABEL`, skips issues already labeled with `JIRA_AUTONOMOUS_FAILURE_LABEL`, and requires no approval prompt. It still guard-checks generated code before writing or running it. Failed or unsafe tickets are labeled with `JIRA_AUTONOMOUS_FAILURE_LABEL` so the watcher does not retry the same failing ticket forever.

Webhook mode uses the same autonomous flow as `agent:auto -- --issue ISSUE-KEY`. Duplicate webhooks for the same currently running issue are accepted but skipped.

On an autonomous run, the agent now:

- runs the generated Playwright test
- writes run history to SQLite and `metrics/ledger.jsonl`
- comments the result back to Jira
- sends a Slack message when `SLACK_WEBHOOK_URL` is set, or when `SLACK_BOT_TOKEN` and `SLACK_CHANNEL_ID` are set
- creates a GitHub issue for failed tests when `GITHUB_REPO` and either `GITHUB_TOKEN` or `GITHUB_PERSONAL_ACCESS_TOKEN` are set
- creates or updates a branch like `ai-qa/SCRUM-4`, commits the generated passing test, opens/reuses a PR, and links it back to Jira
- transitions passed Jira tickets only when `AGENT_TRANSITION_ON_PASS=true` and `JIRA_TRANSITION_DONE_ID` are set

Generated Playwright runs use a scrubbed environment so Jira, Slack, GitHub, and OpenAI secrets are not exposed to generated test code. Blank optional integration values are skipped, so local test generation still works while Slack, GitHub, or Jira transition credentials are being added. Public comments and notifications do not include model token counts.

Check stored run history:

```powershell
npm run agent:history
```

## GitHub Actions CI

The workflow in `.github/workflows/qa-agent.yml` runs daily at 7:00 AM and 2:00 PM Pacific time during PDT (`14:00` and `21:00` UTC), and can also be triggered manually from GitHub Actions.

It runs:

- `npm run typecheck`
- `npm test`
- `npm run agent:auto`

The workflow is split into a read-only validation job and a write-enabled autonomous publishing job. The generated Playwright test process still receives only a scrubbed environment.

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
AGENT_TRANSITION_ON_PASS
TARGET_TEST_HINTS
OPENAI_API_KEY
SLACK_WEBHOOK_URL
SLACK_BOT_TOKEN
SLACK_CHANNEL_ID
```

The workflow uses `GITHUB_REPO=tamzidnahian/Full-MCP-QA` and the built-in GitHub Actions `GITHUB_TOKEN` for failure issue creation plus generated-test PR branches. It uploads Playwright reports, test results, metrics, and `state/agent.sqlite` as artifacts, and caches `state/` so future scheduled runs can reuse QA history.

## MCP

The autonomous workflow uses `mcp.config.json` to route integration calls through allowlisted operation aliases:

- `jira.getIssue`, `jira.findReadyIssues`, `jira.commentIssue`, `jira.addLabel`, `jira.removeLabel`, `jira.transitionIssue`
- `github.createIssue`, `github.createBranch`, `github.createOrUpdateFile`, `github.findPullRequest`, `github.createPullRequest`
- `slack.postMessage`
- optional Playwright MCP inspection through `playwright.navigate`, `playwright.snapshot`, and `playwright.close`

Run the redacted agent status MCP server:

```powershell
npm run mcp:server
```

It exposes `qa_agent_status`, which reports configured integrations and a redacted latest QA metric.

The local stdio MCP servers used by the gateway can also be started directly for debugging:

```powershell
npm run mcp:jira
npm run mcp:github
npm run mcp:slack
```

Playwright MCP inspection is optional. To use it, run a Playwright MCP server on `PLAYWRIGHT_MCP_URL` and set:

```env
PLAYWRIGHT_MCP_ENABLED=true
PLAYWRIGHT_MCP_URL=http://localhost:8931/mcp
```

If Playwright MCP is disabled or unavailable, target inspection falls back to the local Playwright browser path. Generated tests still execute through the local Playwright CLI so reports and artifacts continue to work.

Every MCP call is audited in `state/agent.sqlite` table `mcp_audit` with redacted input, output, errors, duration, and timestamp.

## Example Target

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
