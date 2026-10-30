#!/usr/bin/env node

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

const SCRIPT = [
  "$:",
  "  A MOONLIT ROOFTOP",
  "",
  "ALICE:",
  "  Line one of the scrub repro.",
  "",
  "BOB:",
  "  Line two of the scrub repro.",
  "",
  "ALICE:",
  "  Line three of the scrub repro.",
];

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
  const script = ["ALICE:", "  You have {hp} health.", "", "BOB:", "  Fine."];
  const r = classifyScrub(script, 2, rendered("ALICE", "You have 100 health."));
  assert.equal(r.outcome, "inconclusive");
  assert.match(r.reason, /verbatim/);
});

check("a line that is a prefix of another is never used as evidence", () => {
  const script = ["ALICE:", "  Hello", "", "BOB:", "  Hello there"];
  const r = classifyScrub(script, 2, rendered("BOB", "Hello there"));
  assert.notEqual(r.outcome, "landed");
  assert.equal(r.outcome, "elsewhere");
  assert.deepEqual(r.showing, [5]);
});

check("a prefix line with nothing else on screen is inconclusive", () => {
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
  assert.equal(asTarget.showing, undefined);
});

check("a very short line is not evidence", () => {
  const script = ["ALICE:", "  Hi", "", "BOB:", "  Something else entirely."];
  const r = classifyScrub(script, 2, rendered("ALICE", "Hi"));
  assert.notEqual(r.outcome, "landed");
});

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
