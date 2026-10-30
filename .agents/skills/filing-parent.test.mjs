import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const STEP = "place-a-filed-ticket";
const PARENT_READ_BACK = "gh api repos/<tickets>/issues/<N>/parent --jq .number";
const MILESTONE_READ_BACK = "gh api repos/<tickets>/issues/<N> --jq .milestone.number";

const section = (text, heading) => {
  const start = text.indexOf(`\n## ${heading}\n`);
  assert.notEqual(start, -1, `the section "${heading}" exists`);
  const end = text.indexOf("\n## ", start + 1);
  return text.slice(start, end === -1 ? undefined : end);
};

export function checkSharedStep(publishing) {
  const step = section(publishing, "Place a filed ticket");
  for (const [command, what] of [
    ["gh api repos/<tickets>/issues/<N> --jq .id", "the database id read"],
    ["gh api -X POST repos/<tickets>/issues/<parent>/sub_issues -F sub_issue_id=<id>", "the attach call"],
    ["gh api repos/<tickets>/issues/<parent> --jq .milestone.number", "the parent's milestone read"],
    ["gh api -X PATCH repos/<tickets>/issues/<N> -F milestone=<number>", "the milestone call"],
    [PARENT_READ_BACK, "the parent read-back"],
    [MILESTONE_READ_BACK, "the milestone read-back"],
  ]) assert.ok(step.includes(command), `the step names ${what}: ${command}`);
}

export function checkRoute(text, link) {
  assert.ok(text.includes(`](${link}#${STEP})`), `the route links ${link}#${STEP}`);
}

export function checkCoordinator(writerReports) {
  checkRoute(writerReports, "../../references/publishing.md");
  const triage = section(writerReports, "Tickets filed during the run");
  assert.ok(triage.includes(PARENT_READ_BACK), `the coordinator's placement reads the parent back: ${PARENT_READ_BACK}`);
  assert.ok(triage.includes(MILESTONE_READ_BACK), `the coordinator's placement reads the milestone back: ${MILESTONE_READ_BACK}`);
  assert.ok(triage.includes("`separate --under U --reason`"), "the separate outcome takes the umbrella that triage requires");
}

test("the shared step attaches the ticket under a parent, copies its milestone and reads both back", () => {
  checkSharedStep(read(".agents/skills/references/publishing.md"));
});

test("every filing route links the shared step", () => {
  for (const skill of [".agents/skills/file-bug/SKILL.md", ".agents/skills/file-task/SKILL.md", ".agents/skills/file-feature/SKILL.md"]) {
    checkRoute(read(skill), "../references/publishing.md");
  }
  checkRoute(read(".agents/skills/references/runner-filing.md"), "publishing.md");
  checkRoute(read(".claude/agents/filer-sonnet-5-5-low.md"), "../../.agents/skills/references/publishing.md");
});

test("the coordinator's triage places a ticket and reads its parent and milestone back", () => {
  checkCoordinator(read(".agents/skills/orchestrate-issues/references/writer-reports.md"));
});

test("the checks refuse a read-back without the parent and a route without the step", () => {
  const publishing = read(".agents/skills/references/publishing.md");
  assert.throws(() => checkSharedStep(publishing.split(PARENT_READ_BACK).join("")), /parent read-back/);
  assert.throws(() => checkRoute(read(".agents/skills/file-task/SKILL.md").split(`#${STEP}`).join(""), "../references/publishing.md"), /links/);
  const writerReports = read(".agents/skills/orchestrate-issues/references/writer-reports.md");
  assert.throws(() => checkCoordinator(writerReports.split(PARENT_READ_BACK).join("")), /reads the parent back/);
  assert.throws(() => checkCoordinator(writerReports.split("`separate --under U --reason`").join("`separate --reason [--under U]`")), /takes the umbrella/);
});
