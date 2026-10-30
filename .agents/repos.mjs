import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPOS_FILE = fileURLToPath(new URL("./repos.json", import.meta.url));

const SLUG = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

export function readRepos(file = REPOS_FILE) {
  let data;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${file}: cannot read the repos file: ${error.message}`);
  }
  const fail = (field, want) => {
    throw new Error(`${file}: "${field}" must be ${want}`);
  };
  if (!data || typeof data !== "object" || Array.isArray(data)) fail("(root)", "an object");
  for (const field of ["code", "internal"]) if (typeof data[field] !== "string" || !SLUG.test(data[field])) fail(field, "an owner/name slug");
  if (data.code.toLowerCase() === data.internal.toLowerCase()) fail("internal", "a different repository from code");
  if (typeof data.autolinkPrefix !== "string" || !/^[A-Za-z][A-Za-z0-9]*-$/.test(data.autolinkPrefix)) fail("autolinkPrefix", "letters or digits ending in a dash");
  if (typeof data.cutover !== "boolean") fail("cutover", "true or false");
  if (!Number.isSafeInteger(data.feedbackInbox) || data.feedbackInbox < 1) fail("feedbackInbox", "a positive issue number");
  return Object.freeze({ code: data.code, internal: data.internal, autolinkPrefix: data.autolinkPrefix, cutover: data.cutover, feedbackInbox: data.feedbackInbox });
}

export function ticketsRepo(repos = readRepos()) {
  return repos.cutover ? repos.internal : repos.code;
}

export function reviewThread({ pr, ticket }, repos = readRepos()) {
  if (!Number.isSafeInteger(pr) || pr < 1) throw new Error("Supply pr, the pull request number, as a positive integer");
  const repo = ticketsRepo(repos);
  let number = pr;
  if (repos.cutover) {
    if (!Number.isSafeInteger(ticket) || ticket < 1) throw new Error(`Supply ticket, the ${repo} ticket number pull request ${pr}'s review conversation goes on, as a positive integer: the cutover switch in .agents/repos.json is on`);
    number = ticket;
  } else if (ticket !== undefined) {
    throw new Error(`ticket applies once the cutover switch in .agents/repos.json is on; until then pull request ${pr}'s review conversation is on the pull request in ${repo}, so omit ticket`);
  }
  return Object.freeze({ repo, number, issueUrl: `https://api.github.com/repos/${repo}/issues/${number}` });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const what = process.argv[2];
  const repos = readRepos();
  if (what === "tickets" && process.argv.length === 3) console.log(ticketsRepo(repos));
  else if (what === "inbox" && process.argv.length === 3) console.log(repos.feedbackInbox);
  else {
    console.error("Usage: node .agents/repos.mjs tickets|inbox");
    process.exit(2);
  }
}
