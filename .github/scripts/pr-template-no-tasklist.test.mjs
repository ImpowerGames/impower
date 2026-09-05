// Pins #465: the pull request template must carry no GitHub task-list syntax
// ("- [ ]" or "- [x]"), because any such line makes GitHub render a task
// counter ("n of m tasks") in the pull request list and header, even after
// the pull request is finished and nobody is ever going to tick the box.
//
// Run: node .github/scripts/pr-template-no-tasklist.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const templatePath = join(here, "..", "PULL_REQUEST_TEMPLATE.md");
const template = readFileSync(templatePath, "utf8");

const TASKLIST = /^\s*[-*]\s+\[[ xX]\]/m;
const match = template.match(TASKLIST);

assert.ok(
  !match,
  `found task-list syntax in ${templatePath}: ${JSON.stringify(match?.[0])}. ` +
    "This renders a task counter on every pull request opened from the template " +
    "(see #465) — replace the checkbox with a plain-text line the author fills in.",
);

console.log(`ok: no task-list syntax in ${templatePath}`);
