// Pins what scripts/check-lowerer-conventions.mjs flags and what it lets
// through, so a change to its patterns shows up as a failing expectation.
//
//   node --test scripts/check-lowerer-conventions.test.mjs

import assert from "node:assert/strict";
import { test } from "node:test";
import { compare, lowererFiles, markedLines, scanSource } from "./check-lowerer-conventions.mjs";

const lines = (list) => list.map((f) => `${f.line}:${f.text}`);

test("an auto-generated node name is found on its line", () => {
  const src = `const a = 1;\nconst b = getDescendent("LuauFunctionDefinition_begin_c4", node);\n`;
  assert.deepEqual(lines(scanSource(src).generated), ["2:LuauFunctionDefinition_begin_c4"]);
  assert.deepEqual(lines(scanSource(`x("Rule_end_c12")`).generated), ["1:Rule_end_c12"]);
  assert.deepEqual(scanSource(`x("Rule_end"); y("Rule_content"); // Rule_begin_c1`).generated, []);
  const built = "const name = `LuauRule_begin_c${capture}`;\ngetDescendent(name, node);";
  assert.deepEqual(lines(scanSource(built).generated), ["1:LuauRule_begin_c${capture}"]);
});

test("every scan shape is counted", () => {
  const src = [
    `/^\\w+/.test(text);`,
    `const re = new RegExp("a");`,
    `s.match(x); s.matchAll(x); re.exec(s);`,
    `s.startsWith("a"); s.endsWith("b"); s.indexOf("c"); s.split(",");`,
    `const r = s.replace(/\\s+$/, "");`,
  ].join("\n");
  assert.deepEqual(lines(scanSource(src).scans), [
    "1:.test(",
    "1:/^\\w+/",
    "2:new RegExp(",
    "3:.match(",
    "3:.matchAll(",
    "3:.exec(",
    "4:.startsWith(",
    "4:.endsWith(",
    "4:.indexOf(",
    "4:.split(",
    "5:/\\s+$/",
  ]);
});

test("includes is a scan; a regex-like string is not", () => {
  assert.deepEqual(lines(scanSource(`const a = text.includes("=");`).scans), ["1:.includes("]);
  assert.deepEqual(scanSource(`const hint = "syntax: /word/";`).scans, []);
  assert.deepEqual(lines(scanSource(`const s = "a/b"; const r = /x/;`).scans), ["1:/x/"]);
});

test("division and comments are not scans", () => {
  assert.deepEqual(scanSource(`const x = a / b / c;\n// s.split(",") /re/\n/* s.match(x) */`).scans, []);
});

test("a value-level marker directly above clears the line", () => {
  const unmarked = `const ok = /^\\w+/.test(text);`;
  assert.equal(scanSource(unmarked).scans.length, 2);
  const marked = `// value-level: an identifier already read from its node\n${unmarked}`;
  assert.equal(scanSource(marked).scans.length, 0);
  const block = `// value-level: the string body\n// more explanation\n${unmarked}`;
  assert.equal(scanSource(block).scans.length, 0);
  const separated = `// value-level: the string body\nconst y = 1;\n${unmarked}`;
  assert.equal(scanSource(separated).scans.length, 2);
  assert.deepEqual([...markedLines(`// value-level: x\na\nb`)], [2]);
  const other = `// some other comment\n${unmarked}`;
  assert.equal(scanSource(other).scans.length, 2);
});

test("parent.name checks are found, name building is not", () => {
  const src = [
    `if (parent.name === "A") {}`,
    `if (node.parent?.name !== "B") {}`,
    `SET.has(parent.name);`,
    `switch (n.parent.name) {}`,
    "const c = `${parent.name}_content`;",
    `report({ node: parent.name });`,
  ].join("\n");
  assert.deepEqual(scanSource(src).parentNames.map((f) => f.line), [1, 2, 3, 4]);
});

test("a rise fails, a fall is a note asking to lower the baseline", () => {
  assert.deepEqual(compare({ a: 2 }, { a: 1 }, "scan(s)", true).errors, ["a: 2 scan(s) (baseline 1)"]);
  assert.deepEqual(compare({ b: 1 }, {}, "scan(s)", true).errors, ["b: 1 scan(s) (baseline 0)"]);
  const fall = compare({}, { a: 1 }, "scan(s)", true);
  assert.deepEqual(fall.errors, []);
  assert.match(fall.notes[0], /below the baseline of 1; lower it/);
  const warn = compare({ a: 3 }, { a: 1 }, "check(s)", false);
  assert.deepEqual(warn.errors, []);
  assert.equal(warn.notes.length, 1);
});

test("the lowerer tree is found", () => {
  const files = lowererFiles();
  assert.ok(files.length > 20, `only ${files.length} lowerer files`);
  assert.ok(files.every((f) => f.startsWith("packages/sparkdown/src/compiler/lower/") && f.endsWith(".ts")));
});
