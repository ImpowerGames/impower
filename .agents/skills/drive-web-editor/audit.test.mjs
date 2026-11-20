#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AUDIT_PARTS, AUDIT_THEMES, DOC_BEGIN, DOC_END, FIXTURE, bannedWords, contrastFailures, contrastRatio, copyFindings, editorShortcutRows, glossaryStrings, parseAuditArgs, playwrightCombo, renderMarkdown, replaceGenerated, titleCaseWords, writeFixture } from "./audit.mjs";

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

await check("arguments default to every part, theme and route, and --out is required", () => {
  assert.throws(() => parseAuditArgs([]), /--out/);
  const all = parseAuditArgs(["--out", "x"]);
  assert.deepEqual(all.parts, AUDIT_PARTS);
  assert.equal(all.themes.length, 8);
  assert.deepEqual(all.routes, ["write", "scripts", "collection", "share", "project"]);
  const some = parseAuditArgs(["--out", "x", "--parts", "contrast,copy", "--themes", "chalk", "--routes", "scripts"]);
  assert.deepEqual([some.parts, some.themes, some.routes], [["contrast", "copy"], ["chalk"], ["scripts"]]);
  assert.throws(() => parseAuditArgs(["--out", "x", "--themes", "auto"]), /--themes takes/);
  assert.throws(() => parseAuditArgs(["--out", "x", "--parts", "everything"]), /--parts takes/);
  assert.throws(() => parseAuditArgs(["--out", "x", "--nope"]), /unknown audit argument --nope/);
});

await check("the eight themes are the ones the editor offers, with Charcoal and Chalk held to the bar", () => {
  assert.deepEqual(AUDIT_THEMES.map((t) => t.id), ["charcoal", "chalk", "ink", "paper", "graphite", "warm", "midnight", "dusk"]);
  assert.deepEqual(AUDIT_THEMES.filter((t) => t.bar).map((t) => t.id), ["charcoal", "chalk"]);
});

await check("contrast ratios match WCAG 2's published extremes and the design reference", () => {
  assert.equal(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }), 21);
  assert.equal(contrastRatio({ r: 119, g: 119, b: 119 }, { r: 255, g: 255, b: 255 }).toFixed(2), "4.48");
  assert.equal(contrastRatio({ r: 0xf0, g: 0xef, b: 0xeb }, { r: 0x20, g: 0x21, b: 0x23 }).toFixed(2), "14.00");
});

await check("a failure is a measured pair under its threshold, with the script's colours counted apart", () => {
  const rows = [
    { ratio: 4.4, needs: 4.5 },
    { ratio: 4.5, needs: 4.5 },
    { ratio: 2.9, needs: 3 },
    { ratio: 1, needs: 3, unresolved: "no boundary is drawn" },
    { ratio: 2, needs: 4.5, script: true },
  ];
  assert.deepEqual(contrastFailures(rows).map((r) => r.ratio), [4.4, 2.9]);
  assert.deepEqual(contrastFailures(rows, { script: true }).map((r) => r.ratio), [4.4, 2.9, 2]);
});

await check("old words are caught as words, not inside other words", () => {
  const hits = bannedWords([{ text: "Copy the URL" }, { text: "Cleared the cache" }, { text: "Logic" }, { text: "Untitled Game" }, { text: "curly" }, { text: "Logical order" }]);
  assert.deepEqual(hits.map((h) => h.word), ["URL", "cache", "Logic", "Untitled Game"]);
});

await check("sentence case flags a capital inside a phrase, but not names, keys or a new sentence", () => {
  assert.deepEqual(titleCaseWords("Browse Scripts Now"), ["Now"]);
  assert.deepEqual(titleCaseWords("Viewing mode: Visual Novel"), ["Novel"]);
  assert.deepEqual(titleCaseWords("Go to line (Ctrl+G)"), []);
  assert.deepEqual(titleCaseWords("Saved locally. Open settings"), []);
  assert.deepEqual(titleCaseWords("Story, Assets and Share"), []);
  assert.deepEqual(titleCaseWords("Entry script · Modified just now"), []);
});

await check("glossary strings come from the first column's code spans, and a case difference is reported", () => {
  const glossary = glossaryStrings(["| String | Role |", "| --- | --- |", "| `Saved locally` | heading |", "| `Back to story` | button |", "| `{count} files` | caption |", "not a table `Ignored`"].join("\n"));
  assert.deepEqual([...glossary], ["Saved locally", "Back to story"]);
  const found = copyFindings([{ text: "Saved locally", source: "text", role: null }, { text: "Back To Story", source: "text", role: "button" }, { text: "What does Mara do?", source: "text", role: "button" }], glossary);
  assert.deepEqual(found.caseMismatch.map((m) => [m.text, m.wanted]), [["Back To Story", "Back to story"]]);
  assert.equal(found.titleCase.length, 0);
  assert.deepEqual(found.glossary, { strings: 2, seenAsWritten: 1 });
});

await check("key combos use Playwright's names on Windows bindings", () => {
  assert.equal(playwrightCombo("Mod+Shift+K"), "Control+Shift+K");
  assert.equal(playwrightCombo("Alt+Up"), "Alt+ArrowUp");
  assert.equal(playwrightCombo("Mod+Shift+["), "Control+Shift+[");
  assert.equal(playwrightCombo("F8"), "F8");
});

await check("the editor rows load from the keymap table with their Windows keys", async () => {
  const rows = await editorShortcutRows();
  const byId = Object.fromEntries(rows.map((r) => [r.id, r.keys]));
  assert.equal(byId.undo, "Mod+Z");
  assert.equal(byId.redo, "Mod+Y");
  assert.ok(rows.length > 30, `${rows.length} rows`);
  assert.ok(rows.every((r) => r.name && r.keys));
});

await check("the fixture writes a project with main.sd at its root", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-fixture-"));
  try {
    writeFixture(dir);
    for (const rel of Object.keys(FIXTURE)) assert.ok(fs.existsSync(path.join(dir, rel)), rel);
    assert.match(fs.readFileSync(path.join(dir, "main.sd"), "utf8"), /^store gold = 10/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

await check("the generated block is replaced between its markers and nothing else changes", () => {
  const doc = `# Audit\n\nHand-written.\n\n${DOC_BEGIN}\nold\n${DOC_END}\n\nAfter.\n`;
  assert.equal(replaceGenerated(doc, "new\n"), `# Audit\n\nHand-written.\n\n${DOC_BEGIN}\nnew\n${DOC_END}\n\nAfter.\n`);
  assert.throws(() => replaceGenerated("# none", "x"), /audit:begin/);
});

await check("the markdown names the date and commit and marks failing token pairs", () => {
  const md = renderMarkdown({
    date: "2026-11-19",
    commit: "abc1234567",
    browser: "149",
    tokens: { themes: [{ id: "charcoal", name: "Charcoal" }], values: { charcoal: Array.from({ length: 24 }, (_, i) => (i === 0 ? 4.2 : 9)) } },
  });
  assert.match(md, /on 2026-11-19 \(UTC\) at commit `abc1234567`/);
  assert.match(md, /\| `--ink` \| `--bg` \| \*\*4\.20\*\* \|/);
});

if (failures) {
  console.log(`${failures} check(s) failed`);
  process.exit(1);
}
