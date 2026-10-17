// Reads .agents/repos.json, the one place the repository slugs live:
//   code            the public repository: code, CI and pull requests
//   internal        the private repository: tickets, comments and reviews
//   autolinkPrefix  the prefix the public repository's autolink resolves to
//                   an internal issue (`I-302`)
//   cutover         false until the tracker moves to the internal repository;
//                   while it is false, hooks and scripts keep the single-
//                   repository behaviour, and the cutover commit flips it
//   feedbackInbox   the number of the standing skill feedback inbox issue in
//                   the tickets repository
//
// Hooks and scripts call readRepos() rather than spelling a slug, and
// ticketsRepo() for the repository that holds tickets at the switch's
// position. The file is read relative to this module, so a worktree reads its
// own copy.
//
// Run as a script, it prints one value for commands written by hand:
//   node .agents/repos.mjs tickets   the tickets repository, as owner/name
//   node .agents/repos.mjs inbox     the feedback inbox issue number

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPOS_FILE = fileURLToPath(new URL("./repos.json", import.meta.url));

const SLUG = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

/** Parses and checks a repos file; throws with the file and the field at fault. */
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

/** The repository that holds tickets: the code repository until the cutover, the internal one after it. */
export function ticketsRepo(repos = readRepos()) {
  return repos.cutover ? repos.internal : repos.code;
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
