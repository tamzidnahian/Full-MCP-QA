import { getTicket } from "./jiraOps";
import { loadEnv } from "./env";
import { processReadyTickets, processTickets } from "./autonomousRunner";
import { closeMcpGateway } from "./mcpClient";

loadEnv();

const args = process.argv.slice(2);
const watch = args.includes("--watch") || args.includes("watch");
const once = args.includes("--once") || args.includes("once") || !watch;
const issueArgIndex = args.findIndex((arg) => arg === "--issue");
const explicitIssue = issueArgIndex >= 0 ? args[issueArgIndex + 1] : undefined;
const pollSeconds = Number(process.env.AGENT_POLL_SECONDS ?? "60");
const maxTickets = Number(process.env.AGENT_MAX_TICKETS ?? "5");

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (watch && explicitIssue) {
    throw new Error("--watch cannot be combined with --issue because explicit issues should run once.");
  }

  do {
    const results = explicitIssue
      ? await processTickets([await getTicket(explicitIssue)], "explicit")
      : await processReadyTickets(maxTickets, watch ? "watch" : "auto");
    const passed = results.filter((result) => result.passed).length;
    const failed = results.length - passed;
    console.log(`Auto-QA cycle complete. Processed: ${results.length}, passed: ${passed}, failed: ${failed}`);

    if (once) return;
    await sleep(Math.max(5, pollSeconds) * 1000);
  } while (watch);
}

main()
  .then(async () => {
    await closeMcpGateway();
  })
  .catch(async (error) => {
    await closeMcpGateway();
    console.error(error);
    process.exit(1);
  });
