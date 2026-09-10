// Holds the skills' Gotchas and Troubleshooting lists to the size they are.
// Run:
//   node .claude/skills/mechanism-counts.test.mjs
//
// Both lists hold what no mechanism can absorb: a behaviour of an app the
// driver does not wrap, a fact about this machine, a judgement call. Every
// other trap belongs in a refusal, a report field, a hook or a check, where a
// session meets it at the moment it matters instead of reading a warning
// beforehand and forgetting it. The leading sentence on each list says so,
// and a sentence is exactly what does not stop the next session from adding
// one more bullet.
//
// So the sizes are written here. Adding an entry fails this check until the
// number below moves, and moving the number is a line in a diff a reviewer
// reads, in the same change that either adds the mechanism the entry is the
// fallback for or says in its pull request why no mechanism is possible.
//
// The counter itself is exercised on fixtures at the end, so a bullet the
// parser stops seeing fails here rather than quietly lowering the count.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// This file sits in the skills directory, so the skills are its siblings and
// the check reads the same set from any working directory.
const SKILLS_DIR = path.dirname(fileURLToPath(import.meta.url));

// The sizes the lists stand at. Raise one only in the change that adds the
// mechanism the new entry falls back from, or whose pull request says why the
// entry can have none.
const PINNED = { gotchas: 22, troubleshooting: 3 };

const WHY =
  "A new Gotchas bullet or Troubleshooting row needs a mechanism first: a driver refusal, a report field, a hook, or a check " +
  "that meets the session at the moment the trap bites, rather than a sentence it reads beforehand. Where one is possible, " +
  "build it and leave the list where it is. Where none is (a behaviour of an app the driver does not wrap, a fact about this " +
  "machine, a judgement call), raise the number in this check in the same change and say in the pull request why no mechanism " +
  "is possible.";

/**
 * The Gotchas bullets and Troubleshooting rows one SKILL.md holds.
 *
 * A section runs from its heading to the next heading of any level. Inside
 * one, a Gotchas entry is a top-level ordered or unordered list item (a
 * nested item continues the entry above it), and a Troubleshooting entry is a table row
 * that is neither the header nor the rule under it. Fenced blocks are code,
 * whatever their lines start with.
 */
export function countEntries(markdown) {
  const lines = markdown.split(/\r?\n/);
  const counts = { gotchas: 0, troubleshooting: 0 };
  let section = null;
  let fence = null;
  let tableRun = 0;
  let listContentIndent = null;
  let previousBlank = true;
  for (const line of lines) {
    const followsBlank = previousBlank;
    previousBlank = line.trim() === "";
    const fenceMark = /^\s*(```+|~~~+)/.exec(line);
    if (fenceMark) {
      if (fence && line.trim().startsWith(fence)) fence = null;
      else if (!fence) fence = fenceMark[1];
      continue;
    }
    if (fence) continue;
    const heading = /^#{1,6}\s+(.*?)\s*$/.exec(line);
    if (heading) {
      const name = heading[1].toLowerCase();
      section = name === "gotchas" ? "gotchas" : name === "troubleshooting" ? "troubleshooting" : null;
      tableRun = 0;
      listContentIndent = null;
      continue;
    }
    if (!section) continue;
    if (section === "gotchas") {
      if (/^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(line)) {
        if (listContentIndent !== null && /^ */.exec(line)[0].length < listContentIndent) listContentIndent = null;
        continue;
      }
      const item = /^( {0,3})([-*+]|\d{1,9}[.)])([ \t]+|$)/.exec(line);
      if (item && (listContentIndent === null || item[1].length < listContentIndent)) {
        counts.gotchas += 1;
        const markerEnd = item[1].length + item[2].length;
        let contentColumn = markerEnd;
        for (const space of item[3]) contentColumn += space === "\t" ? 4 - contentColumn % 4 : 1;
        const padding = contentColumn - markerEnd;
        listContentIndent = markerEnd + (padding >= 1 && padding <= 4 ? padding : 1);
      } else if (!item && line.trim() && listContentIndent !== null && /^ */.exec(line)[0].length < listContentIndent && (followsBlank || /^ {0,3}(?:>|<)/.test(line))) {
        listContentIndent = null;
      }
    }
    if (section === "troubleshooting") {
      if (/^ {0,3}\|/.test(line)) {
        tableRun += 1;
        // The first two lines of a table are its header and the rule under
        // it; every line after them is an entry.
        if (tableRun > 2) counts.troubleshooting += 1;
      } else if (line.trim() === "") {
        // A blank line ends the table; a wrapped cell does not.
        tableRun = 0;
      }
    }
  }
  return counts;
}

function skillFiles() {
  return fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(SKILLS_DIR, e.name, "SKILL.md"))
    .filter((f) => fs.existsSync(f))
    .sort();
}

let failures = 0;
function check(label, fn) {
  try {
    fn();
    console.log(`PASS: ${label}`);
  } catch (err) {
    failures++;
    console.log(`FAIL: ${label}`);
    console.log(`  ${String(err.message || err).split("\n").slice(0, 8).join("\n  ")}`);
  }
}

// ---------------------------------------------------------------- fixtures ---

check("a bullet is an entry, and an indented one, a fenced line and another section's list are not", () => {
  const md = [
    "## Gotchas",
    "",
    "This list holds only what no mechanism can absorb.",
    "",
    "- The first entry.",
    "  - A nested bullet continues it.",
    "- The second entry.",
    "",
    "```bash",
    "- not an entry, a shell comment in a fence",
    "```",
    "",
    "- The third entry.",
    "",
    "## Improving this skill",
    "",
    "- A bullet under another heading is not an entry.",
  ].join("\n");
  assert.deepEqual(countEntries(md), { gotchas: 3, troubleshooting: 0 });
});

