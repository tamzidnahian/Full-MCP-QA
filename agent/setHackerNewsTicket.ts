import { updateTicket } from "./jiraClient";

const [ticketKey] = process.argv.slice(2);

if (!ticketKey) {
  console.error("Usage: npm run agent:set-hn-ticket -- ISSUE-KEY");
  process.exit(1);
}

const description = `As a reader, I want to open Hacker News so that I can browse current stories.

Acceptance criteria:
Open the Hacker News homepage.
The page URL is the configured target homepage.
The Hacker News navigation/header is visible.
At least one story link is visible.
The More link is visible.
The test runs in Chromium.
The test must not log in, vote, comment, or submit forms.
The test must not modify application data.`;

const issueNumber = ticketKey.match(/\d+$/)?.[0] ?? ticketKey;

updateTicket(ticketKey, {
  summary: `HFQA-${issueNumber} Hacker News homepage`,
  description,
})
  .then(() => {
    console.log(`Updated ${ticketKey} for Hacker News QA.`);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
