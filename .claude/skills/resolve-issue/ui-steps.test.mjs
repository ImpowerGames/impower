#!/usr/bin/env node
// Pins parseUiSteps, which turns `driver.mjs ui` arguments into steps and
// refuses anything malformed before a browser is launched (#423). Run:
//   node .claude/skills/resolve-issue/ui-steps.test.mjs
//
// The failure this guards against: a flag with a missing or empty value used
// to produce a step that matched no branch and vanished, so `ui --sd` or
// `--type "=Hello"` printed a clean report saying the run did nothing, which
// the skill reads as a pass. And an unknown panel, field, button or
// screenshot target used to throw from inside the step loop, after the
// browser was up and earlier steps had run, taking the whole report with it.
// A screen name is only shape-checked here: whether the tab exists is decided
// at run time, where the failure lists the tabs present.
//
// Pure function, no browser. Node's built-in assert only.

import assert from "node:assert/strict";
import { parseUiSteps } from "./driver.mjs";

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

check("well-formed steps parse in order", () => {
  assert.deepEqual(
    parseUiSteps(["--sd", "r.sd", "--screen", "assets", "--open", "find", "--type", "search=Hello", "--press", "Control+Shift+g", "--click", "replaceAll", "--toggle", "case", "--shot", "a.png", "--shot-of", "find", "b.png", "--close", "find", "--probe", "p.js", "--headed"]),
    [
      { sd: "r.sd" },
      { screen: "assets" },
      { open: "find" },
      { type: "search", text: "Hello" },
      { press: "Control+Shift+g" },
      { click: "replaceAll" },
      { toggle: "case" },
      { shotOf: "page", out: "a.png" },
      { shotOf: "find", out: "b.png" },
      { close: "find" },
      { probe: "p.js" },
    ],
  );
});

check("a literal backslash-n in --type text becomes a line break, and an = inside the text is kept", () => {
  assert.deepEqual(parseUiSteps(["--type", "replace=one\\n  two"]), [{ type: "replace", text: "one\n  two" }]);
  assert.deepEqual(parseUiSteps(["--type", "search=a=b"]), [{ type: "search", text: "a=b" }]);
  assert.deepEqual(parseUiSteps(["--type", "search="]), [{ type: "search", text: "" }]);
});

check("a flag with a missing or empty value is refused, not dropped", () => {
  assert.throws(() => parseUiSteps(["--sd"]), /--sd needs a value/);
  assert.throws(() => parseUiSteps(["--screen", ""]), /--screen needs a value/);
  assert.throws(() => parseUiSteps(["--open", "--shot", "x.png"]), /--open needs a value/);
  assert.throws(() => parseUiSteps(["--shot-of", "find"]), /--shot-of needs a value/);
  assert.throws(() => parseUiSteps(["--type", "=Hello"]), /field name/);
  assert.throws(() => parseUiSteps(["--type", "Hello"]), /field=text/);
});

check("an unknown panel, field, button, toggle or shot target is refused by name (a screen is checked at run time)", () => {
  assert.throws(() => parseUiSteps(["--open", "finnd"]), /unknown panel "finnd"/);
  assert.throws(() => parseUiSteps(["--close", "search"]), /unknown panel "search"/);
  assert.throws(() => parseUiSteps(["--type", "serch=x"]), /unknown field "serch"/);
  assert.throws(() => parseUiSteps(["--click", "closs"]), /unknown button "closs"/);
  assert.throws(() => parseUiSteps(["--toggle", "regex"]), /unknown toggle "regex"/);
  assert.throws(() => parseUiSteps(["--shot-of", "bogus", "x.png"]), /unknown --shot-of target "bogus"/);
  assert.throws(() => parseUiSteps(["--bogus"]), /unknown argument --bogus/);
});

check("a --press combo that names no key is refused at parse time", () => {
  assert.throws(() => parseUiSteps(["--press", "Control+"]), /names no key|empty/);
  assert.deepEqual(parseUiSteps(["--press", "Control++"]), [{ press: "Control++" }]);
});

check("a screen is any lowercase tab value, so a tab the editor grows later is not refused before the run", () => {
  // Measured on 2026-09-04 the editor renders these nine; the parser does not
  // pin the list, and a name that is not on the page fails at run time with
  // the tabs present listed.
  for (const name of ["logic", "assets", "share", "main", "scripts", "files", "urls", "game", "screenplay", "future-tab"]) {
    assert.deepEqual(parseUiSteps(["--screen", name]), [{ screen: name }]);
  }
  assert.throws(() => parseUiSteps(["--screen", "Logic"]), /lowercase/);
  assert.throws(() => parseUiSteps(["--screen", "main scripts"]), /lowercase/);
});

if (failures > 0) {
  console.log(`\n${failures} failing`);
  process.exit(1);
}
console.log("\nall passing");
