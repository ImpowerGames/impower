import "../../inkjs/engine/Container";
import { describe, expect, test } from "vitest";
import { readLuauUnits } from "../../compiler/typecheck/readLuauAst";
import { parseSource, dumpTree, stripAnsi } from "./grammarSnapshot";
import { compareEnginesFull, formatDivergences } from "./scopeEquality";
import { loadOfficialLuau } from "./officialLuau";
import { printOfficialAst } from "./printOfficialAst";
import { collectDiagnostics, makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";
import { AstExprCall, AstExprFunction, AstExprGlobal, AstStatFunction, visitAst } from "../../compiler/typecheck/Ast";

const intersections = [
  "function f()\n  type F = number\n    & string\nend\n",
  "function f()\n  if true then\n    type F = { x: number }\n      & { y: string }\n  end\nend\n",
  "function f()\n  local g = function()\n    type F = number\n      & string\n  end\nend\n",
  "function f()\n  local x: { x: number }\n    & { y: string } = { x = 1, y = 'ok' }\nend\n",
  "function f()\n  local function g(): { x: number }\n    & { y: string }\n    return { x = 1, y = 'ok' }\n  end\nend\n",
  "function f(x: { x: number }\n  & { y: string }) return x end\n",
  "function f()\n  type F = number\n  -- comment between parts\n    & string\nend\n",
  "function object:method()\n  type F = { x: number }\n    & { y: string }\nend\n",
  "type function f()\n  type F = { x: number }\n    & { y: string }\n  return types.number\nend\n",
  "function f()\ntype F = number\n& string\nend\n",
  "function f()\n  type F = number\n    & typeof(value())\nend\n",
  "function f()\n  local function nested()\n    type F = number\n      & types.Foo<string>\n  end\nend\n",
  "function f()\n  type F = number\n    & (number | string)\nend\n",
  "function f()\n  type F = number\n    & ((number) -> string)\nend\n",
];

describe("function Luau and physical story lines (#1374)", () => {
  test.each(intersections)("keeps a leading intersection in %s", async (input) => {
    for (const newline of ["\n", "\r\n"]) {
    const source = input.replace(/\n/g, newline);
    const official = await loadOfficialLuau("typecheck");
    const reading = readLuauUnits(parseSource(source), source).prelude;
    expect(official(source).errors).toBe(0);
    expect(reading.errors).toEqual([]);
    const normalized = (root: unknown) => JSON.parse(JSON.stringify(root, (_key, value) => {
      if (value?.type === "AstExprFunction" && !value.vararg) {
        const { varargLocation: _unused, ...fields } = value;
        return fields;
      }
      return value;
    })).body;
    expect(normalized(printOfficialAst(reading.root))).toEqual(normalized(official(source).root));
    expect(stripAnsi(dumpTree(source))).not.toContain("LuauExplicitStatementMark");
    expect(stripAnsi(dumpTree(source))).not.toContain("ERROR_INCOMPLETE");
    const equality = await compareEnginesFull(source);
    expect(equality.divergences, formatDivergences(source, equality.divergences)).toEqual([]);
    }
  });

  test("define shorthand methods retain intersections and reject statement markers", async () => {
    for (const newline of ["\n", "\r\n"]) {
      const source = ["define Hero with", "  method()", "    type F = number", "      & string", "    return 1", "  end", "end", "Following."].join(newline);
      expect(stripAnsi(dumpTree(source))).not.toContain("LuauExplicitStatementMark");
      expect(stripAnsi(dumpTree(source))).not.toContain("ERROR_INCOMPLETE");
      expect(collectDiagnostics(source).errorMessages).toEqual([]);
      expect((await compareEnginesFull(source)).divergences).toEqual([]);
      const invalid = source.replace("    type F = number" + newline + "      & string", "    & g()");
      expect(collectDiagnostics(invalid).errorMessages.length).toBeGreaterThan(0);
      expect(stripAnsi(dumpTree(invalid))).not.toContain("LuauExplicitStatementMark");
    }
  });

  test("recovery retains following calls inside the function", () => {
    const source = "function f()\n  & g()\n  h()\n  return 7\nend\nfunction after() return 8 end\n";
    const reading = readLuauUnits(parseSource(source), source).prelude;
    expect(reading.errors.length).toBeGreaterThan(0);
    expect(reading.root.body.every(stat => stat instanceof AstStatFunction)).toBe(true);
    expect(reading.root.body.length).toBe(2);
    const first = reading.root.body[0] as AstStatFunction;
    const calls: string[] = [];
    visitAst(first.func.body, { visit(node) {
      if (node instanceof AstExprCall && node.func instanceof AstExprGlobal) calls.push(node.func.name);
      return true;
    } });
    expect(calls).toEqual(["g", "h"]);
    expect(first.func.body.body.at(-1)?.kind).toBe("StatReturn");
  });

  test.each(["if true then", "do"])("bounded child function %s rejects an inner marker without hoisting calls", async block => {
    for (const newline of ["\n", "\r\n"]) {
      const line = `& local f = function() ${block} & g() h() end return 7 end`;
      const source = `${line}${newline}Following story.${newline}`;
      const reading = readLuauUnits(parseSource(source), source).prelude;
      expect(reading.errors.length).toBeGreaterThan(0);
      expect(collectDiagnostics(source).errorMessages.length).toBeGreaterThan(0);
      const functions: AstExprFunction[] = [];
      visitAst(reading.root, { visit(node) {
        if (node instanceof AstExprFunction) functions.push(node);
        return true;
      } });
      expect(functions.length).toBe(1);
      const calls: string[] = [];
      visitAst(functions[0]!.body, { visit(node) {
        if (node instanceof AstExprCall && node.func instanceof AstExprGlobal) calls.push(node.func.name);
        return true;
      } });
      expect(calls).toEqual(["g", "h"]);
      expect(functions[0]!.body.body.at(-1)?.kind).toBe("StatReturn");
      // This invalid adjacent-call space already differs on the base grammar.
      // Pin its exact stacks so no new divergence can hide behind that defect.
      expect((await compareEnginesFull(source)).divergences).toEqual([{
        offset: line.indexOf(" h()"), char: " ", lineCol: `1:${line.indexOf(" h()")}`,
        vscode: ["text.source.sparkdown", "meta.function.luau", "meta.function.body.luau"],
        tree: ["text.source.sparkdown", "meta.function.luau", "meta.function.body.luau", "punctuation.whitespace.extra.sd"],
      }]);
      expect(stripAnsi(dumpTree(source))).toContain("ImplicitAction");
    }
  });

  test.each(["", "\n", "\r\n"])("distinguishes empty closed literals from physical stops with %j", async newline => {
    for (const literal of ['""', "''", "[[]]", "[==[]==]", "``"]) {
      const source = `& local x = ${literal}${newline}`;
      expect(collectDiagnostics(source).errorMessages).toEqual([]);
      expect((await compareEnginesFull(source)).divergences).toEqual([]);
    }
    expect(collectDiagnostics(`& local x = 1 --[[]]${newline}`).errorMessages).toEqual([]);
    for (const opener of ['"', "'", "[[", "[==[", "`", "1 --[["]) {
      const source = `& local x = ${opener}${newline}`;
      expect(collectDiagnostics(source).errorMessages.length).toBeGreaterThan(0);
      expect((await compareEnginesFull(source)).divergences).toEqual([]);
    }
  });

  test("canonical function opacity keeps multiline literals and comments", () => {
    const source = "function f()\n  --[[a\n  comment]]\n  return [[a\n  string]]\nend\n";
    expect(readLuauUnits(parseSource(source), source).prelude.errors).toEqual([]);
    expect(collectDiagnostics(source).errorMessages).toEqual([]);
  });

  test.each([
    "function f()\n  & g()\nend\n",
    "function f()\n  if false then\n    & g()\n  end\nend\n",
    "function f()\n  local g = function()\n    & x = 1\n  end\nend\n",
    "function f() & g() end\n",
    "function object:method()\n  & g()\n  g()\nend\n",
    "type function f()\n  & g()\n  return types.number\nend\n",
  ])("diagnoses the removed marker in %s", (source) => {
    const parsed = readLuauUnits(parseSource(source), source);
    expect(parsed.prelude.errors.length).toBeGreaterThan(0);
    expect(collectDiagnostics(source).errorMessages.length).toBeGreaterThan(0);
    expect(stripAnsi(dumpTree(source))).not.toContain("LuauExplicitStatementMark");
    expect(stripAnsi(dumpTree(source))).not.toContain("ERROR_INCOMPLETE");
  });

  test.each([
    "& f(", "& x = {", "& x = if true then", "& f(function()", "& function f()",
    "& local function f()", "& do local f = function()", "& local x = function(a:",
    "& x = [[", "& x = [==[", "& f --[[", '& x = "', "& x = `",
    "& function f() --[==[", "& type function f()",
    "& do & function f()", "& return 5 --[[",
  ])("ends %s before following prose", async (line) => {
    for (const newline of ["\n", "\r\n"]) {
      const source = `${line}${newline}Following story.${newline}`;
      const tree = parseSource(source);
      let markedEnd = -1;
      let storyFrom = -1;
      const cursor = tree.cursor();
      do {
        if (cursor.name === "LuauSparkdownExplicitStatement") markedEnd = cursor.to;
        if (cursor.name === "ImplicitAction") storyFrom = cursor.from;
      } while (cursor.next());
      expect(markedEnd).toBe(line.length);
      expect(storyFrom).toBe(line.length + newline.length);
      expect(readLuauUnits(tree, source).prelude.errors.length).toBeGreaterThan(0);
      const equality = await compareEnginesFull(source);
      expect(equality.divergences, formatDivergences(source, equality.divergences)).toEqual([]);
    }
  });

  test.each(["\n", "\r\n"])("retains the story marker after an unmarked type alias with %j", (newline) => {
    const source = `type F = number${newline}& bump()${newline}Following story.${newline}`;
    expect(stripAnsi(dumpTree(source))).toContain("LuauExplicitStatementMark");
    expect(readLuauUnits(parseSource(source), source).prelude.errors).toEqual([]);
  });

  test("ordinary function statements and story markers execute in order", () => {
    const source = "store count = 0\n& bump()\nFirst {count}.\n& count += 1\nSecond {count}.\nfunction bump()\n  if false then\n    count += 100\n  end\n  local g = function() count += 2 end\n  g()\n  count += 3\nend\n";
    const runtime = makeRuntimeStoryFromSource(source);
    expect(runtime.errorMessages).toEqual([]);
    expect(runtime.story.ContinueMaximally()).toBe("First 5.\nSecond 6.\n");
  });

  test.each([
    ["& do local f = function(x) return x + 1 end; count = f(4) end", "Value 5.\n"],
    ["& do local f = function<T>(x: T): T return x end; count = f(5) end", "Value 5.\n"],
    ["& do local f = function(x) local function g(y) return x + y end return g(2) end; count = f(3) end", "Value 5.\n"],
    ["& do local f = function(x) return x end; count = f\"five\" end", "Value five.\n"],
    ["& do local f = function(x) return x end; count = f(`five`) end", "Value five.\n"],
    ["& count = `five {2 + 3}`", "Value five 5.\n"],
    ["& count = [[five]] --[[same line]]", "Value five.\n"],
  ])("complete same-line children preserve runtime values: %s", async (line, expected) => {
    const source = `store count = 0\n${line}\nValue {count}.\n`;
    const runtime = makeRuntimeStoryFromSource(source);
    expect(runtime.errorMessages).toEqual([]);
    expect(runtime.story.ContinueMaximally()).toBe(expected);
    expect((await compareEnginesFull(source)).divergences).toEqual([]);
  });
});
