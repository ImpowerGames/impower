#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AUDIT_PARTS, AUDIT_THEMES, DOC_BEGIN, DOC_END, FIXTURE, bannedWords, copyFindings, editorShortcutRows, glossaryStrings, parseAuditArgs, playwrightCombo, renderMarkdown, replaceGenerated, tabOrder, titleCaseWords, writeFixture } from "./audit.mjs";
import { auditScan } from "./audit-page.mjs";

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
  assert.deepEqual(all.routes, ["story", "scripts", "assets", "share", "settings"]);
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

let browser = null;
try {
  const { chromium } = await import("playwright");
  browser = await chromium.launch({ headless: true });
} catch (error) {
  console.log(`SKIP: the in-page scan checks need Chromium, which did not launch (${String(error.message).split("\n")[0]})`);
}

if (browser) {
  const page = await browser.newPage({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true });

  await check("the scan's contrast maths matches WCAG 2's published values", async () => {
    await page.setContent('<style>body{background:#fff}p{margin:4px;font-size:14px}</style><p style="color:#000">Black</p><p style="color:#777">Grey</p><div style="background:#202123;padding:4px"><p style="color:#f0efeb">Charcoal ink</p></div>');
    const scan = await page.evaluate(auditScan, { parts: ["contrast"], coarse: false, minTarget: 44 });
    assert.deepEqual(scan.contrast.map((row) => [row.sample, row.ratio, row.needs]), [["Black", 21, 4.5], ["Grey", 4.48, 4.5], ["Charcoal ink", 14, 4.5]]);
  });

  await check("an icon hidden from screen readers is still measured, because it is still seen", async () => {
    await page.setContent('<style>body{background:#fff}button{background:#fff;border:0;color:#fff;width:44px;height:44px}</style><button aria-label="Close"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><path d="M2 2L14 14" stroke="currentColor"/></svg></button>');
    const scan = await page.evaluate(auditScan, { parts: ["contrast"], coarse: false, minTarget: 44 });
    const icon = scan.contrast.find((row) => row.kind === "icon");
    assert.ok(icon && icon.ratio === 1 && icon.needs === 3, JSON.stringify(scan.contrast));
  });

  await check("the keyboard pass keeps sibling stops that share a description", async () => {
    await page.setContent('<nav aria-label="Settings sections"><div role="group" aria-label="Editor"><button>Appearance</button><button>Script editing</button><button>Keyboard shortcuts</button></div></nav><button>Done</button>');
    const { stops } = await tabOrder(page, { limit: 8, deps: { reloadEditorPage: async () => {}, waitForApp: async () => {} } });
    assert.deepEqual(stops.map((s) => s.name), ["Appearance", "Script editing", "Keyboard shortcuts", "Done"]);
    await page.setContent('<div><button aria-label="Fold">+</button><button aria-label="Fold">+</button><button aria-label="Fold">+</button></div><button>Done</button>');
    const same = await tabOrder(page, { limit: 8, deps: { reloadEditorPage: async () => {}, waitForApp: async () => {} } });
    assert.deepEqual(same.stops.map((s) => s.name), ["Fold", "Fold", "Fold", "Done"]);
  });

  await check("two sibling controls are measured apart, so a small one beside a large one fails", async () => {
    await page.setContent('<style>body{margin:8px}button{width:100px;height:44px}button+button{height:20px}</style><nav aria-label="Settings sections"><div role="group" aria-label="Editor"><button>Appearance</button><button>Shortcuts</button></div></nav>');
    const scan = await page.evaluate(auditScan, { parts: ["targets"], coarse: true, minTarget: 44 });
    assert.equal(scan.targets.length, 2);
    assert.deepEqual(scan.targets.map((t) => [t.name, t.ok]), [["Appearance", true], ["Shortcuts", false]]);
    assert.notEqual(scan.targets[0].where, scan.targets[1].where);
  });

  await check("sibling text with different thresholds keeps a row each, so small text cannot hide behind large", async () => {
    await page.setContent('<style>body{background:white;color:#777}span{display:block;font-size:24px}span+span{font-size:12px}</style><div><span>Large heading</span><span>Small caption</span></div>');
    const scan = await page.evaluate(auditScan, { parts: ["contrast"], coarse: false, minTarget: 44 });
    assert.deepEqual(scan.contrast.map((row) => [row.sample, row.needs, row.ratio < row.needs]), [["Large heading", 3, false], ["Small caption", 4.5, true]]);
  });

  await check("a field's value and placeholder are measured as text, apart from its boundary", async () => {
    await page.setContent('<style>body{background:white}input{background:white;color:white;border:2px solid black;width:200px;height:44px}input::placeholder{color:#ddd}</style><input aria-label="Search scripts" value="Invisible search"><input aria-label="Search assets" placeholder="Faint hint">');
    const scan = await page.evaluate(auditScan, { parts: ["contrast"], coarse: false, minTarget: 44 });
    const value = scan.contrast.find((row) => row.kind === "text" && row.sample === "Invisible search");
    const hint = scan.contrast.find((row) => row.kind === "placeholder" && row.sample === "Faint hint");
    assert.ok(value && value.ratio < value.needs, JSON.stringify(scan.contrast));
    assert.ok(hint && hint.ratio < hint.needs, JSON.stringify(scan.contrast));
    assert.ok(scan.contrast.some((row) => row.kind === "control" && row.ratio >= 3));
  });

  await check("the keyboard pass names each stop by its accessible name, aria-labelledby and labels included", async () => {
    await page.setContent('<span id="wrap-name">Wrap lines</span><button role="switch" aria-checked="true" aria-labelledby="wrap-name"></button><label for="paper">Paper size</label><select id="paper"><option>A4</option><option>US Letter</option></select>');
    const { stops } = await tabOrder(page, { limit: 6, deps: { reloadEditorPage: async () => {}, waitForApp: async () => {} } });
    assert.deepEqual(stops.slice(0, 2).map((s) => [s.role, s.name]), [["switch", "Wrap lines"], ["combobox", "Paper size"]]);
  });

  await browser.close();
}

if (failures) {
  console.log(`${failures} check(s) failed`);
  process.exit(1);
}
