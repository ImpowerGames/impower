// Decides whether a workflow's real jobs need to run for the files a pull
// request or push changed. Workflows call it from a first job and gate the
// rest on its `relevant` output instead of using a `paths:` trigger filter.
//
// A required status check has to report on every pull request, and a filtered
// workflow reports nothing when its filter excludes the change, which leaves
// the pull request blocked waiting for it. A job skipped through `if:` still
// reports, as skipped, and GitHub accepts a skipped job for a required check.
//
// Usage: node .github/scripts/changed-paths.mjs <base-ref> <head-ref> <pattern>...
//        node .github/scripts/changed-paths.mjs --files <list-file> <pattern>...
// The first form diffs two refs in the current repository (three-dot, so only
// the head side's changes count). The second reads one changed path per line,
// which a workflow fills from the compare API so it needs no deep checkout.
// Prints the matches, then writes `relevant=true|false` to GITHUB_OUTPUT when
// that variable is set, and prints the same line otherwise. Patterns use the
// workflow filter syntax: `**` spans directories, `*` stays within one path
// segment, and a pattern with no slash matches only at the root.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

export function patternToRegExp(pattern) {
  let source = "";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === "*") {
      if (pattern[i + 1] === "*") {
        i++;
        if (pattern[i + 1] === "/") { i++; source += "(?:.*/)?"; }
        else source += ".*";
      } else source += "[^/]*";
    } else if (char === "?") source += "[^/]";
    else source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp("^" + source + "$");
}

export function relevantFiles(files, patterns) {
  const expressions = patterns.map(patternToRegExp);
  return files.filter((file) => expressions.some((expression) => expression.test(file)));
}

export function changedFiles(base, head, cwd = process.cwd()) {
  const output = execFileSync("git", ["diff", "--name-only", `${base}...${head}`], { cwd, encoding: "utf8", windowsHide: true });
  return output.split(/\r?\n/).filter(Boolean);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [first, second, ...patterns] = process.argv.slice(2);
  if (!first || !second || !patterns.length) {
    console.error("usage: changed-paths.mjs (<base-ref> <head-ref> | --files <list-file>) <pattern>...");
    process.exit(2);
  }
  const files = first === "--files"
    ? fs.readFileSync(second, "utf8").split(/\r?\n/).filter(Boolean)
    : changedFiles(first, second);
  const matched = relevantFiles(files, patterns);
  console.log(`${files.length} changed file(s); ${matched.length} match the workflow's patterns`);
  for (const file of matched) console.log(`  ${file}`);
  const line = `relevant=${matched.length > 0}`;
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, line + "\n");
  else console.log(line);
}
