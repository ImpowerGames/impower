// Pins what scripts/check-node-names.mjs recognises and what it deliberately
// does not, so that a change to its patterns or its file filter shows up as a
// failing expectation instead of a quietly narrower scan.
//
//   node --test scripts/check-node-names.test.mjs

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  legalNames,
  nodeNameLiterals,
  optedOutLines,
  ruleNames,
  scannedFiles,
  stripComments,
  stripCommentsAndStrings,
} from "./node-names.mjs";

const names = (src) => nodeNameLiterals(src).map((f) => `${f.line}:${f.name}`);

test("every comparison and lookup shape is recognised", () => {
  assert.deepEqual(names(`if (node.name === "A") {}`), ["1:A"]);
  assert.deepEqual(names(`if (n.type.name !== "B") {}`), ["1:B"]);
  assert.deepEqual(names(`if ("C" === node.name) {}`), ["1:C"]);
  assert.deepEqual(names(`if (nodeName === "D") {}`), ["1:D"]);
  assert.deepEqual(names(`getDescendent("E", parent)`), ["1:E"]);
  assert.deepEqual(names(`getDescendents(["F", "G"], parent)`), ["1:F", "1:G"]);
  assert.deepEqual(
    names(`getDescendentInsideParent(\n  ["H"],\n  "I",\n  stack,\n)`),
    ["2:H", "3:I"],
  );
  assert.deepEqual(names(`findChildByName(parent, "J")`), ["1:J"]);
  assert.deepEqual(names(`node.getChild("K"); node.getChildren("L")`), ["1:K", "1:L"]);
  assert.deepEqual(
    names(`switch (node.name) {\n  case "M":\n    break;\n  case "N":\n    break;\n}`),
    ["2:M", "4:N"],
  );
  assert.deepEqual(names(`switch (nodeName) {\n  case "O":\n    break;\n}`), ["2:O"]);
  assert.deepEqual(names(`["P", "Q"].includes(n.name)`), ["1:P", "1:Q"]);
  assert.deepEqual(names(`getNodesInsideParent(target, "R", stack)`), ["1:R"]);
  assert.deepEqual(names(`getDescendent<SparkdownNodeName>("S", parent)`), ["1:S"]);
  assert.deepEqual(names(`node.getChild("T", "U", "V")`), ["1:T", "1:U", "1:V"]);
  assert.deepEqual(names(`node.getChild("T2", f(1))`), ["1:T2"]);
  assert.deepEqual(names(`if (stack[0]?.name === "W") {}`), ["1:W"]);
  assert.deepEqual(names(`if (n.name === 'X') {}`), ["1:X"]);
});

// A set with no legal member is left alone on purpose: it is either another
// grammar's names or not node names at all, and a set whose every member has
// gone stale at once is the price of not flagging those. Sets built with
// `nodeNameSet` are checked by tsc regardless.
test("a constant set is checked only when it holds node names", () => {
  const legal = new Set(["Scene"]);
  const set = (body) => nodeNameLiterals(`const S = new Set(${body});`, legal).map((f) => f.name);
  assert.deepEqual(set(`["Scene", "NotARule"]`), ["Scene", "NotARule"]);
  assert.deepEqual(set(`["Foo", "Bar"]`), []);
  assert.deepEqual(set(`[")", "]"]`), []);
  assert.deepEqual(set(`["Scene", "end"]`), []);
  assert.deepEqual(nodeNameLiterals(`new Set<SparkdownNodeName>(["Scene", "Nope"])`, legal).map((f) => f.name), ["Scene", "Nope"]);
});

test("a finding names the line the literal sits on, and either comment form opts out", () => {
  const src = `getDescendentInsideParent(\n  ["A",\n   "B"],\n  "C",\n  stack,\n);`;
  assert.deepEqual(names(src), ["2:A", "3:B", "4:C"]);
  assert.deepEqual([...optedOutLines(`x.name === "main" // not a node name\ny.name === "main" /* not a node name */\nz`)], [1, 2]);
});

test("comments, strings and regex literals do not produce or hide names", () => {
  assert.deepEqual(names(`// node.name === "InLineComment"`), []);
  assert.deepEqual(names(`/* node.name === "InBlockComment" */`), []);
  assert.deepEqual(names(`const u = "https://x"; node.name === "AfterUrl";`), ["1:AfterUrl"]);
  assert.deepEqual(
    names(`s.replace(/\\(["'\\\\])/g, "$1");\n// node.name === "InComment"\nn.name === "AfterRegex";`),
    ["3:AfterRegex"],
  );
  assert.deepEqual(names(`return /"/.test(x);\nnode.name === "AfterReturnRegex";`), ["2:AfterReturnRegex"]);
  assert.deepEqual(names(`const d = a / b / c;\n// it's a comment\nx.name === "AfterDivision";`), ["3:AfterDivision"]);
});

test("a brace inside a string does not end a switch early", () => {
  const src = `switch (n.name) {\n  case "One":\n    emit("}");\n    break;\n  case "Two":\n    break;\n}`;
  assert.deepEqual(names(src), ["2:One", "5:Two"]);
});

test("stripping keeps line structure so line numbers survive", () => {
  const src = `a /* x\ny */ b // c\nd`;
  assert.equal(stripComments(src).split("\n").length, 3);
  assert.equal(stripCommentsAndStrings(`a = "x}y"; // c\nb`), `a = "   ";     \nb`);
});

test("the legal set follows the grammar and the shared node ids", () => {
  const legal = legalNames();
  for (const name of ["sparkdown", "Scene", "Scene_begin", "Divert_content", "top", "none", "ERROR_UNRECOGNIZED"]) {
    assert.ok(legal.has(name), `${name} should be legal`);
  }
  for (const name of ["Knot", "Stitch", "Indent", "LuauGenericForLoop", "Scene_c1"]) {
    assert.ok(!legal.has(name), `${name} should not be legal`);
  }
  assert.deepEqual(ruleNames("packages/sparkdown/language/sparkdown.language-grammar.json"), ruleNames("vscode-sparkdown/language/sparkdown.language-grammar.json"));
});

test("the file filter keeps the files the check exists for", () => {
  const files = scannedFiles().map((f) => f.path);
  for (const p of [
    "packages/sparkdown/src/compiler/lower/lowerers/lowerSparkleBody.ts",
    "packages/sparkdown/src/compiler/lower/expression/lowerExpression.ts",
    "packages/sparkdown/src/compiler/classes/SparkdownCompiler.ts",
    "packages/sparkdown-language-server/src/utils/providers/getCompletions.ts",
    "packages/sparkdown-document-views/src/modules/screenplay-preview/utils/screenplayFormatting.ts",
  ]) {
    assert.ok(files.includes(p), `${p} should be scanned`);
  }
  for (const p of files) {
    assert.ok(!p.startsWith("packages/sparkdown/src/inkjs/"), `${p} belongs to the ink engine`);
    assert.ok(!p.startsWith("packages/textmate-grammar-tree/"), `${p} has no sparkdown names`);
  }
  // The typecheck fixture holds names the grammar cannot produce on purpose.
  assert.ok(
    !files.includes("packages/sparkdown-language-server/src/tests/types/nodeNameTyping.typecheck.ts"),
    "the typecheck fixture must not be scanned",
  );
  assert.ok(files.length >= 100, `expected at least 100 scanned files, got ${files.length}`);
});
