import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { findTaskList } from "./check-no-tasklist.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const templatePath = join(here, "..", "PULL_REQUEST_TEMPLATE.md");
const template = readFileSync(templatePath, "utf8");

const found = findTaskList(template);

assert.equal(
  found,
  null,
  `found task-list syntax in ${templatePath}: ${JSON.stringify(found)}. ` +
    "This renders a task counter on every pull request opened from the template " +
    "(see #465) — replace the checkbox with a plain-text line the author fills in.",
);

console.log(`ok: no task-list syntax in ${templatePath}`);
