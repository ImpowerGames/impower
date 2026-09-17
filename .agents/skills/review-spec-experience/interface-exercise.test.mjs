import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { interfaceElements, missingItems, reviewability, reviewabilityReport, walkthroughRecord, main, REQUIRED_ITEMS, REQUIRED_TASKS, COLUMNS } from "./interface-exercise.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "impower-interface-exercise-"));
console.log(`Scratch directory: ${scratch}`);

const complete = [
  "## Proposed solution", "", "The preview top bar gets a control.", "",
  "Interface element: Morph pause toggle",
  "- Location: the preview top bar, right of the scrub controls",
  "- Trigger: a click, or the preview menu's Pause motion item",
  "- States: off (motion plays, the default), on (motion frozen at the rest pose); no empty or loading state because it needs no data; hidden when the project declares no morph",
  "- Failure view: when the player refuses the pause flag, the toggle returns to off and the preview status line says why",
  "", "## Alternatives considered", "", "None.", "",
].join("\n");
const partial = ["## Proposed solution", "", "Interface element: Morph pause toggle", "- Location: the preview top bar", "- Trigger: a click", "", "The toggle persists like its neighbours.", ""].join("\n");
const prose = ["## Description", "", "Add a toggle to the web editor's preview top bar that pauses idle morphs.", ""].join("\n");
const fenced = ["```", "Interface element: Not an element", "- Location: inside a code fence", "```", "", "Interface element: Real element", "- location: lowercase labels count", "- TRIGGER: so does upper case", "* States: any bullet marker", "+ Failure view: shown", ""].join("\n");

