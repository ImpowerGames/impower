#!/usr/bin/env node
// Pins classifyScrub, which decides whether a preview scrub landed. Run:
//   node .claude/skills/resolve-issue/scrub-classification.test.mjs
//
// This is the check that replaced comparing the route number against the
// requested line (#419). That comparison called every healthy mid-script scrub
// a failure, because the route number reports how far execution reached rather
// than the line asked for.
//
// The replacement reads the rendered text, and the danger in doing so runs the
// other way: a text check that is too eager reports a scrub as landed when the
// preview is somewhere else entirely, which hides exactly the failure the
// harness exists to catch. So the cases below are weighted toward the ways a
// naive `visible.includes(lineText)` would say "landed" and be wrong —
// a line that is a prefix of another, duplicated lines, a one- or two-character
// line — and each asserts the classifier refuses to answer rather than guessing.
//
// Pure function, no browser, no network. Node's built-in assert only.

import assert from "node:assert/strict";
import { classifyScrub } from "./driver.mjs";

let failures = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL: ${name}`);
    console.log(`      ${err.message.split("\n")[0]}`);
  }
};

// A script shaped like the ones this harness drives: a heading, then dialogue
// as a character-name line followed by an indented body.
const SCRIPT = [
  "$:", //                                      1
  "  A MOONLIT ROOFTOP", //                     2
  "", //                                        3
  "ALICE:", //                                  4
  "  Line one of the scrub repro.", //          5
  "", //                                        6
  "BOB:", //                                    7
  "  Line two of the scrub repro.", //          8
  "", //                                        9
  "ALICE:", //                                 10
  "  Line three of the scrub repro.", //       11
];

// What the game renders is the character name and the body, each duplicated by
// the text-outline layer, with a continue caret at the end.
const rendered = (name, body) => `${name}\n${name}\n${body}\n${body}\n▼`;

check("the target line's text on screen is a landing", () => {
  const r = classifyScrub(SCRIPT, 8, rendered("BOB", "Line two of the scrub repro."));
  assert.equal(r.outcome, "landed");
});

check("another line's text on screen is a failed scrub, and names it", () => {
  const r = classifyScrub(SCRIPT, 8, rendered("ALICE", "Line one of the scrub repro."));
  assert.equal(r.outcome, "elsewhere");
  assert.deepEqual(r.showing, [5]);
  assert.match(r.reason, /line 5/);
});

check("asking for a character-name line reports the body line on screen", () => {
  // Line 7 is "BOB:", which the game renders as "BOB" without the colon, so the
  // target itself is never found. Line 8 is, and naming it is more use to the
  // reader than shrugging: it says where the preview actually is.
  const r = classifyScrub(SCRIPT, 7, rendered("BOB", "Line two of the scrub repro."));
  assert.equal(r.outcome, "elsewhere");
  assert.deepEqual(r.showing, [8]);
});

check("asking for a blank line reports the line on screen instead", () => {
  const r = classifyScrub(SCRIPT, 3, rendered("BOB", "Line two of the scrub repro."));
  assert.equal(r.outcome, "elsewhere");
  assert.deepEqual(r.showing, [8]);
});

check("a line that renders non-verbatim is inconclusive, not a failure", () => {
  // Nothing on screen matches any line: the body interpolated a value. The
  // scrub may well have landed, so the classifier must not claim it failed.
  const script = ["ALICE:", "  You have {hp} health.", "", "BOB:", "  Fine."];
  const r = classifyScrub(script, 2, rendered("ALICE", "You have 100 health."));
  assert.equal(r.outcome, "inconclusive");
  assert.match(r.reason, /verbatim/);
});

// --- the ways a naive substring check says "landed" and is wrong ------------

check("a line that is a prefix of another is never used as evidence", () => {
  const script = ["ALICE:", "  Hello", "", "BOB:", "  Hello there"];
  // The screen shows line 5 ("Hello there"). A naive includes() would find
  // "Hello" inside it and call line 2 landed. It must not; and since line 5 is
  // attributable in its own right, the honest answer names it.
  const r = classifyScrub(script, 2, rendered("BOB", "Hello there"));
  assert.notEqual(r.outcome, "landed");
  assert.equal(r.outcome, "elsewhere");
  assert.deepEqual(r.showing, [5]);
});

check("a prefix line with nothing else on screen is inconclusive", () => {
  // Same unusable target, but now nothing attributable is showing, so there is
  // no honest answer to give beyond "cannot tell".
  const script = ["ALICE:", "  Hello", "", "BOB:", "  Hello there"];
  const r = classifyScrub(script, 2, rendered("NARRATOR", "Something unrelated."));
  assert.equal(r.outcome, "inconclusive");
  assert.match(r.reason, /cannot be told apart/);
});

check("the containing line IS still attributable in its own right", () => {
  const script = ["ALICE:", "  Hello", "", "BOB:", "  Hello there"];
  const r = classifyScrub(script, 5, rendered("BOB", "Hello there"));
  assert.equal(r.outcome, "landed");
});

check("duplicated lines are unusable in both directions", () => {
  const script = ["ALICE:", "  Same words here.", "", "BOB:", "  Same words here."];
  const asTarget = classifyScrub(script, 2, rendered("BOB", "Same words here."));
  assert.equal(asTarget.outcome, "inconclusive", "must not claim it landed");
  assert.match(asTarget.reason, /cannot be told apart/);
  // ...and the duplicate must not be reported as "showing" some other line
  // either, which would turn an ambiguous case into a confident failure.
  assert.equal(asTarget.showing, undefined);
});

check("a very short line is not evidence", () => {
  const script = ["ALICE:", "  Hi", "", "BOB:", "  Something else entirely."];
  const r = classifyScrub(script, 2, rendered("ALICE", "Hi"));
  assert.notEqual(r.outcome, "landed");
});

// --- degenerate inputs ------------------------------------------------------

check("no document text is inconclusive", () => {
  assert.equal(classifyScrub(null, 1, "anything").outcome, "inconclusive");
  assert.equal(classifyScrub([], 1, "anything").outcome, "inconclusive");
});

check("no rendered text is inconclusive", () => {
  assert.equal(classifyScrub(SCRIPT, 8, null).outcome, "inconclusive");
  assert.equal(classifyScrub(SCRIPT, 8, "   ").outcome, "inconclusive");
});

check("a line number outside the document is inconclusive", () => {
  for (const n of [0, -1, 999, 1.5]) {
    const r = classifyScrub(SCRIPT, n, rendered("BOB", "Line two of the scrub repro."));
    assert.equal(r.outcome, "inconclusive", `line ${n}`);
  }
});

check("first and last lines are handled", () => {
  const first = classifyScrub(SCRIPT, 2, rendered("", "A MOONLIT ROOFTOP"));
  assert.equal(first.outcome, "landed");
  const last = classifyScrub(SCRIPT, 11, rendered("ALICE", "Line three of the scrub repro."));
  assert.equal(last.outcome, "landed");
});

check("a one-line document is handled", () => {
  const r = classifyScrub(["  Only line here."], 1, rendered("X", "Only line here."));
  assert.equal(r.outcome, "landed");
});

console.log("");
if (failures > 0) {
  console.log(`${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("all checks passed");
