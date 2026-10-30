import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const STEP = "place-a-filed-ticket";

const section = (text, heading) => {
  const start = text.indexOf(`\n## ${heading}\n`);
  assert.notEqual(start, -1, `the section "${heading}" exists`);
  const end = text.indexOf("\n## ", start + 1);
  return text.slice(start, end === -1 ? undefined : end);
};

const outcome = (text, kind) => {
  const line = text.split("\n").find((l) => l.trimStart().startsWith(`- \`${kind} `));
  assert.ok(line, `the ${kind} outcome exists`);
  return line;
};

export function checkSharedStep(publishing) {
  const step = section(publishing, "Place a filed ticket");
  assert.match(step, /Bug or Task is fully filed only when/, "the step says when a Bug or Task is fully filed");
  assert.match(step, /parent whose Scope covers it/, "the step requires a parent whose Scope covers the ticket");
  assert.match(step, /gh api repos\/<tickets>\/issues\/<N> --jq \.id/, "the step names the database id read");
  assert.match(step, /gh api -X POST repos\/<tickets>\/issues\/<parent>\/sub_issues -F sub_issue_id=<id>/, "the step names the attach call");
  assert.match(step, /gh api repos\/<tickets>\/issues\/<parent> --jq \.milestone\.number/, "the step reads the parent's milestone");
  assert.match(step, /gh api -X PATCH repos\/<tickets>\/issues\/<N> -F milestone=<number>/, "the step names the milestone call");
  assert.match(step, /Added on <date> from [^:]+: #<N> \(<summary>\)/, "the step names the parent's Scope line");
  assert.match(step, /gh api repos\/<tickets>\/issues\/<N>\/parent --jq \.number/, "the read-back includes the parent");
  assert.match(step, /gh api repos\/<tickets>\/issues\/<N> --jq \.milestone\.number/, "the read-back includes the milestone");
  assert.match(step, /root Feature[\s\S]*milestone[\s\S]*maintainer adds it to the project board/, "the step covers the root Feature's milestone and board membership");
}

export function checkRoute(text, link) {
  assert.ok(text.includes(`${link}#${STEP}`), `the route links ${link}#${STEP}`);
  assert.match(text, /read(?:s|ing)? back[^.]*parent[^.]*milestone|read(?:s|ing)? the parent and milestone back/i, "the route reads the parent and milestone back");
}

export function checkFiler(text) {
  assert.doesNotMatch(text, /Do not set a parent or milestone/, "the filer is not told to leave the parent and milestone unset");
  checkRoute(text, "../../.agents/skills/references/publishing.md");
}

export function checkSeparate(writerReports) {
  const separate = outcome(writerReports, "separate");
  assert.doesNotMatch(separate, /leave it outside the tree/, "separate never leaves a ticket outside every tree");
  assert.match(separate, /open umbrella whose Scope (?:covers|fits)/, "separate attaches under the fitting open umbrella");
  assert.match(separate, /reopen[\s\S]*closed umbrella[\s\S]*comment|closed umbrella[\s\S]*reopen[\s\S]*comment/i, "separate reopens a closed umbrella with a comment");
  assert.match(separate, /`maintainer`[^.]*only when no umbrella/, "separate reaches maintainer only when no umbrella exists");
  const placement = writerReports.split("\n").find((l) => /^\s*3\. Attach with the REST sub-issue call/.test(l));
  assert.ok(placement, "the coordinator's placement step exists");
  assert.match(placement, /Read the parent link and the milestone back/, "the coordinator reads the parent and milestone back");
  assert.match(writerReports, /separate outcome that names no umbrella[^.]*`triage-filed`|`triage-filed`[^.]*separate outcome that names no umbrella/, "a saved separate outcome with no umbrella is triaged again");
}

test("the shared step attaches the ticket under a parent, copies its milestone and reads both back", () => {
  checkSharedStep(read(".agents/skills/references/publishing.md"));
});

test("every filing route points at the shared step and reads the parent and milestone back", () => {
  for (const skill of [".agents/skills/file-bug/SKILL.md", ".agents/skills/file-task/SKILL.md", ".agents/skills/file-feature/SKILL.md"]) {
    checkRoute(read(skill), "../references/publishing.md");
  }
  checkRoute(read(".agents/skills/references/runner-filing.md"), "publishing.md");
  checkFiler(read(".claude/agents/filer-sonnet-5-5-low.md"));
});

test("a separate triage outcome still places the ticket in a tree", () => {
  checkSeparate(read(".agents/skills/orchestrate-issues/references/writer-reports.md"));
});

test("the checks refuse a read-back without the parent and a route without the step", () => {
  const publishing = read(".agents/skills/references/publishing.md");
  assert.throws(() => checkSharedStep(publishing.replace(/gh api repos\/<tickets>\/issues\/<N>\/parent --jq \.number/g, "")), /read-back includes the parent/);
  assert.throws(() => checkRoute("Read back the published body, type, labels and Effort.", "../references/publishing.md"), /links/);
  assert.throws(() => checkRoute(`See [placement](../references/publishing.md#${STEP}). Read back the body.`, "../references/publishing.md"), /parent and milestone back/);
  assert.throws(() => checkFiler(`- Do not set a parent or milestone; the coordinator places the ticket. [x](../../.agents/skills/references/publishing.md#${STEP}) read back the parent and milestone.`), /left unset|leave the parent/);
  assert.throws(() => checkSeparate("   - `separate --reason [--under U]`: leave it outside the tree."), /outside every tree/);
  const writerReports = read(".agents/skills/orchestrate-issues/references/writer-reports.md");
  assert.throws(() => checkSeparate(writerReports.replace("Read the parent link and the milestone back.", "Read the milestone back.")), /reads the parent and milestone back/);
});
