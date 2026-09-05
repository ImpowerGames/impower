// Run: node .github/scripts/check-no-tasklist.test.mjs
import assert from "node:assert/strict";
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
