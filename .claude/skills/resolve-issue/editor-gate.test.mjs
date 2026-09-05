#!/usr/bin/env node
// Pins editorGate, the once-per-run check a ui step runs before it captures or
// acts on the screen (#423). Run:
//   node .claude/skills/resolve-issue/editor-gate.test.mjs
//
// The gate is built from three injectable questions — is an editor expected
// where the page is now, is it present, has it settled — so these cases drive
// it with stubs and no browser. The stubs answer from scripted lists and throw
// when a list runs dry, so a case that miscounts the gate's calls fails
// loudly instead of getting a plausible default. The presence stub's failure
// reason comes from editorAbsentReason, the same function the real check
// uses, so the strings cannot drift apart and every advice branch is covered.
//
// The shapes pinned are the ones reviews found wrong: a step on a screen with
// no editor must never be refused because an earlier step gave up; a give-up
// must clear when a later look finds the editor up and settled; a give-up from
// a view that never settles must fail later steps fast rather than re-pay the
// full budgets; the budgets must be the ones the message names; a page with
// no pane mounted counts as an editor still to come; navigational advice
// ("put --screen main before this step") must survive into the gate's
// message while the generic advice is said once; and a screen switch that
// settled the editor counts for the once-per-run rule.
//
// Node's built-in assert only.

import assert from "node:assert/strict";
import { editorAbsentReason, editorGate } from "./driver.mjs";

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
const MAIN_TAB = { screen: "logic", panelTab: "main" };
const SCRIPTS_TAB = { screen: "logic", panelTab: "scripts" };
const ASSETS = { screen: "assets", panelTab: "files" };

const script = (answers, absentAt = MAIN_TAB) => {
  const take = (list, name) => {
    if (list.length === 0) throw new Error(`stub "${name}" asked more times than scripted`);
    return list.shift();
  };
  const calls = { present: [], settle: [] };
  const gate = editorGate({
    expected: async () => take(answers.expected, "expected"),
    present: async (_p, budget) => {
      calls.present.push(budget);
      const at = typeof absentAt === "function" ? absentAt() : absentAt;
      return take(answers.present, "present") ? { present: true } : { present: false, ...editorAbsentReason({ ...at, budgetMs: budget }) };
    },
    settle: async (_p, budget) => {
      calls.settle.push(budget);
      return take(answers.settle, "settle");
    },
  });
  return { gate, calls };
};

const noRepeats = (reason) => {
  assert.equal((reason.match(/\d+s/g) ?? []).length <= 1, true, `budget named twice in: ${reason}`);
  assert.equal((reason.match(/re-run/gi) ?? []).length <= 1, true, `advice given twice in: ${reason}`);
  assert.equal((reason.match(/saturated/g) ?? []).length <= 1, true, `advice given twice in: ${reason}`);
  assert.equal((reason.match(/the script editor/g) ?? []).length <= 2, true, `subject repeated in: ${reason}`);
};

await check("a screen where no editor is expected is never gated, even after an earlier give-up", async () => {
  const { gate, calls } = script({ expected: [true, false], present: [false], settle: [] });
  const first = await gate(page, "screenshot", 1);
  assert.equal(first.ok, false);
  assert.match(first.reason, /had not mounted within 20s \(the script editor is not on screen \(active screen: logic, tab: main\)\); Re-run/);
  noRepeats(first.reason);
  const second = await gate(page, "screenshot", 2);
  assert.deepEqual(second, { required: false });
  assert.deepEqual(calls.present, [20_000]);
});

await check("navigational advice from the presence check survives into the gate's message, and the generic advice is not added on top", async () => {
  const scripts = script({ expected: [null], present: [false], settle: [] }, SCRIPTS_TAB);
  const r1 = await scripts.gate(page, "panel", 1);
  // The pane mounted during the wait, so the no-pane prefix is not said.
  assert.match(r1.reason, /within 20s \(the script editor is not on screen \(active screen: logic, tab: scripts\)\); put --screen main before this step$/);
  noRepeats(r1.reason);
  const assets = script({ expected: [null], present: [false], settle: [] }, ASSETS);
  const r2 = await assets.gate(page, "screenshot", 1);
  assert.match(r2.reason, /\(active screen: assets, tab: files\)\); put --screen logic before this step$/);
  assert.doesNotMatch(r2.reason, /Re-run/);
});

