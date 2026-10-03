import { expect, test } from "vitest";
import type { SyntaxNode } from "@lezer/common";
import { readFileSync } from "node:fs";
import { parseSource } from "./grammarSnapshot";
import { luauStatementError } from "../../compiler/utils/luauStatementError";

function find(node: SyntaxNode, from: number): SyntaxNode | undefined {
  if (["LuauInvalidStatement", "LuauAccessPath"].includes(node.name) && node.from <= from && node.to > from) return node;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    const result = find(child, from);
    if (result) return result;
  }
  return undefined;
}

test.each([
  ["Hello", "end", "Incomplete statement: expected assignment or a function call", "Hello"],
  ["Hi, Bob", "end", "Expected '=' when parsing assignment, got 'end'", "end"],
  ["Hello", '"x"\nend', null, ""],
  ["U.S.", "Hi, Bob\nend", "Expected '=' when parsing assignment, got 'end'", "end"],
] as const)("keeps the bounded statement candidate %j's diagnostic", (candidate, after, message, at) => {
  const source = `function f()\n  ${candidate}\n${after}\n`;
  const from = source.indexOf(candidate);
  const node = find(parseSource(source).topNode, from);
  expect(node, source).toBeDefined();
  const found = luauStatementError(node!, from, (a, b) => source.slice(a, b), node!.to);
  if (message === null) expect(found).toBeNull();
  else expect(found).toEqual({ message, from: source.indexOf(at, from), to: source.indexOf(at, from) + at.length });
});

test("statement diagnostics use the converter without a ported parser dependency", () => {
  const source = readFileSync(new URL("../../compiler/utils/luauStatementError.ts", import.meta.url), "utf8");
  expect(source).not.toMatch(/DefinitionParser|\bparseLuau\(/);
});

test("a candidate after Unicode keeps its document UTF-16 offsets", () => {
  const source = 'function f()\n  print("😀"); Hello\nend\n';
  const from = source.indexOf("Hello");
  const node = find(parseSource(source).topNode, from)!;
  expect(node).toBeDefined();
  expect(luauStatementError(node, from, (a, b) => source.slice(a, b), node.to)).toEqual({
    message: "Incomplete statement: expected assignment or a function call",
    from,
    to: from + "Hello".length,
  });
});

test("an error in the next statement is not owned by the candidate", () => {
  const source = 'function f()\n  print(1); print(2)\n  t\n    :m(1)\nend\n';
  const from = source.indexOf("print(1)");
  const node = find(parseSource(source).topNode, from)!;
  expect(node).toBeDefined();
  expect(luauStatementError(node, from, (a, b) => source.slice(a, b), source.indexOf("\n", from))).toBeNull();
});
