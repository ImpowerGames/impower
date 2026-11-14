import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPOS_FILE = fileURLToPath(new URL("./repos.json", import.meta.url));

const MAINTAINER_LABELS = ["decision", "task", "decidedWithoutYou"];
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
  const maintainer = data.maintainer;
  if (!maintainer || typeof maintainer !== "object" || Array.isArray(maintainer)) fail("maintainer", "an object naming the maintainer's login and the maintainer request labels");
  if (typeof maintainer.login !== "string" || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(maintainer.login)) fail("maintainer.login", "a GitHub login");
  const labels = maintainer.labels;
  if (!labels || typeof labels !== "object" || Array.isArray(labels)) fail("maintainer.labels", "an object with decision, task and decidedWithoutYou");
  for (const key of MAINTAINER_LABELS) if (typeof labels[key] !== "string" || !labels[key].trim() || labels[key] !== labels[key].trim()) fail(`maintainer.labels.${key}`, "a label name");
  if (new Set(MAINTAINER_LABELS.map((key) => labels[key].toLowerCase())).size !== MAINTAINER_LABELS.length) fail("maintainer.labels", "three different label names");
  return Object.freeze({
    code: data.code,
    internal: data.internal,
    autolinkPrefix: data.autolinkPrefix,
    cutover: data.cutover,
    feedbackInbox: data.feedbackInbox,
    maintainer: Object.freeze({ login: maintainer.login, labels: Object.freeze(Object.fromEntries(MAINTAINER_LABELS.map((key) => [key, labels[key]]))) }),
  });
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
