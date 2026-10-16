// Reads .agents/repos.json, the one place the repository slugs live:
//   code            the public repository: code, CI and pull requests
//   internal        the private repository: tickets, comments and reviews
//   autolinkPrefix  the prefix the public repository's autolink resolves to
//                   an internal issue (`I-302`)
//   cutover         false until the tracker moves to the internal repository;
//                   while it is false, hooks and scripts keep the single-
//                   repository behaviour, and the cutover commit flips it
//
// Hooks and scripts call readRepos() rather than spelling a slug. The file is
// read relative to this module, so a worktree reads its own copy.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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
  return Object.freeze({ code: data.code, internal: data.internal, autolinkPrefix: data.autolinkPrefix, cutover: data.cutover });
}
