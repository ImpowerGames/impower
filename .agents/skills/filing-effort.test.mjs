import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("bug, feature and task filing publish and verify Effort through the shared procedure", () => {
  const effort = read(".agents/skills/references/issue-fields.md");

  for (const skillPath of [
    ".agents/skills/file-bug/SKILL.md",
    ".agents/skills/file-feature/SKILL.md",
    ".agents/skills/file-task/SKILL.md",
  ]) {
    assert.ok(read(skillPath).includes("](../references/issue-fields.md)"), `${skillPath} links the shared procedure`);
  }

  for (const contract of [
    "orgs/ImpowerGames/issue-fields",
    "gh api -X POST -H \"X-GitHub-Api-Version: 2026-03-10\" repos/<tickets>/issues/<number>/issue-field-values",
    "gh api -H \"X-GitHub-Api-Version: 2026-03-10\" repos/<tickets>/issues/<number>/issue-field-values --paginate",
    "single_select_option.name",
  ]) {
    assert.ok(effort.includes(contract), `the procedure names ${contract}`);
  }
});
