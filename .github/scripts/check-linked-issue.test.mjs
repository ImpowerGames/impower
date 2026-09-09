// Run: node .github/scripts/check-linked-issue.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkLinkedIssue } from "./check-linked-issue.mjs";

const passes = [
  "## Summary\n\nDoes a thing.\n\nCloses #394\n",
  "Fixes #394 -- the planner guard was dead code.",
  "resolves #12",
  "Closes: #7",
  "Closed #7",
  "Fixed ImpowerGames/impower#394",
  "Resolves https://github.com/ImpowerGames/impower/issues/394",
  "Closes #12, closes #34",
  "## Summary\n\nTemplate chore.\n\nNo linked issue.\n",
  "no linked issue",
];

const fails = [
  "",
  undefined,
  "## Summary\n\nFixes the game preview freezing on the first click.\n",
  "fix(clock): preserve effective time (#394)",
  "See #394 for background.",
  "Closes #",
  'Closes #\n\n<!-- Keep the line above ... "Closes #12, closes #34" ... -->',
  "<!-- No linked issue. -->",
  "Fixes issue 394",
];

for (const body of passes) {
  const r = checkLinkedIssue(body);
  assert.ok(r.ok, `expected pass for ${JSON.stringify(body)}: ${r.reason}`);
}
for (const body of fails) {
  const r = checkLinkedIssue(body);
  assert.ok(!r.ok, `expected fail for ${JSON.stringify(body)}: ${r.reason}`);
}

console.log(
  `ok: ${passes.length} passing bodies, ${fails.length} failing bodies`,
);

// The entry-point guard (`import.meta.url === pathToFileURL(process.argv[1]).href`)
// only runs when the script is invoked as a subprocess, the way CI and the
// documented local check both run it — importing checkLinkedIssue above never
// exercises it. Run it for real and assert the process exits non-zero on a
// body with no closing reference, so a guard that silently no-ops (as it did
// before pathToFileURL normalised the two sides on Windows) fails this check
// instead of exiting 0 with no output.
const scriptPath = fileURLToPath(new URL("./check-linked-issue.mjs", import.meta.url));
const child = spawnSync(process.execPath, [scriptPath], {
  encoding: "utf8",
  env: { ...process.env, PR_BODY: "this body has no closing reference" },
});
assert.equal(
  child.status,
  1,
  `expected the script run as a subprocess to exit 1 on a body with no closing reference, got ${child.status} (stdout: ${JSON.stringify(child.stdout)}, stderr: ${JSON.stringify(child.stderr)})`,
);
assert.match(
  child.stdout,
  /FAIL/,
  `expected the subprocess to print a FAIL line, got stdout ${JSON.stringify(child.stdout)}`,
);

console.log("ok: entry-point guard runs main() when invoked as a subprocess");
