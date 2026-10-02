#!/usr/bin/env node
// Checks the lowerers under packages/sparkdown/src/compiler/lower/ for code
// that re-derives structure the grammar should name (GRAMMAR.md §5.1, §6.4).
//
//   - Error: any reference to an auto-generated `_begin_cN` / `_end_cN` node
//     name. Those names change whenever the grammar is regenerated.
//   - Ratchet: every regex literal, `new RegExp`, `.match(` / `.matchAll(` /
//     `.exec(` / `.test(`, and `.startsWith(` / `.endsWith(` / `.indexOf(` / `.includes(` /
//     `.split(` call is a scan finding unless the `//` comment block directly
//     above its line carries a `// value-level:` marker saying which
//     already-isolated value it interprets. Unmarked findings are counted per
//     file against scripts/lowerer-conventions-baseline.json; a file whose
//     count rises fails, a file whose count falls is asked to lower the
//     baseline (a note, not a failure, so sibling fixes do not collide).
//   - Warning: `parent.name` / `parent?.name` checks, counted against the
//     same baseline but never failing.
//
// The scan is textual: comments are ignored, string contents are not. Whether
// a marked scan really is value-level stays a review judgment.
//
// Usage:
//   node scripts/check-lowerer-conventions.mjs                  check
//   node scripts/check-lowerer-conventions.mjs --write-baseline rewrite the baseline from the tree
//   node --test scripts/check-lowerer-conventions.test.mjs      test the scanner itself

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments, stripCommentsAndStrings } from "./node-names.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const LOWER_DIR = "packages/sparkdown/src/compiler/lower";
export const BASELINE = "scripts/lowerer-conventions-baseline.json";
export const MARKER = "// value-level:";

