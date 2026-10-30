#!/usr/bin/env node

import assert from "node:assert/strict";
import vm from "node:vm";
import crypto from "node:crypto";
import { editorAbsentReason, editorGate, switchScreen, waitForEditor, focusEditor } from "./driver.mjs";

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
await check("editor readiness survives loading after the first request without DOM access", async () => {
  let listener, ready = false, reads = 0;
  const context = vm.createContext({ crypto, setTimeout, clearTimeout, Date, window: { __editorProtocol: {
    subscribe(fn) { listener = fn; return () => { listener = null; }; },
    send: async () => {
      reads++;
      if (!ready) throw new Error("No editor yet");
      return { textDocument: { uri: "file:///main.sd", version: 1, text: "hello" } };
    },
  } } });
  const pending = waitForEditor({
    waitForFunction: async () => {},
    evaluate: async (fn, arg) => vm.runInContext(`(${fn})`, context)(arg),
  }, 1000);
  pending.catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 0));
  ready = true;
  listener?.({ method: "editor/didLoad" });
  await pending;
  assert.equal(reads, 2);
  assert.equal(listener, null);
});
await check("readiness times out and removes its subscription when no editor answers", async () => {
  let listener;
  const context = vm.createContext({ crypto, setTimeout, clearTimeout, Date, window: { __editorProtocol: {
    subscribe(fn) { listener = fn; return () => { listener = null; }; },
    send: () => new Promise(() => {}),
  } } });
  await assert.rejects(waitForEditor({
    waitForFunction: async () => {},
    evaluate: async (fn, arg) => vm.runInContext(`(${fn})`, context)(arg),
  }, 20), /readiness deadline/);
  assert.equal(listener, null);
});
await check("focusing preserves the protocol selection without accessing CodeMirror", async () => {
  const selection = { start: { line: 1, character: 2 }, end: { line: 2, character: 3 } };
  const messages = [];
  const context = vm.createContext({ crypto, window: { __editorProtocol: {
    send: async (message) => {
      messages.push(message);
      return { textDocument: { uri: "file://local/main.sd" }, selection };
    },
  } } });
  await focusEditor({ waitForFunction: async () => {}, evaluate: async (fn, arg) => vm.runInContext(`(${fn})`, context)(arg) });
  assert.equal(messages[1].method, "editor/select");
  assert.deepEqual(JSON.parse(JSON.stringify(messages[1].params)), { textDocument: { uri: "file://local/main.sd" }, range: selection, takeFocus: true });
});
const MAIN_TAB = { screen: "logic", panelTab: "main" };
const SCRIPTS_TAB = { screen: "logic", panelTab: "scripts" };
const ASSETS = { screen: "assets", panelTab: "files" };

const script = (answers, absentAt = MAIN_TAB) => {
  const take = (list, name) => {
    if (list.length === 0) throw new Error(`stub "${name}" asked more times than scripted`);
    return list.shift();
  };
  const calls = { present: [], settle: [], painted: [] };
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
    painted: async (_p, budget) => {
      calls.painted.push(budget);
      return answers.painted ? take(answers.painted, "painted") : true;
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
  const { gate, calls } = script({ expected: [true, true, true], present: [true, true, true, true], settle: [false, false, true, true] });
  const first = await gate(page, "panel", 1);
  assert.equal(first.ok, false);
  assert.match(first.reason, /did not return settled diagnostics for 15s/);
  noRepeats(first.reason);
  const fast = await gate(page, "field", 2);
  assert.equal(fast.ok, false);
  assert.match(fast.reason, /still waiting for settled diagnostics \(step 1 reported: the view did not return settled diagnostics for 15s\); this field was skipped/);
  const third = await gate(page, "screenshot", 3);
  assert.deepEqual(third, { required: true, ok: true });
  assert.deepEqual(calls.present, [20_000, 2_000, 2_000, 20_000]);
  assert.deepEqual(calls.settle, [15_000, 6_000, 6_000, 15_000]);
});

