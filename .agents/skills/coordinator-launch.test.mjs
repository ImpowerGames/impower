// The Windows recipe for starting the review coordinator names
// scripts/start-coordinator.mjs. A coordinator started from the writer's own
// shell gets a visible console that takes keyboard focus each round, and one
// started with Start-Process is stopped with the command tool call that
// started it, so neither file may offer either as the Windows start.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const FILES = [".agents/skills/references/runner-review.md", ".agents/skills/review-pr/HANDOFF.md"];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
// Sentences, split at a full stop followed by whitespace outside code spans.
const sentences = (text) => text.replace(/`[^`\n]*`/g, (code) => code.replace(/\. /g, ".\u0000")).split(/(?<=\.)\s+/).map((s) => s.replace(/\u0000/g, " "));

for (const file of FILES) {
  test(`${file} starts the Windows coordinator through start-coordinator.mjs`, () => {
    const text = read(file);
    const commands = (text.match(/`[^`\n]*`/g) ?? []).filter((code) => code.includes("Start-Process"));
    assert.deepEqual(commands, [], `${file} gives Start-Process as a command`);
    const windows = sentences(text).filter((s) => /Windows/.test(s));
    assert.ok(windows.some((s) => s.includes("`node scripts/start-coordinator.mjs <absolute-plan.json> <absolute-job-dir>`")), `${file} has no Windows sentence naming node scripts/start-coordinator.mjs`);
    for (const s of windows) {
      if (/node scripts\/agent-handoff\.mjs <absolute-plan\.json>/.test(s)) assert.match(s, /start-coordinator\.mjs/, `${file} starts the coordinator directly on Windows: ${s}`);
    }
  });
}

test("runner-review.md says why: a visible console that takes focus, and a Start-Process child stopped with the tool call", () => {
  const all = sentences(read(".agents/skills/references/runner-review.md"));
  assert.ok(all.some((s) => /writer's own shell/.test(s) && /console window that takes keyboard focus/.test(s)), "no sentence on the visible console");
  assert.ok(all.some((s) => /Start-Process/.test(s) && /stopped with it when the host kills that call/.test(s)), "no sentence on why Start-Process is not enough");
  assert.ok(all.some((s) => /outlives the command tool call that started it/.test(s)), "no sentence on outliving the tool call");
});
