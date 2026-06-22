import { getTicket } from "./jiraClient";
import { loadEnv } from "./env";
import { generateTest, runAndPublishTest } from "./qaWorkflow";
import { deletePendingApproval, getPendingApproval, savePendingApproval } from "./stateStore";

loadEnv();

const [mode, key, decision] = process.argv.slice(2);

if (!mode || !key || !["start", "resume"].includes(mode)) {
  console.error("Usage: npm run agent:start -- ISSUE-KEY | npm run agent:resume -- ISSUE-KEY approve|reject");
  process.exit(1);
}

async function start() {
  const ticket = await getTicket(key);
  const generated = await generateTest(ticket);

  if (!generated.ok) {
    console.log(`Stopped (guard-failed): ${generated.reason}`);
    return;
  }

  savePendingApproval({ ticketKey: key, code: generated.code, ts: Date.now() });
  console.log(`Review:\n${generated.code}\n\nnpm run agent:resume -- ${key} approve   (or reject)`);
}

async function resume() {
  const pending = getPendingApproval(key);

  if (!pending) {
    console.log("Stopped: no pending approval found. Run agent:start first.");
    return;
  }

  if (decision !== "approve") {
    deletePendingApproval(key);
    console.log("Stopped (rejected).");
    return;
  }

  const ticket = await getTicket(pending.ticketKey);
  const result = await runAndPublishTest(ticket, pending.code, "manual");
  deletePendingApproval(key);
  console.log(`Done. Passed: ${result.passed}`);
}

(mode === "start" ? start() : resume()).catch((error) => {
  console.error(error);
  process.exit(1);
});