await check("a settled but unpainted editor fails a screenshot and no other step", async () => {
  const { gate, calls } = script({ expected: [true, true], present: [true, true], settle: [true, true], painted: [false] });
  const shot = await gate(page, "screenshot", 1);
  assert.equal(shot.ok, false);
  assert.match(shot.reason, /has not painted its lines and gutter within 5s; this screenshot would have shown an unpainted editor pane/);
  noRepeats(shot.reason);
  assert.deepEqual(await gate(page, "key press", 2), { required: true, ok: true });
  assert.deepEqual(calls.painted, [5_000]);
});

await check("a settle done elsewhere clears an absent give-up, and a reload resets the gate to cold", async () => {
  const { gate, calls } = script({ expected: [true, true, true], present: [false, true, true], settle: [true, true] });
  await gate(page, "screenshot", 1);
  gate.noteSettled();
  assert.deepEqual(await gate(page, "screenshot", 2), { required: true, ok: true });
  assert.deepEqual(calls.present, [20_000, 8_000]);
  gate.reset();
  assert.deepEqual(await gate(page, "screenshot", 3), { required: true, ok: true });
  assert.deepEqual(calls.present, [20_000, 8_000, 20_000]);
  assert.deepEqual(calls.settle, [8_000, 15_000]);
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
  const late = script({ expected: [null], present: [false], settle: [] }, ASSETS);
  const r2 = await late.gate(page, "screenshot", 1);
  assert.match(r2.reason, /within 20s \(the script editor is not on screen \(active screen: assets, tab: files\)\); put --screen logic before this step$/);
  assert.doesNotMatch(r2.reason, /no pane had mounted/);
});

const editorlessLogicPage = () => ({
  waited: [],
  locator: () => ({ first: () => ({ waitFor: async () => {}, click: async () => {} }) }),
  async waitForFunction(fn, _arg, opts) {
    const src = String(fn);
    return true;
  },
  async evaluate(fn, arg) {
    const src = String(fn);
    if (src.includes('method: "editor/read"')) {
      this.waited.push(arg.timeout);
      throw new Error("Editor readiness deadline exceeded");
    }
    if (src.includes("MutationObserver")) return true;
    if (src.includes("Object.entries(screens)")) return ["logic"];
    if (src.includes('["logic", "assets", "share"]')) return "main";
    if (src.includes('.cm-content") != null')) return false;
    if (src.includes("-trigger-main")) return true;
    throw new Error(`stub page asked something it has no answer for: ${src.slice(0, 80)}`);
  },
});

await check("a --screen logic whose editor never mounts is a note only when --screen main follows, and a failure otherwise; --screen main itself never gets the note", async () => {
  const page = editorlessLogicPage();
  const paired = await switchScreen(page, "logic", { followedByMain: true });
  assert.equal(paired.active, true);
  assert.equal(paired.editorHere, false);
  assert.equal(paired.reason, undefined);
  assert.match(paired.note, /the logic tab is up but no script editor mounted within 20s; the --screen main that follows waits for it$/);
  assert.equal(page.waited.length, 1);
  assert.ok(page.waited[0] > 19_000 && page.waited[0] <= 20_000);
  const alone = await switchScreen(editorlessLogicPage(), "logic", { followedByMain: false });
  assert.equal(alone.note, undefined);
  assert.match(alone.reason, /the logic tab is up but no script editor mounted within 20s\. Re-run; if it persists the machine is saturated$/);
  const main = await switchScreen(editorlessLogicPage(), "main", { followedByMain: true });
  assert.equal(main.note, undefined);
  assert.match(main.reason, /the main tab is up but no script editor mounted within 20s\. Re-run/);
});

if (failures > 0) {
  console.log(`\n${failures} failing`);
  process.exit(1);
}
console.log("\nall passing");
