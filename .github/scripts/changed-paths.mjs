// Decides whether a workflow's real jobs need to run for the files a pull
// request or push changed. Workflows call it from a first job and gate the
// rest on its `relevant` output instead of using a `paths:` trigger filter.
//
// A required status check has to report on every pull request, and a filtered
// workflow reports nothing when its filter excludes the change, which leaves
// the pull request blocked. A job skipped through `if:` still reports, as
// skipped, and GitHub accepts a skipped job for a required check.
//
// Usage: node .github/scripts/changed-paths.mjs <base-ref> <head-ref> [--limit <n>] <pattern>...
//        node .github/scripts/changed-paths.mjs --files <list-file> [--limit <n>] <pattern>...
// The first form diffs two refs in the current repository (three-dot, so only
// the head side's changes count). The second reads one changed path per line,
// which a workflow fills from the API so it needs no deep checkout. `--limit`
// names the listing endpoint's cap: a list that long may be incomplete, and an
// incomplete list can only run jobs, never skip them. Prints the matches, then
// writes `relevant=true|false` to GITHUB_OUTPUT when that variable is set, and
// prints the same line otherwise.
//
// Patterns follow the workflow `paths:` filter syntax: `*` matches anything
// except `/`, `**` matches anything including `/`, `?` and `+` mean zero-or-one
// and one-or-more of the preceding character, `[abc]` is a character class, a
// leading `!` negates, and patterns apply in order so the last one that matches
// a path decides. A pattern with no slash matches only at the root.
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
    } else if (char === "?" || char === "+") source += char;
    else if (char === "[") {
      const end = pattern.indexOf("]", i + 1);
      if (end < 0) throw new Error(`Unterminated character class in pattern: ${pattern}`);
      source += pattern.slice(i, end + 1).replace(/\\/g, "\\\\");
      i = end;
    } else source += char.replace(/[.^${}()|\\]/g, "\\$&");
  }
  return new RegExp("^" + source + "$");
}

// Ordered evaluation with negation: a path is relevant when the last pattern
// that matches it is positive. A path no pattern matches is not relevant.
export function relevantFiles(files, patterns) {
  const rules = patterns.map((pattern) => {
    const negative = pattern.startsWith("!");
    return { negative, expression: patternToRegExp(negative ? pattern.slice(1) : pattern) };
  });
  return files.filter((file) => {
    let included = false;
    for (const rule of rules) if (rule.expression.test(file)) included = !rule.negative;
    return included;
  });
}

export function changedFiles(base, head, cwd = process.cwd()) {
  const output = execFileSync("git", ["diff", "--name-only", `${base}...${head}`], { cwd, encoding: "utf8", windowsHide: true });
  return output.split(/\r?\n/).filter(Boolean);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [first, second, ...rest] = process.argv.slice(2);
  let limit = Infinity;
  if (rest[0] === "--limit") { limit = Number(rest[1]); rest.splice(0, 2); }
  const patterns = rest;
  if (!first || !second || !patterns.length || !(limit > 0)) {
    console.error("usage: changed-paths.mjs (<base-ref> <head-ref> | --files <list-file>) [--limit <n>] <pattern>...");
    process.exit(2);
  }
  const files = first === "--files"
    ? fs.readFileSync(second, "utf8").split(/\r?\n/).filter(Boolean)
    : changedFiles(first, second);
  const matched = relevantFiles(files, patterns);
  console.log(`${files.length} changed path(s); ${matched.length} match the workflow's patterns`);
  for (const file of matched) console.log(`  ${file}`);
  const truncated = files.length >= limit;
  if (truncated) console.log(`The listing may be incomplete at ${limit} entries; treating the change as relevant`);
  const line = `relevant=${matched.length > 0 || truncated}`;
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, line + "\n");
  else console.log(line);
}
