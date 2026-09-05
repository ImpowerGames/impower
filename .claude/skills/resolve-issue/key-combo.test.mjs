#!/usr/bin/env node
// Pins normalizeKeyCombo and pressKey, which rewrite a shifted lowercase
// letter before the driver presses it (#423). Run:
//   node .claude/skills/resolve-issue/key-combo.test.mjs
//
// Playwright's key strings are case-sensitive for a single character, so
// `Control+Shift+g` delivers `key: "g"` with Shift held, which no keyboard
// produces and which CodeMirror resolves to the unshifted binding. Measured
// in the live editor on 2026-09-04 (playwright 1.61): the uppercase form and
// the `KeyG` form both deliver `key: "G"`. The rewrite exists so a session
// that writes the shortcut the natural way gets the shortcut it meant, and
// pressKey is what `--press` and every panel shortcut go through, so it is
// pinned here too against a fake keyboard.
//
// Pure functions, no browser. Node's built-in assert only.

import assert from "node:assert/strict";
import { normalizeKeyCombo, pressKey } from "./driver.mjs";

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

await check("a shifted lowercase letter is uppercased", () => {
  assert.deepEqual(normalizeKeyCombo("Control+Shift+g"), { combo: "Control+Shift+G", rewritten: true });
  assert.deepEqual(normalizeKeyCombo("Shift+a"), { combo: "Shift+A", rewritten: true });
});

await check("an already-uppercase letter and the KeyX form pass through", () => {
  assert.deepEqual(normalizeKeyCombo("Control+Shift+G"), { combo: "Control+Shift+G", rewritten: false });
  assert.deepEqual(normalizeKeyCombo("Control+Shift+KeyG"), { combo: "Control+Shift+KeyG", rewritten: false });
});

await check("without Shift a lowercase letter stays lowercase", () => {
  assert.deepEqual(normalizeKeyCombo("Control+f"), { combo: "Control+f", rewritten: false });
  assert.deepEqual(normalizeKeyCombo("g"), { combo: "g", rewritten: false });
});

await check("named keys and digits are never touched", () => {
  assert.deepEqual(normalizeKeyCombo("Shift+Enter"), { combo: "Shift+Enter", rewritten: false });
  assert.deepEqual(normalizeKeyCombo("Control+Shift+1"), { combo: "Control+Shift+1", rewritten: false });
  assert.deepEqual(normalizeKeyCombo("Escape"), { combo: "Escape", rewritten: false });
});

await check("a + key is written as a trailing + and survives", () => {
  assert.deepEqual(normalizeKeyCombo("Control++"), { combo: "Control++", rewritten: false });
  assert.deepEqual(normalizeKeyCombo("Control+Shift++"), { combo: "Control+Shift++", rewritten: false });
  assert.deepEqual(normalizeKeyCombo("+"), { combo: "+", rewritten: false });
});

await check("an empty combo, or one that names no key, is refused rather than pressed as nothing", () => {
  assert.throws(() => normalizeKeyCombo(""), /empty key combo/);
  assert.throws(() => normalizeKeyCombo("   "), /empty key combo/);
  assert.throws(() => normalizeKeyCombo("Control+"), /names no key|empty/);
});

await check("whitespace around the plus signs is tolerated and Shift is matched case-insensitively", () => {
  assert.deepEqual(normalizeKeyCombo("control + shift + g"), { combo: "control+shift+G", rewritten: true });
});

await check("pressKey presses the rewritten combo, not the one it was given", async () => {
  const pressed = [];
  const page = { keyboard: { press: async (c) => pressed.push(c) } };
  const r = await pressKey(page, "Control+Shift+g");
  assert.deepEqual(pressed, ["Control+Shift+G"]);
  assert.deepEqual(r, { combo: "Control+Shift+G", rewritten: true });
});

if (failures > 0) {
  console.log(`\n${failures} failing`);
  process.exit(1);
}
console.log("\nall passing");