assert.deepEqual(interfaceElements(complete).map((element) => element.name), ["Morph pause toggle"]);
const ok = reviewability([{ number: 570, body: complete }]);
assert.equal(ok.reviewable, true);
assert.deepEqual(ok.elements[0].missing, []);
assert.equal(ok.elements[0].ticket, 570);
assert.ok(ok.elements[0].items.States.startsWith("off (motion plays"));
assert.match(reviewabilityReport(ok), /^Reviewable: Morph pause toggle \(declared in #570\) declares its location, trigger, states and failure view\./);
assert.match(reviewabilityReport(ok), /fill the walkthrough record/);
const gaps = reviewability([{ number: 570, body: partial }]);
assert.equal(gaps.reviewable, false);
assert.deepEqual(gaps.elements[0].missing, ["States", "Failure view"]);
assert.match(reviewabilityReport(gaps), /Not reviewable: Morph pause toggle \(declared in #570\) lacks States, Failure view\./);
assert.match(reviewabilityReport(gaps), /stop the exercise there/);
const none = reviewability([{ number: 565, body: prose }]);
assert.equal(none.reviewable, null, "no declared and no named element is undetermined, not reviewable");
assert.deepEqual(none.elements, []);
assert.match(reviewabilityReport(none), /No interface element is declared/);
const namedOnly = reviewability([{ number: 565, body: prose }], ["preview morph pause toggle"]);
assert.equal(namedOnly.reviewable, false);
assert.deepEqual(namedOnly.elements[0].missing, REQUIRED_ITEMS, "an element the tickets describe only in prose lacks all four items");
assert.equal(namedOnly.elements[0].ticket, null);
assert.match(reviewabilityReport(namedOnly), /\(named, not declared in any ticket\) lacks Location, Trigger, States, Failure view\./);
assert.equal(reviewability([{ number: 570, body: complete }], ["morph PAUSE toggle"]).elements.length, 1, "a named element that a ticket declares is the declared one");
const across = reviewability([{ number: 565, body: complete }, { number: 570, body: partial }]);
assert.equal(across.reviewable, false);
assert.deepEqual(across.elements.map((element) => [element.ticket, element.missing.length]), [[565, 0], [570, 2]], "one element short of an item makes the surface not reviewable");
const real = interfaceElements(fenced);
assert.deepEqual(real.map((element) => element.name), ["Real element"], "a fenced element line is code");
assert.deepEqual(missingItems(real[0]), [], "labels are matched without regard to case and with any bullet marker");
assert.deepEqual(reviewability([{ number: 1, body: "Interface element: X\n- Location:\n- Trigger: t\n- States: s\n- Failure view: f\n" }]).elements[0].missing, ["Location"], "an empty item is missing");
assert.deepEqual(reviewability([{ number: 1, body: "Interface element: X\n- Location: l\n\n## Scope\n\n- Trigger: t\n- States: s\n- Failure view: f\n" }]).elements[0].missing, ["Trigger", "States", "Failure view"], "a heading ends the element");
assert.deepEqual(reviewability([{ number: 1, body: "Interface element: X\n- Location: l\n\nA paragraph.\n- Trigger: t\n- States: s\n- Failure view: f\n" }]).elements[0].missing, ["Trigger", "States", "Failure view"], "a paragraph after a blank line ends the element");
assert.deepEqual(reviewability([{ number: 1, body: "Interface element: X\n- Location: l\n- Trigger: t\n\n- States: s\n- Failure view: f\n" }]).elements[0].missing, [], "a blank line between bullets keeps the element");
assert.deepEqual(reviewability([{ number: 1, body: "Interface element: X\n- Location: l\nInterface element: Y\n- Trigger: t\n" }]).elements.map((element) => element.missing.length), [3, 3], "the next element line starts a new element");

const record = walkthroughRecord("Morph pause toggle");
assert.match(record, /^## Interface walkthrough: Morph pause toggle$/m);
for (const task of REQUIRED_TASKS) assert.ok(record.includes(`: ${task}`), task);
assert.equal((record.match(/^### Task \d/gm) || []).length, 4, "the four required tasks");
assert.equal((record.match(new RegExp(`^\\| Step \\| ${COLUMNS.join(" \\| ")} \\|$`, "gm")) || []).length, 4, "each task carries the three columns");
assert.match(record, /third column is a finding/);

const snapshotFile = path.join(scratch, "snapshot.json");
fs.writeFileSync(snapshotFile, JSON.stringify({ version: 1, parent: 565, tickets: [{ number: 565, body: prose }, { number: 570, body: partial }] }));
const ticketFile = path.join(scratch, "ticket.md");
fs.writeFileSync(ticketFile, complete);
const proseFile = path.join(scratch, "prose.md");
fs.writeFileSync(proseFile, prose);
for (const script of [path.join(here, "interface-exercise.mjs"), path.join(root, ".claude", "skills", "review-spec-experience", "interface-exercise.mjs")]) {
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8", windowsHide: true });
  const check = run("check", snapshotFile);
  assert.equal(check.status, 1, script + "\n" + check.stderr);
  assert.match(check.stdout, /Not reviewable: Morph pause toggle \(declared in #570\) lacks States, Failure view\./);
  const good = run("check", ticketFile);
  assert.equal(good.status, 0, good.stderr);
  assert.match(good.stdout, /Reviewable: Morph pause toggle \(declared in ticket\.md\)/);
  const named = run("check", snapshotFile, "--element", "preview pause toggle");
  assert.equal(named.status, 1);
  assert.match(named.stdout, /named, not declared in any ticket/);
  const absent = run("check", path.join(scratch, "absent.md"));
  assert.equal(absent.status, 2, "a missing file is an error, not an undetermined result");
  assert.match(absent.stderr, /ENOENT/);
  const noElements = run("check", proseFile);
  assert.equal(noElements.status, 1);
  assert.match(noElements.stdout, /No interface element is declared/);
  const printed = run("record", "--element", "Morph pause toggle");
  assert.equal(printed.status, 0, printed.stderr);
  assert.equal((printed.stdout.match(/^### Task \d/gm) || []).length, 4);
  const usage = run("record");
  assert.equal(usage.status, 2);
  assert.match(usage.stderr, /Usage/);
}
assert.throws(() => main(["check"]), /Usage/);
assert.throws(() => main(["bogus"]), /Usage/);
assert.throws(() => main(["check", "x", "--flag"]), /Unknown argument/);
console.log("PASS: declared elements and their missing items, prose-only elements, fenced and heading boundaries, the four-task three-column record, and the CLI through the canonical path and a discovery link");
