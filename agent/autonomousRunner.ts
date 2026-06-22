import { addLabel, commentOnTicket, findReadyTickets, getTicket, removeLabel } from "./jiraClient";
import { generateTest, publishGuardFailure, runAndPublishTest, RunMode, Ticket } from "./qaWorkflow";

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
    `AI-QA autonomous runner stopped this ticket and added label ${failureLabel()}. Reason: ${reason}`,
  );
}

export async function processTicket(ticketKey: string, mode: RunMode = "auto"): Promise<AutoResult> {
  const ticket = await getTicket(ticketKey);
  console.log(`Auto-QA: processing ${ticket.key} (${ticket.summary})`);

  const generated = await generateTest(ticket);
  if (!generated.ok) {
    await publishGuardFailure(ticket, generated.reason, mode);
    await markFailed(ticket.key, `guard failed: ${generated.reason}`);
    return { ticketKey: ticket.key, passed: false, reason: generated.reason };
  }

  const result = await runAndPublishTest(ticket, generated.code, mode);
  if (!result.passed) {
    await markFailed(ticket.key, "generated Playwright test failed");
    console.error(`Auto-QA: ${ticket.key} Playwright failed: ${result.failureLog.slice(0, 500)}`);
    return { ticketKey: ticket.key, passed: false, reason: result.failureLog };
  }

  try {
    await removeLabel(ticket.key, failureLabel());
  } catch (error: any) {
    console.warn(`Auto-QA: could not clear ${failureLabel()} from ${ticket.key}: ${String(error?.message ?? error)}`);
  }

  return { ticketKey: ticket.key, passed: true };
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
