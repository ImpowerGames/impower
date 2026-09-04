#!/usr/bin/env node
// Pins normalizeKeyCombo, which rewrites a shifted lowercase letter before the
// driver presses it (#423). Run:
//   node .claude/skills/resolve-issue/key-combo.test.mjs
//
// Playwright's key strings are case-sensitive for a single character, so
// `Control+Shift+g` delivers `key: "g"` with Shift held, which no keyboard
// produces and which CodeMirror resolves to the unshifted binding. Measured
// in the live editor on 2026-09-04 (playwright 1.61): the uppercase form and
// the `KeyG` form both deliver `key: "G"`. The rewrite exists so a session
// that writes the shortcut the natural way gets the shortcut it meant.
//
// Pure function, no browser. Node's built-in assert only.

import assert from "node:assert/strict";
import { normalizeKeyCombo } from "./driver.mjs";

let failures = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL: ${name}`);
    console.log(`  ${String(err.message).split("\n").join("\n  ")}`);
  }
};

check("a shifted lowercase letter is uppercased", () => {
  assert.deepEqual(normalizeKeyCombo("Control+Shift+g"), { combo: "Control+Shift+G", rewritten: true });
  assert.deepEqual(normalizeKeyCombo("Shift+a"), { combo: "Shift+A", rewritten: true });
});

check("an already-uppercase letter and the KeyX form pass through", () => {
  assert.deepEqual(normalizeKeyCombo("Control+Shift+G"), { combo: "Control+Shift+G", rewritten: false });
  assert.deepEqual(normalizeKeyCombo("Control+Shift+KeyG"), { combo: "Control+Shift+KeyG", rewritten: false });
});

check("without Shift a lowercase letter stays lowercase", () => {
  assert.deepEqual(normalizeKeyCombo("Control+f"), { combo: "Control+f", rewritten: false });
  assert.deepEqual(normalizeKeyCombo("g"), { combo: "g", rewritten: false });
});

check("named keys and digits are never touched", () => {
  assert.deepEqual(normalizeKeyCombo("Shift+Enter"), { combo: "Shift+Enter", rewritten: false });
  assert.deepEqual(normalizeKeyCombo("Control+Shift+1"), { combo: "Control+Shift+1", rewritten: false });
  assert.deepEqual(normalizeKeyCombo("Escape"), { combo: "Escape", rewritten: false });
});

check("whitespace around the plus signs is tolerated and Shift is matched case-insensitively", () => {
  assert.deepEqual(normalizeKeyCombo("control + shift + g"), { combo: "control+shift+G", rewritten: true });
});

if (failures > 0) {
  console.log(`\n${failures} failing`);
  process.exit(1);
}
console.log("\nall passing");