// A literal capture number, one interpolated into a template literal, or a
// string ending at `_c` that a concatenation completes.
const GENERATED_NAME = /\b\w*_(?:begin|end)_c(?:\d+\b|\$\{[^}]*\}|(?=["'`]))/g;
const SCAN_CALL =
  /\.(?:match|matchAll|exec|test|startsWith|endsWith|indexOf|includes|split)\s*\(|\bnew\s+RegExp\s*\(/g;
// A regex literal: a `/` after a token that cannot end an expression.
const REGEX_LITERAL =
  /(?:^|[(,=:[!&|?{};>]|\breturn|\bcase|\btypeof)\s*(\/(?![/*])(?:[^/\\\n[]|\\.|\[(?:[^\]\\\n]|\\.)*\])+\/[dgimsuyv]*)/gm;
// A check on a parent's name: compared, looked up in a set or list, or
// switched on. Building a name from it (`${parent.name}_content`) is not one.
const PARENT_NAME =
  /\bparent\??\.name\s*[!=]==?|[!=]==?\s*[\w.?]*\bparent\??\.name\b|\.(?:has|includes)\(\s*[\w.?]*\bparent\??\.name\s*\)|\bswitch\s*\(\s*[\w.?]*\bparent\??\.name\b/g;

function lineAt(src, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (src[i] === "\n") line += 1;
  return line;
}

// Line numbers (1-based) whose contiguous `//` comment block directly above
// holds the marker.
export function markedLines(source) {
  const lines = source.split("\n");
  const marked = new Set();
  for (let i = 0; i < lines.length; i += 1) {
    for (let j = i - 1; j >= 0 && lines[j].trim().startsWith("//"); j -= 1) {
      if (lines[j].trim().startsWith(MARKER)) {
        marked.add(i + 1);
        break;
      }
    }
  }
  return marked;
}

// Findings in one file's source: { generated, scans, parentNames }, each a
// list of { line, text }. `scans` leaves out marked lines.
export function scanSource(source) {
  const src = stripComments(source);
  const marked = markedLines(source);
  const collect = (re, group = 0) =>
    [...src.matchAll(re)].map((m) => ({
      line: lineAt(src, m.index + m[0].indexOf(m[group])),
      text: m[group].trim(),
    }));
  // Calls and regex literals are found in a copy whose string bodies are
  // blanked (same length), so `/word/` or `.includes(` inside a string is not
  // taken for a scan; the text reported comes from the unblanked source.
  const blanked = stripCommentsAndStrings(source);
  const executable = (re, group = 0) =>
    [...blanked.matchAll(re)].map((m) => {
      const at = m.index + m[0].indexOf(m[group]);
      return { line: lineAt(src, at), text: src.slice(at, at + m[group].length).trim() };
    });
  const scans = [...executable(SCAN_CALL), ...executable(REGEX_LITERAL, 1)]
    .filter((f) => !marked.has(f.line))
    .sort((a, b) => a.line - b.line);
  return {
    generated: collect(GENERATED_NAME),
    scans,
    parentNames: collect(PARENT_NAME),
  };
}

export function lowererFiles(root = ROOT) {
  return readdirSync(path.join(root, LOWER_DIR), { recursive: true })
    .map((f) => String(f).split(path.sep).join("/"))
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .sort()
    .map((f) => `${LOWER_DIR}/${f}`);
}

// Compares per-file counts with a baseline. Returns { errors, notes }.
export function compare(counts, baseline, kind, failOnRise) {
  const errors = [];
  const notes = [];
  const files = new Set([...Object.keys(counts), ...Object.keys(baseline)]);
  for (const file of [...files].sort()) {
    const now = counts[file] ?? 0;
    const then = baseline[file] ?? 0;
    if (now > then) {
      (failOnRise ? errors : notes).push(`${file}: ${now} ${kind} (baseline ${then})`);
    } else if (now < then) {
      notes.push(`${file}: ${now} ${kind}, below the baseline of ${then}; lower it in ${BASELINE}`);
    }
  }
  return { errors, notes };
}

const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

function main() {
  const files = lowererFiles();
  if (files.length === 0) {
    console.log(`No lowerer files under ${LOWER_DIR}; a check that checks nothing must not pass.`);
    process.exitCode = 1;
    return;
  }
  const scans = {};
  const parentNames = {};
  const generated = [];
  const detail = {};
  for (const file of files) {
    const found = scanSource(readFileSync(path.join(ROOT, file), "utf8"));
    for (const g of found.generated) {
      generated.push(`${file}:${g.line}: "${g.text}" is an auto-generated node name (GRAMMAR.md §6.4)`);
    }
    if (found.scans.length) scans[file] = found.scans.length;
    if (found.parentNames.length) parentNames[file] = found.parentNames.length;
    detail[file] = found.scans;
  }

  if (process.argv.includes("--write-baseline")) {
    writeFileSync(path.join(ROOT, BASELINE), JSON.stringify({ scans, parentNames }, null, 2) + "\n");
    console.log(
      `Wrote ${BASELINE}: ${sum(scans)} scan(s) in ${Object.keys(scans).length} file(s),` +
        ` ${sum(parentNames)} parent.name check(s) in ${Object.keys(parentNames).length} file(s).`,
    );
    return;
  }

  const baseline = JSON.parse(readFileSync(path.join(ROOT, BASELINE), "utf8"));
  const scan = compare(scans, baseline.scans ?? {}, "unmarked scan(s)", true);
  const parent = compare(parentNames, baseline.parentNames ?? {}, "parent.name check(s)", false);

  for (const e of generated) console.log(`error: ${e}`);
  for (const e of scan.errors) {
    console.log(`error: ${e}`);
    const file = e.slice(0, e.indexOf(": "));
    for (const d of detail[file] ?? []) console.log(`  ${file}:${d.line}: ${d.text}`);
  }
  for (const n of [...scan.notes, ...parent.errors, ...parent.notes]) console.log(`note: ${n}`);
  console.log(
    `\n${files.length} lowerer file(s); ${generated.length} generated-name reference(s);` +
      ` ${sum(scans)} unmarked scan(s) in ${Object.keys(scans).length} file(s);` +
      ` ${sum(parentNames)} parent.name check(s) in ${Object.keys(parentNames).length} file(s)`,
  );
  if (scan.errors.length) {
    console.log(
      `A regex or string scan in a lowerer usually re-derives structure the grammar should` +
        ` name (GRAMMAR.md §5.1). Read the node instead or, if the call interprets an` +
        ` already-isolated value, put \`${MARKER} <which value>\` on the line above it.`,
    );
  }
  if (generated.length || scan.errors.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
