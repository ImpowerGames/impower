import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { interfaceElements, missingItems, reviewability, reviewabilityReport, walkthroughRecord, main, ghIssueCommand, REQUIRED_ITEMS, REQUIRED_TASKS, COLUMNS } from "./interface-exercise.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "impower-interface-exercise-"));
console.log(`Scratch directory: ${scratch}`);

// The four items, four tasks and three columns are restated by the skill and
// the publishing reference; pinning them here keeps the record and the prose
// that describes it saying the same thing.
assert.deepEqual(REQUIRED_ITEMS, ["Location", "Trigger", "States", "Failure view"]);
assert.deepEqual(REQUIRED_TASKS, ["First use", "Everyday repeated use", "Recovering from a mistake", "Undoing or removing what the feature added"]);
assert.deepEqual(COLUMNS, ["What the author sees", "What the author does", "What the tickets leave unspecified"]);

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
const fenced = ["Some prose.", "", "```", "Interface element: Fenced element", "- Location: inside a code fence, as the publishing example shows it", "- Trigger: a click", "- States: on and off", "- Failure view: shown", "```", "", "Interface element: Real element", "- location: lowercase labels count", "- TRIGGER: so does upper case", "* States: any bullet marker", "+ Failure view: shown", ""].join("\n");
const decorated = ["**Interface element:** Bold element", "- **Location:** the top bar", "- **Trigger:** a click", "- **States:** on and off", "- **Failure view:** a message", "", "- Interface element: Listed element", "  - Location: nested under a list item", "  - Trigger: a click", "  - States:", "    - Empty: hidden when the project declares no morph", "    - Loading: none; the toggle needs no data", "    - Error: the toggle returns to off", "    - Success: on, motion frozen at the rest pose", "  - Failure view: the preview status line says why", ""].join("\n");

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
assert.match(reviewabilityReport(gaps), /ask the maintainer for the missing items/);
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
const across = reviewability([{ number: 565, body: complete }, { number: 570, body: partial.replace("Morph pause toggle", "Motion status line") }]);
assert.equal(across.reviewable, false);
assert.deepEqual(across.elements.map((element) => [element.ticket, element.missing.length]), [[565, 0], [570, 2]], "one element short of an item makes the surface not reviewable");
const withFence = interfaceElements(fenced);
assert.deepEqual(withFence.map((element) => [element.name, missingItems(element)]), [["Fenced element", []], ["Real element", []]], "a block written inside a code fence, as the publishing example shows it, is still a declaration; labels match without regard to case and with any bullet marker");
const withDecoration = interfaceElements(decorated);
assert.deepEqual(withDecoration.map((element) => [element.name, missingItems(element)]), [["Bold element", []], ["Listed element", []]], "bold labels, a bulleted element line and nested item bullets all declare");
assert.equal(withDecoration[1].items.States, "Empty: hidden when the project declares no morph Loading: none; the toggle needs no data Error: the toggle returns to off Success: on, motion frozen at the rest pose", "a label whose text sits on nested bullets carries them");
assert.equal(reviewability([{ number: 1, body: "Interface element: X\n- Location: the top bar,\n  continued on the next line\n- Trigger: t\n- States: s\n- Failure view: f\n" }]).elements[0].items.Location, "the top bar, continued on the next line", "a continuation line joins its item");
const bare = ["Interface element: Morph pause toggle", "Location: the preview top bar, right of the scrub controls", "Trigger: a click, or the preview menu's Pause motion item", "States: off (motion plays); on (motion frozen); no empty or loading state", "Failure view: the toggle returns to off and the preview status line says why", ""].join("\n");
assert.deepEqual(reviewability([{ number: 565, body: bare }]).elements[0].missing, [], "labels on bare lines, as the publishing reference allows, declare their items");
const repeated = [complete, "", "## Additional context", "", "<details>", "", "Interface element: Morph pause toggle", "- Location: the preview top bar", "", "</details>", ""].join("\n");
const merged = reviewability([{ number: 565, body: repeated }]);
assert.equal(merged.elements.length, 1, "a name declared twice is one element");
assert.deepEqual(merged.elements[0].missing, [], "an abbreviated repeat of a complete block does not lose its items");
assert.deepEqual(reviewability([{ number: 1, body: "Interface element: X\n- Location: l\n\nInterface element: X\n- Trigger: t\n- States: s\n- Failure view: f\n" }]).elements[0].missing, [], "two partial blocks of one name complete each other");
const acrossTickets = reviewability([{ number: 565, body: complete }, { number: 574, body: "Split from #565.\n\nInterface element: Morph pause toggle\n- Location: the preview top bar\n" }]);
assert.equal(acrossTickets.elements.length, 1, "a name declared in the parent and repeated in a slice is one element");
assert.deepEqual(acrossTickets.elements[0].missing, [], "the slice's abbreviated copy does not undo the parent's complete block");
assert.deepEqual(acrossTickets.elements[0].tickets, [565, 574]);
assert.match(reviewabilityReport(acrossTickets), /^Reviewable: Morph pause toggle \(declared in #565, #574\)/);
const completedAcross = reviewability([{ number: 565, body: partial }, { number: 574, body: "Interface element: Morph pause toggle\n- States: on and off\n- Failure view: a message\n" }]);
assert.deepEqual(completedAcross.elements[0].missing, [], "partial blocks in two tickets complete each other");
assert.deepEqual(reviewability([{ number: 1, body: "Interface element: X\n- Location:\n- Trigger: t\n- States: s\n- Failure view: f\n" }]).elements[0].missing, ["Location"], "an empty item is missing");
assert.deepEqual(reviewability([{ number: 1, body: "Interface element: X\n- Location: l\n## Scope\n- Trigger: t\n- States: s\n- Failure view: f\n" }]).elements[0].missing, ["Trigger", "States", "Failure view"], "a heading ends the element even with no blank line before it");
assert.deepEqual(reviewability([{ number: 1, body: "Interface element: X\n- Location: l\n\nA paragraph.\n- Trigger: t\n- States: s\n- Failure view: f\n" }]).elements[0].missing, ["Trigger", "States", "Failure view"], "a paragraph after a blank line ends the element");
assert.deepEqual(reviewability([{ number: 1, body: "Interface element: X\n- Location: l\n- Trigger: t\n\n- States: s\n- Failure view: f\n" }]).elements[0].missing, [], "a blank line between bullets keeps the element");
assert.deepEqual(reviewability([{ number: 1, body: "Interface element: X\n- Location: l\nInterface element: Y\n- Trigger: t\n" }]).elements.map((element) => element.missing.length), [3, 3], "the next element line starts a new element");

const record = walkthroughRecord("Morph pause toggle");
assert.match(record, /^## Interface walkthrough: Morph pause toggle$/m);
for (const task of REQUIRED_TASKS) assert.ok(record.includes(`: ${task}`), task);
assert.equal((record.match(/^### Task \d/gm) || []).length, 4, "the four required tasks");
assert.equal((record.match(/^\| Step \| What the author sees \| What the author does \| What the tickets leave unspecified \|$/gm) || []).length, 4, "each task carries the three columns");
assert.equal((record.match(/^\| 1 \|  \|  \|  \|$/gm) || []).length, 4, "each task starts with one empty row of the same width");
assert.match(record, /third column is a finding/);

// Live issues are read through an injected fetch here; the command line uses gh.
assert.deepEqual(ghIssueCommand(565), ["api", "repos/ImpowerGames/impower/issues/565"]);
const fetched = [];
const fetchIssue = (number) => { fetched.push(number); return number === 570 ? partial : prose; };
const live = main(["check", "--issue", "565", "--issue", "570"], { fetchIssue });
assert.deepEqual(fetched, [565, 570]);
assert.equal(live.status, 1);
assert.match(live.output, /Not reviewable: Morph pause toggle \(declared in #570\) lacks States, Failure view\./);
assert.equal(main(["check", "--issue", "570", "--element", "morph pause toggle"], { fetchIssue }).output.split("\n").length, 2, "a named element a ticket declares is not listed twice");
assert.throws(() => main(["check", "--issue", "abc"], { fetchIssue }), /--issue takes an issue number, got "abc"/);
assert.throws(() => main(["check", "--issue", "#570"], { fetchIssue }), /--issue takes an issue number, got "#570"/);
assert.throws(() => main(["check", "--issue", "570", "--element"], { fetchIssue }), /--element takes a name/);
assert.throws(() => main(["check", "--issue"], { fetchIssue }), /--issue takes an issue number/);

const ticketFile = path.join(scratch, "ticket.md");
fs.writeFileSync(ticketFile, complete);
const partialFile = path.join(scratch, "partial.md");
fs.writeFileSync(partialFile, partial);
const proseFile = path.join(scratch, "prose.md");
fs.writeFileSync(proseFile, prose);
for (const script of [path.join(here, "interface-exercise.mjs"), path.join(root, ".claude", "skills", "review-feature-experience", "interface-exercise.mjs")]) {
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8", windowsHide: true });
  const check = run("check", proseFile, partialFile);
  assert.equal(check.status, 1, script + "\n" + check.stderr);
  assert.match(check.stdout, /Not reviewable: Morph pause toggle \(declared in partial\.md\) lacks States, Failure view\./);
  const good = run("check", ticketFile);
  assert.equal(good.status, 0, good.stderr);
  assert.match(good.stdout, /Reviewable: Morph pause toggle \(declared in ticket\.md\)/);
  const named = run("check", proseFile, "--element", "preview pause toggle");
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
  assert.match(usage.stderr, /Usage: interface-exercise\.mjs record/);
  const noSource = run("check");
  assert.equal(noSource.status, 2);
  assert.match(noSource.stderr, /Usage: interface-exercise\.mjs check/);
  const badIssue = run("check", "--issue", "#570");
  assert.equal(badIssue.status, 2);
  assert.match(badIssue.stderr, /--issue takes an issue number, got "#570"/);
}
assert.throws(() => main(["check"]), /Usage: interface-exercise\.mjs check/);
assert.throws(() => main(["bogus"]), /Usage: interface-exercise\.mjs <check\|record>/);
assert.throws(() => main(["check", "x", "--flag"]), /Unknown argument --flag/);
console.log("PASS: declared elements in plain, bare-line, fenced, bold, bulleted, sub-bulleted and repeated spellings, within one ticket and across tickets, and their missing items, prose-only elements, heading and paragraph boundaries, the pinned four-task three-column record, live issues through an injected fetch, argument errors that name the value, and the CLI through the canonical path and a discovery link");
