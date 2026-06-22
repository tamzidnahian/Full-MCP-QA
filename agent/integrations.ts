import { createGeneratedTestPullRequest, createGitHubIssue } from "./githubClient";
import { transitionTicket } from "./jiraClient";
import { notifySlack } from "./slackClient";

export type QaResult = {
  ticketKey: string;
  summary: string;
  passed: boolean;
  testPath: string;
  testCode?: string;
  failureLog?: string;
};

export async function publishResult(result: QaResult) {
  const status = result.passed ? "PASSED" : "FAILED";
  const shortFailure = result.failureLog ? `\nFailure: ${result.failureLog.slice(0, 500)}` : "";
  const warnings: string[] = [];
  const message =
    `AI-QA ${status} for ${result.ticketKey}\n` + `Test: ${result.testPath}` + shortFailure;

  let githubIssueUrl: string | undefined;
  let githubPullRequestUrl: string | undefined;
  if (!result.passed) {
    try {
      githubIssueUrl = await createGitHubIssue({
        title: `AI-QA failed for ${result.ticketKey}`,
        body: `${message}\n\nGenerated test: \`${result.testPath}\``,
        labels: ["ai-qa", "bug"],
      });
    } catch (error: any) {
      warnings.push(`GitHub issue creation failed: ${String(error?.message ?? error).slice(0, 300)}`);
    }
  }

  if (result.passed && result.testCode) {
    try {
      githubPullRequestUrl = await createGeneratedTestPullRequest({
        ticketKey: result.ticketKey,
        summary: result.summary,
        testPath: result.testPath,
        code: result.testCode,
      });
    } catch (error: any) {
      warnings.push(`GitHub pull request creation failed: ${String(error?.message ?? error).slice(0, 300)}`);
    }
  }

  try {
    const githubLink = githubIssueUrl
      ? `\nGitHub issue: ${githubIssueUrl}`
      : githubPullRequestUrl
        ? `\nGitHub PR: ${githubPullRequestUrl}`
        : "";
    await notifySlack(`${message}${githubLink}`);
  } catch (error: any) {
    warnings.push(`Slack notification failed: ${String(error?.message ?? error).slice(0, 300)}`);
  }

  if (result.passed && process.env.JIRA_TRANSITION_DONE_ID) {
    try {
      await transitionTicket(result.ticketKey, process.env.JIRA_TRANSITION_DONE_ID);
    } catch (error: any) {
      warnings.push(`Jira transition failed: ${String(error?.message ?? error).slice(0, 300)}`);
    }
  }

  return { githubIssueUrl, githubPullRequestUrl, warnings };
}
