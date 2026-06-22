import { addLabel, commentOnTicket, findReadyTickets, getTicket, removeLabel } from "./jiraClient";
import { generateTest, publishGuardFailure, runAndPublishTest, RunMode, Ticket } from "./qaWorkflow";
import { acquireJobLock, releaseJobLock } from "./historyStore";
import { redact } from "./redact";

export type AutoResult = {
  ticketKey: string;
  passed: boolean;
  reason?: string;
};

const failureLabel = () => process.env.JIRA_AUTONOMOUS_FAILURE_LABEL || "ai-qa-failed";

export async function markFailed(ticketKey: string, reason: string) {
  await addLabel(ticketKey, failureLabel());
  await commentOnTicket(
    ticketKey,
    `AI-QA autonomous runner stopped this ticket and added label ${failureLabel()}. Reason: ${redact(reason, 500)}`,
  );
}

export async function processTicket(ticketKey: string, mode: RunMode = "auto"): Promise<AutoResult> {
  if (!acquireJobLock(ticketKey, mode)) {
    console.log(`Auto-QA: skipping ${ticketKey}; another run already holds the lock.`);
    return { ticketKey, passed: false, reason: "ticket already running" };
  }

  try {
    const ticket = await getTicket(ticketKey);
    console.log(JSON.stringify({ event: "qa_ticket_started", ticketKey: ticket.key, mode, summary: ticket.summary }));

    const generated = await generateTest(ticket);
    if (!generated.ok) {
      await publishGuardFailure(ticket, generated.reason, mode);
      await markFailed(ticket.key, `guard failed: ${generated.reason}`);
      return { ticketKey: ticket.key, passed: false, reason: generated.reason };
    }

    const result = await runAndPublishTest(ticket, generated.code, mode);
    if (!result.passed) {
      await markFailed(ticket.key, "generated Playwright test failed");
      console.error(`Auto-QA: ${ticket.key} Playwright failed: ${redact(result.failureLog, 500)}`);
      return { ticketKey: ticket.key, passed: false, reason: result.failureLog };
    }

    try {
      await removeLabel(ticket.key, failureLabel());
    } catch (error: any) {
      console.warn(`Auto-QA: could not clear ${failureLabel()} from ${ticket.key}: ${redact(error?.message ?? error, 500)}`);
    }

    console.log(JSON.stringify({ event: "qa_ticket_completed", ticketKey: ticket.key, mode, passed: true }));
    return { ticketKey: ticket.key, passed: true };
  } finally {
    releaseJobLock(ticketKey);
  }
}

export async function processTickets(tickets: Ticket[], mode: RunMode = "auto") {
  const results: AutoResult[] = [];
  for (const ticket of tickets) {
    try {
      results.push(await processTicket(ticket.key, mode));
    } catch (error: any) {
      const reason = String(error?.message ?? error);
      await markFailed(ticket.key, reason);
      results.push({ ticketKey: ticket.key, passed: false, reason });
      console.error(`Auto-QA: ${ticket.key} failed: ${reason}`);
    }
  }
  return results;
}

export async function processReadyTickets(maxTickets: number, mode: RunMode = "auto") {
  const tickets = await findReadyTickets(maxTickets);
  if (tickets.length === 0) {
    console.log("Auto-QA: no ready Jira tickets found.");
    return [];
  }

  return processTickets(tickets, mode);
}
