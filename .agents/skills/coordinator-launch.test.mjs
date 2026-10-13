// The Windows recipe for starting the review coordinator recommends
// scripts/start-coordinator.mjs. Neither file may give Start-Process as a
// command, and in every sentence about Windows that names a way to start the
// coordinator, the first such command is start-coordinator.mjs, so a recipe
// that recommends a direct `node scripts/agent-handoff.mjs <plan>` start fails
// however the sentence around it is worded.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const FILES = [".agents/skills/references/runner-review.md", ".agents/skills/review-pr/HANDOFF.md"];
const START = "`node scripts/start-coordinator.mjs <absolute-plan.json> <absolute-job-dir>`";
const DIRECT = "`node scripts/agent-handoff.mjs <absolute-plan.json>`";
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
// Sentences, split at a full stop followed by whitespace outside code spans.
const sentences = (text) => text.replace(/`[^`\n]*`/g, (code) => code.replace(/\. /g, ".\u0000")).split(/(?<=\.)\s+/).map((s) => s.replace(/\u0000/g, " "));
const codeSpans = (text) => text.match(/`[^`\n]*`/g) ?? [];

export function launchProblems(text) {
  const problems = codeSpans(text).filter((code) => code.includes("Start-Process")).map((code) => `gives Start-Process as a command: ${code}`);
  const windows = sentences(text).filter((s) => /Windows/.test(s));
  if (!windows.some((s) => s.includes(START))) problems.push(`no Windows sentence names ${START}`);
  for (const s of windows) {
    const first = codeSpans(s).find((code) => code === START || code === DIRECT);
    if (first === DIRECT) problems.push(`recommends a direct start on Windows: ${s}`);
  }
  return problems;
}

for (const file of FILES) {
  test(`${file} starts the Windows coordinator through start-coordinator.mjs`, () => {
    assert.deepEqual(launchProblems(read(file)), []);
  });
}

test("a recipe that recommends Start-Process or a direct start is refused, whatever its wording", () => {
  const reasons = "A coordinator started any other way opens a console that takes focus.";
  assert.deepEqual(launchProblems(`On Windows, start the coordinator with ${START}. ${reasons}`), []);
  assert.deepEqual(launchProblems(`On Windows, prefer ${START} over ${DIRECT}.`), []);
  for (const bad of [
    `On Windows, start the coordinator with ${DIRECT} in place of ${START}.`,
    `On Windows, start it with ${DIRECT} instead of ${START}.`,
    `Windows launches go through ${DIRECT}; ${START} is optional.`,
  ]) assert.match(launchProblems(bad).join("\n"), /recommends a direct start/, bad);
  assert.match(launchProblems(`On Windows, start it with ${START} or \`Start-Process node\`.`).join("\n"), /Start-Process/);
  assert.match(launchProblems(`On Windows, run ${DIRECT}.`).join("\n"), /no Windows sentence/);
});
