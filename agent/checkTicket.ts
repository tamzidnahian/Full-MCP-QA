import { getTicket } from "./jiraClient";

const [ticketKey] = process.argv.slice(2);

if (!ticketKey) {
  console.error("Usage: npm run agent:check-ticket -- ISSUE-KEY");
  process.exit(1);
}

async function main() {
  const ticket = await getTicket(ticketKey);
  const description = ticket.description || "";
  const warnings = [
    { ok: description.trim().length > 0, text: "Description is empty." },
    { ok: /acceptance criteria/i.test(description), text: 'Description should include an "Acceptance criteria" section.' },
    { ok: /\b(open|go to|navigate|visit)\b/i.test(description), text: "Description should say which page or route to open." },
    { ok: /\bvisible|shown|displayed|contains|url\b/i.test(description), text: "Description should include visible UI expectations or URL checks." },
    {
      ok: /\bmust not modify|do not modify|must not submit|do not submit|read[- ]only\b/i.test(description),
      text: "Description should state that the test must not modify data.",
    },
  ].filter((warning) => !warning.ok);

  console.log(`Key: ${ticket.key}`);
  console.log(`Summary: ${ticket.summary}`);
  console.log(`Status: ${ticket.status || "(unknown)"}`);
  console.log("Description:");
  console.log(description || "(empty)");
  console.log("");

  if (warnings.length === 0) {
    console.log("Preflight: OK - this issue looks usable for safe test generation.");
  } else {
    console.log("Preflight: WARN");
    for (const warning of warnings) console.log(`- ${warning.text}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
