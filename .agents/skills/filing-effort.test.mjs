import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("bug and feature filing publish and verify Effort through the shared procedure", () => {
  const sharedReference = ".agents/skills/references/issue-fields.md";
  const effort = read(sharedReference);

  for (const skillPath of [
    ".agents/skills/file-bug/SKILL.md",
    ".agents/skills/file-feature/SKILL.md",
  ]) {
    const skill = read(skillPath);
    assert.match(skill, /\.\.\/references\/issue-fields\.md/);
    assert.match(skill, /assign(?:ing)? and (?:read(?:ing)?|verify(?:ing)?) back Effort/i);
    assert.match(skill, /same issue/i);
    assert.match(skill, /do not (?:create|file) a duplicate/i);
  }

  assert.match(read(".agents/skills/file-feature/SKILL.md"), /every (?:created )?(?:ticket|slice)/i);
  assert.match(effort, /Effort includes reproduction, implementation, regression and platform verification/);
  assert.match(effort, /Low[\s\S]*Medium[\s\S]*High/);
  assert.match(effort, /orgs\/ImpowerGames\/issue-fields/);
  assert.match(effort, /issue-field-values/);
  assert.match(effort, /single_select_option\.name/);
  assert.match(effort, /Projects access is unnecessary/);
  assert.match(effort, /body mention is not field assignment/i);
  assert.match(effort, /concise rationale/i);
  assert.match(effort, /uncertainty/i);
  assert.match(effort, /POST to preserve unrelated fields/);
});
