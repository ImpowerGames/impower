#!/usr/bin/env node
// Pins editorGate, the once-per-run check a ui step runs before it captures or
// acts on the screen (#423). Run:
//   node .claude/skills/resolve-issue/editor-gate.test.mjs
//
// The gate is built from three injectable questions — is an editor expected
// where the page is now, is it present, has it settled — so these cases drive
// it with stubs and no browser. The shapes pinned are the ones a review found
// wrong: a step on a screen with no editor must never be refused because an
// earlier step gave up; a give-up must clear when a later look finds the
// editor; the budgets must be the ones the message names; a page with no pane
// mounted counts as an editor still to come.
//
// Node's built-in assert only.

import assert from "node:assert/strict";
import { editorGate } from "./driver.mjs";

let failures = 0;
const check = async (name, fn) => {
  try {
    await fn();
    console.log(`PASS: ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL: ${name}`);
    console.log(`  ${String(err.message).split("\n").join("\n  ")}`);
  }
};

const page = {};
const script = (answers) => {
  // Each stub records the budgets it was asked for, so a case can assert the
  // once-per-run rule rather than infer it from timing.
  const calls = { present: [], settle: [] };
  const gate = editorGate({
    expected: async () => answers.expected.shift(),
    present: async (_p, budget) => {
      calls.present.push(budget);
      const r = answers.present.shift();
      return r ? { present: true } : { present: false, reason: "the script editor is not on screen (active screen: logic, tab: main)" };
    },
    settle: async (_p, budget) => {
      calls.settle.push(budget);
      return answers.settle.shift();
    },
  });
  return { gate, calls };
};

await check("a screen where no editor is expected is never gated, even after an earlier give-up", async () => {
  const { gate, calls } = script({ expected: [true, false], present: [false], settle: [] });
  const first = await gate(page, "screenshot");
  assert.equal(first.ok, false);
  assert.match(first.reason, /had not mounted within 20s/);
  const second = await gate(page, "screenshot");
  assert.deepEqual(second, { required: false });
  assert.deepEqual(calls.present, [20_000]);
});

await check("after a give-up the next gated step fails fast, and a later look that finds the editor clears the latch", async () => {
  const { gate, calls } = script({ expected: [true, true, true], present: [false, false, true, true], settle: [true] });
  await gate(page, "screenshot");
  const fast = await gate(page, "key press");
  assert.equal(fast.ok, false);
  assert.match(fast.reason, /still not up \(an earlier step reported: the script editor is not on screen/);
  assert.match(fast.reason, /this key press was skipped/);
  const recovered = await gate(page, "screenshot");
  assert.deepEqual(recovered, { required: true, ok: true });
  // 20 s first, a 2 s quick look on the fast-fail, then 2 s + the full budget once the quick look succeeds.
  assert.deepEqual(calls.present, [20_000, 2_000, 2_000, 20_000]);
});

await check("the wait is paid once: later steps get the shorter budgets and the message names the budget used", async () => {
  const { gate, calls } = script({ expected: [true, true, true], present: [true, true, false], settle: [true, true] });
  assert.deepEqual(await gate(page, "screenshot"), { required: true, ok: true });
  assert.deepEqual(await gate(page, "screenshot"), { required: true, ok: true });
  const late = await gate(page, "screenshot");
  assert.equal(late.ok, false);
  assert.match(late.reason, /had not mounted within 8s/);
  assert.deepEqual(calls.present, [20_000, 8_000, 8_000]);
  assert.deepEqual(calls.settle, [15_000, 8_000]);
});

await check("a page with no pane mounted counts as an editor still to come and says so", async () => {
  const { gate } = script({ expected: [null], present: [false], settle: [] });
  const r = await gate(page, "screenshot");
  assert.equal(r.ok, false);
  assert.match(r.reason, /no pane had mounted; the script editor is not on screen/);
});

await check("a view that never settles fails the step with the settle budget named, and the give-up carries that reason", async () => {
  const { gate } = script({ expected: [true, true], present: [true, false], settle: [false] });
  const r = await gate(page, "panel");
  assert.equal(r.ok, false);
  assert.match(r.reason, /kept being replaced for 15s/);
  const next = await gate(page, "panel");
  assert.match(next.reason, /an earlier step reported: the editor kept being replaced for 15s/);
});

if (failures > 0) {
  console.log(`\n${failures} failing`);
  process.exit(1);
}
console.log("\nall passing");