check("a troubleshooting entry is a table row, and neither the header nor the rule under it", () => {
  const md = [
    "## Troubleshooting",
    "",
    "| Symptom | Cause → fix |",
    "| ------- | ------------ |",
    "| One     | Do this.     |",
    "| Two     | Do that.     |",
    "",
    "A sentence after the table is not a row.",
    "",
    "| A second table | here |",
    "| -------------- | ---- |",
    "| Three          | Also |",
  ].join("\n");
  assert.deepEqual(countEntries(md), { gotchas: 0, troubleshooting: 3 });
});

check("a file with neither section counts nothing", () => {
  assert.deepEqual(countEntries("# A skill\n\n- a step\n\n## Steps\n\n| a | b |\n| - | - |\n| c | d |\n"), { gotchas: 0, troubleshooting: 0 });
});

check("every Markdown unordered-list marker counts as a Gotchas entry", () => {
  assert.deepEqual(countEntries("## Gotchas\n\n- One.\n* Two.\n+ Three.\n"), { gotchas: 3, troubleshooting: 0 });
});

// -------------------------------------------------------------- the lists ---

check("numbered items and indented tables count, with nested detail and thematic breaks excluded", () => {
  assert.deepEqual(countEntries("## Gotchas\n\n1. One.\n2) Two.\n"), { gotchas: 2, troubleshooting: 0 });
  assert.deepEqual(countEntries("## Gotchas\n\n* * *\n- - -\n___\n"), { gotchas: 0, troubleshooting: 0 });
  const markdown = [
    "## Gotchas", "", "  1. One.", "     - Nested detail.", "  2) Two.", "", "* * *", "- - -", "___", "",
    "## Troubleshooting", "", " | Symptom | Fix |", " | --- | --- |", " | A failure | Its remedy |",
  ].join("\n");
  assert.deepEqual(countEntries(markdown), { gotchas: 2, troubleshooting: 1 });
  assert.deepEqual(countEntries("## Gotchas\n\n  + An indented entry.\n"), { gotchas: 1, troubleshooting: 0 });
});

check("nested thematic breaks preserve their containing entry", () => {
  for (const gap of ["", "\n"]) {
    for (const rule of ["* * *", "- - -", "___"]) {
      const nested = "## Gotchas\n\n- One entry.\n" + gap + "  " + rule + "\n" + gap + "  - Nested detail.\n";
      assert.deepEqual(countEntries(nested), { gotchas: 1, troubleshooting: 0 });
      const separate = "## Gotchas\n\n- One entry.\n\n" + rule + "\n\n  - Another entry.\n";
      assert.deepEqual(countEntries(separate), { gotchas: 2, troubleshooting: 0 });
    }
  }
});

check("a lazy continuation stays in its list while a separate paragraph or block quote ends it", () => {
  assert.deepEqual(countEntries("## Gotchas\n\n- One.\nlazy line.\n  - Nested detail.\n- Two.\n"), { gotchas: 2, troubleshooting: 0 });
  for (const separator of ["\nA paragraph.\n", "> A quote.\n"]) {
    assert.deepEqual(countEntries("## Gotchas\n\n- One.\n" + separator + "  - Another entry.\n"), { gotchas: 2, troubleshooting: 0 });
  }
});

check("the Gotchas and Troubleshooting lists are the size this check pins", () => {
  const files = skillFiles();
  assert.ok(files.length >= 5, `only ${files.length} SKILL.md files were found under ${SKILLS_DIR}; the check is reading the wrong directory`);
  const total = { gotchas: 0, troubleshooting: 0 };
  const rows = [];
  for (const file of files) {
    const counts = countEntries(fs.readFileSync(file, "utf8"));
    total.gotchas += counts.gotchas;
    total.troubleshooting += counts.troubleshooting;
    if (counts.gotchas || counts.troubleshooting) rows.push(`  ${path.basename(path.dirname(file))}: ${counts.gotchas} gotchas, ${counts.troubleshooting} troubleshooting`);
  }
  for (const row of rows) console.log(row);
  // A heading renamed or a list moved reads as zero here, which would make
  // this check pass while pinning nothing.
  assert.ok(total.gotchas > 0, "no Gotchas bullet was found in any skill; the heading or the list shape changed");
  assert.ok(total.troubleshooting > 0, "no Troubleshooting row was found in any skill; the heading or the table shape changed");
  for (const kind of ["gotchas", "troubleshooting"]) {
    assert.ok(
      total[kind] <= PINNED[kind],
      `the ${kind} entries across .claude/skills/*/SKILL.md number ${total[kind]}, above the ${PINNED[kind]} this check pins. ${WHY}`,
    );
  }
  if (total.gotchas < PINNED.gotchas || total.troubleshooting < PINNED.troubleshooting) {
    console.log(`  NOTE: the lists are now ${total.gotchas} gotchas and ${total.troubleshooting} troubleshooting, under the pinned ${PINNED.gotchas} and ${PINNED.troubleshooting}; lower PINNED in this change so the pin keeps its grip.`);
  }
});

console.log(failures === 0 ? "all checks passed" : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
