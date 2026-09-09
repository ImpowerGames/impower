// Run: node .github/scripts/check-no-tasklist.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findTaskList } from "./check-no-tasklist.mjs";

const passes = [
  "",
  undefined,
  "## Summary\n\nType: bug fix\n",
  "Tests run: full suite, all green.",
  "-[ ] no space after the dash isn't a list item",
  "See the note about #465 for background.",
  "<!--\n- [ ] Bug fix\n-->",
  "```md\n- [ ] Bug fix\n```",
];

const fails = [
  "- [ ] Bug fix",
  "- [x] Bug fix",
  "* [ ] Bug fix",
  "+ [ ] Bug fix",
  "1. [ ] Bug fix",
  "2) [X] Bug fix",
  "  - [ ] indented under another line",
  "## Checklist\n\n- [ ] Tests pass locally",
];

for (const body of passes) {
  const found = findTaskList(body);
  assert.equal(found, null, `expected no match for ${JSON.stringify(body)}, got ${JSON.stringify(found)}`);
}
for (const body of fails) {
  const found = findTaskList(body);
  assert.ok(found, `expected a match for ${JSON.stringify(body)}`);
}

console.log(`ok: ${passes.length} clean bodies, ${fails.length} bodies with task-list syntax`);

// The entry-point guard (`import.meta.url === pathToFileURL(process.argv[1]).href`)
// only runs when the script is invoked as a subprocess, the way CI and the
// documented local check both run it — importing findTaskList above never
// exercises it. Run it for real and assert the process exits non-zero on a
// body carrying task-list syntax, so a guard that silently no-ops (as it did
// before pathToFileURL normalised the two sides on Windows) fails this check
// instead of exiting 0 with no output.
const scriptPath = fileURLToPath(new URL("./check-no-tasklist.mjs", import.meta.url));
const child = spawnSync(process.execPath, [scriptPath], {
  encoding: "utf8",
  env: { ...process.env, PR_BODY: "- [ ] do the thing" },
});
assert.equal(
  child.status,
  1,
  `expected the script run as a subprocess to exit 1 on a body with task-list syntax, got ${child.status} (stdout: ${JSON.stringify(child.stdout)}, stderr: ${JSON.stringify(child.stderr)})`,
);
assert.match(
  child.stdout,
  /FAIL/,
  `expected the subprocess to print a FAIL line, got stdout ${JSON.stringify(child.stdout)}`,
);

console.log("ok: entry-point guard runs main() when invoked as a subprocess");
