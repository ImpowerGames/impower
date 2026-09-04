// Run: node .github/scripts/check-linked-issue.test.mjs
import assert from "node:assert/strict";
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