await check("after an absent give-up the next gated step fails fast and names the step; a later look that finds the editor clears the latch", async () => {
  const { gate, calls } = script({ expected: [true, true, true], present: [false, false, true, true], settle: [true] });
  await gate(page, "screenshot", 1);
  const fast = await gate(page, "key press", 2);
  assert.equal(fast.ok, false);
  assert.match(fast.reason, /still not up \(step 1 reported: the script editor is not on screen \(active screen: logic, tab: main\)\); this key press was skipped/);
  noRepeats(fast.reason);
  const recovered = await gate(page, "screenshot", 3);
  assert.deepEqual(recovered, { required: true, ok: true });
  // 20 s first, a 2 s quick look on the fast-fail, then 2 s + the full budget once the quick look succeeds.
  assert.deepEqual(calls.present, [20_000, 2_000, 2_000, 20_000]);
});

await check("the wait is paid once: later steps get the shorter budgets and the message names the budget used", async () => {
  const { gate, calls } = script({ expected: [true, true, true], present: [true, true, false], settle: [true, true] });
  assert.deepEqual(await gate(page, "screenshot", 1), { required: true, ok: true });
  assert.deepEqual(await gate(page, "screenshot", 2), { required: true, ok: true });
  const late = await gate(page, "screenshot", 3);
  assert.equal(late.ok, false);
  assert.match(late.reason, /had not mounted within 8s/);
  noRepeats(late.reason);
  assert.deepEqual(calls.present, [20_000, 8_000, 8_000]);
  assert.deepEqual(calls.settle, [15_000, 8_000]);
});

await check("a screen switch that settled the editor counts for the once-per-run rule", async () => {
  const { gate, calls } = script({ expected: [true], present: [true], settle: [true] });
  gate.noteSettled();
  assert.deepEqual(await gate(page, "screenshot", 2), { required: true, ok: true });
  assert.deepEqual(calls.present, [8_000]);
  assert.deepEqual(calls.settle, [8_000]);
});

await check("a view that never settles fails the step with the settle budget named, and later steps fail fast on a short re-settle rather than re-paying the full budgets", async () => {
  // The editor is present throughout; only the settle fails. The second step
  // takes the 2 s look (present) and the 6 s re-settle (still failing) and
  // stops there: no 20 s presence wait, no 15 s settle.
  const { gate, calls } = script({ expected: [true, true, true], present: [true, true, true, true], settle: [false, false, true, true] });
  const first = await gate(page, "panel", 1);
  assert.equal(first.ok, false);
  assert.match(first.reason, /kept being replaced for 15s/);
  noRepeats(first.reason);
  const fast = await gate(page, "field", 2);
  assert.equal(fast.ok, false);
  assert.match(fast.reason, /still being replaced \(step 1 reported: the view kept being replaced for 15s\); this field was skipped/);
  // A third step whose short re-settle succeeds clears the latch and proceeds on the full path.
  const third = await gate(page, "screenshot", 3);
  assert.deepEqual(third, { required: true, ok: true });
  assert.deepEqual(calls.present, [20_000, 2_000, 2_000, 20_000]);
  assert.deepEqual(calls.settle, [15_000, 6_000, 6_000, 15_000]);
});

await check("editorAbsentReason keeps its three advice branches apart, and a page with no screen gets no navigational advice", async () => {
  assert.equal(editorAbsentReason({ ...MAIN_TAB, budgetMs: 20_000 }).navigational, null);
  assert.equal(editorAbsentReason({ ...SCRIPTS_TAB, budgetMs: 20_000 }).navigational, "put --screen main before this step");
  assert.equal(editorAbsentReason({ ...ASSETS, budgetMs: 500 }).navigational, "put --screen logic before this step");
  const none = editorAbsentReason({ screen: null, panelTab: null, budgetMs: 20_000 });
  assert.equal(none.where, "the script editor is not on screen (active screen: none)");
  assert.equal(none.navigational, null);
});

await check("a page that never mounts a pane is told to re-run, not to switch screens, and a pane that mounted during the wait is named without the no-pane prefix", async () => {
  const NONE = { screen: null, panelTab: null };
  const never = script({ expected: [null], present: [false], settle: [] }, NONE);
  const r1 = await never.gate(page, "screenshot", 1);
  assert.match(r1.reason, /\(no pane had mounted; the script editor is not on screen \(active screen: none\)\); Re-run; if it persists the machine is saturated$/);
  noRepeats(r1.reason);
  // The presence check saw the assets pane arrive during its wait.
  const late = script({ expected: [null], present: [false], settle: [] }, ASSETS);
  const r2 = await late.gate(page, "screenshot", 1);
  assert.match(r2.reason, /within 20s \(the script editor is not on screen \(active screen: assets, tab: files\)\); put --screen logic before this step$/);
  assert.doesNotMatch(r2.reason, /no pane had mounted/);
});

if (failures > 0) {
  console.log(`\n${failures} failing`);
  process.exit(1);
}
console.log("\nall passing");
