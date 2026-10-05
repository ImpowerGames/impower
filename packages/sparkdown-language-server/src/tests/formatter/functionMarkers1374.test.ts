import { expect, test } from "vitest";
import { formatSource } from "./formatSource";
import { parseSource } from "@impower/sparkdown/src/tests/compiler/grammarSnapshot";
import { readLuauUnits } from "@impower/sparkdown/src/compiler/typecheck/readLuauAst";
import { AstStatFunction, AstExprCall, visitAst } from "@impower/sparkdown/src/compiler/typecheck/Ast";

test("formatting retains invalid function markers and valid type intersections", () => {
  const source = "function f()\n  type F = number\n    & string\n  & g()\n  h()\nend\n";
  const formatted = formatSource(source);
  expect(formatted).toContain("& g()");
  expect(formatted).toContain("& string");
  expect((formatted.match(/[&]/g) ?? []).length).toBe(2);
  expect(formatted).toContain("h()");
  expect(formatSource(formatted)).toBe(formatted);
});

test("formatting preserves recovery and indentation after invalid function markers", () => {
  const source = "function run()\n  local t = { 1, 2, 3 }\n  & host_record(42)\n  & table.insert(t, 99)\n  & local x = 5\n  host_record(table.concat(t, \",\"))\nend\n";
  const formatted = formatSource(source);
  expect((formatted.match(/[&]/g) ?? []).length).toBe(3);
  const root = readLuauUnits(parseSource(formatted), formatted).prelude.root;
  expect(root.body.length).toBe(1);
  expect(root.body[0] instanceof AstStatFunction).toBe(true);
  const calls: number[] = [];
  visitAst((root.body[0] as AstStatFunction).func.body, { visit(node) {
    if (node instanceof AstExprCall) calls.push(node.args.length);
    return true;
  } });
  expect(calls).toEqual([1, 2, 1, 2]);
  for (const line of formatted.trimEnd().split("\n").slice(1, -1)) expect(line.startsWith("  ")).toBe(true);
  expect(formatSource(formatted)).toBe(formatted);
});

test("formatting retains code after marked level-four comments", () => {
  const source = "& local x: number --[====[ok]====]print(1)\n& local y = 1 --[====[ok]====]print(2)\n";
  const formatted = formatSource(source);
  expect(formatted.match(/\]====\]/g)).toHaveLength(2);
  const reading = readLuauUnits(parseSource(formatted), formatted).prelude;
  expect(reading.errors).toEqual([]);
  const calls: number[] = [];
  visitAst(reading.root, { visit(node) {
    if (node instanceof AstExprCall) calls.push(node.args.length);
    return true;
  } });
  expect(calls).toEqual([1, 1]);
  expect(formatSource(formatted)).toBe(formatted);
});
