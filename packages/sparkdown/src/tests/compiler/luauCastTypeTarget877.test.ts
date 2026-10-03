import "../../inkjs/engine/Container";
import { beforeAll, describe, expect, test } from "vitest";
import { printAst } from "../../compiler/typecheck/printAst";
import { readLuauUnits } from "../../compiler/typecheck/readLuauAst";
import { dumpTree, parseSource, stripAnsi } from "./grammarSnapshot";
import { compareEnginesFull, formatDivergences, treeScopeStackAt } from "./scopeEquality";
import { tokenize } from "./vscodeGrammarSnapshot";
import { loadOfficialLuau } from "./officialLuau";
import { printOfficialAst } from "./printOfficialAst";
let official: Awaited<ReturnType<typeof loadOfficialLuau>>;
beforeAll(async () => { official = await loadOfficialLuau(); });

function expectLuauReading(body: string): void {
  const source = `function run()\n  ${body}\nend\n`;
  expect(official(source).diagnostics).toEqual([]);
  expect(official(source).errors).toBe(0);
  const units = readLuauUnits(parseSource(source), source);
  expect(units.prelude.errors).toEqual([]);
  // The document block stops at its last statement; upstream includes EOF
  // trivia. Compare every statement, including all nested source locations.
  const normalize = (root: unknown) => JSON.parse(JSON.stringify(root, (_key, value) => {
    if (value?.type === "AstExprFunction" && !value.vararg) {
      const { varargLocation: _absent, ...fields } = value;
      return fields;
    }
    return value;
  })).body;
  expect(normalize(printOfficialAst(units.prelude.root))).toEqual(normalize(official(source).root));
  expect(stripAnsi(dumpTree(source)).split("\n").filter((line) => line.includes("ERROR_INCOMPLETE"))).toEqual([]);
}

describe("casts read their targets as types (#877)", () => {
  const trivia = [" --[[c]] ", " --[====[long\ncomment]====] ", " -- line\n    ", ` --[${"=".repeat(20)}[long\ncomment]${"=".repeat(20)}] `];
  test.each(trivia)("keeps named generic arguments across %s", async (comment) => {
    const body = `return a :: Array${comment}<number>`;
    expectLuauReading(body);
    const source = `function run()\n  ${body}\nend\n`;
    const result = await compareEnginesFull(source);
    expect(result.divergences, formatDivergences(source, result.divergences)).toEqual([]);
    expect(treeScopeStackAt(parseSource(source), source.lastIndexOf("<"))).not.toContain("keyword.operator.comparison.luau");
  });
  test.each(["(number)", "{number}", "typeof(a)", "Array<number>", "number?", "true", '"literal"']
    .flatMap((target) => trivia.flatMap((comment) => ["b", "55"].map((value) => [target, comment, value]))))
    ("keeps comparison after %s with trivia %s before %s", async (target, comment, value) => {
      const source = `function run()\n  return a :: ${target}${comment}< ${value}\nend\n`;
      expectLuauReading(`return a :: ${target}${comment}< ${value}`);
      const result = await compareEnginesFull(source);
      expect(result.divergences, formatDivergences(source, result.divergences)).toEqual([]);
      expect(treeScopeStackAt(parseSource(source), source.lastIndexOf("<"))).toContain("keyword.operator.comparison.luau");
      const lines = await tokenize(source);
      const line = [...lines].reverse().find((line) => line.lineText.includes("<"))!;
      expect(line.tokens.find((token) => token.startIndex === line.lineText.lastIndexOf("<"))?.scopes).toContain("keyword.operator.comparison.luau");
    });
  test.each(["Array<number> < b", "Array<Array<number>> < 55", "types.Array<number> < b", "Array<number>? < b", "typeof(a) < b", "<T>(T) -> T", "<T>(T) -> (T) + b", "(<T>(T) -> T) < b", "() -> (number) + b", "() -> (number, string)", "<T...>() -> (number, T...)"])
    ("preserves postfix and keyword target ownership in %s", async (target) => {
      expectLuauReading(`return a :: ${target}`);
      const source = `function run()\n  return a :: ${target}\nend\n`;
      const result = await compareEnginesFull(source);
      expect(result.divergences, formatDivergences(source, result.divergences)).toEqual([]);
    });
  test.each(["function f(): (number) return 1 end", "function f(): (number, string) return 1, 's' end", "type F = () -> (number)", "type F = <T...>() -> (number, T...)"])
    ("preserves grouped and explicit return packs in %s", (body) => { expectLuauReading(body); });
  test.each(["bar\n    baz", "bar\n    baz\n    qux"])("pinned parser rejects malformed table fields %s", (fields) => {
    const source = `function f()\n  local x: {\n    ${fields}\n  } = {}\n  2\nend\n`;
    expect(official(source).errors).toBeGreaterThan(0);
    const errors = official(source).diagnostics;
    expect(errors.some((error) => error.message === "Expected '}' (to close '{' at line 2), got 'baz'")).toBe(true);
  });
  test("reference rejects a type pack as a cast target", () => {
    expect(official("function run()\n  return a :: (T...) < b\nend\n").errors).toBeGreaterThan(0);
    expect(official("function run()\n  return a :: (T...) < b\nend\n").diagnostics.length).toBeGreaterThan(0);
  });
  test("preserves qualified type-name captures and locations", async () => {
    const source = "function run()\n  return a :: types.Array<number> < b\nend\n";
    const tree = parseSource(source);
    const name = tree.resolveInner(source.indexOf("Array"), 1);
    expect(source.slice(name.from, name.to)).toBe("Array");
    expect(treeScopeStackAt(tree, source.indexOf("Array"))).toContain("entity.name.type.luau");
    expect(treeScopeStackAt(tree, source.indexOf("types"))).toContain("variable.other.readwrite.luau");
    const result = await compareEnginesFull(source);
    expect(result.divergences, formatDivergences(source, result.divergences)).toEqual([]);
  });
  const compoundTargets = [
    "number | string", "number & string", "() -> number",
    "(number | string)", "(number) -> (number, string)",
    "Array<number | string>", "{value: number | string}",
    "{number | string}", "typeof(a)", "(number | string) & number",
    "() -> Array<number>", "Array<(number) -> string>",
  ];
  const operators = ["+", "-", "*", "/", "//", "%", "^", "..", ">", ">=", "==", "~=", "<=", "and", "or"];
  test.each(compoundTargets.flatMap((target) => operators.map((operator) => [target, operator])))
    ("terminates %s before %s in both engines", async (target, operator) => {
      const body = `return a :: ${target} ${operator} b`;
      expectLuauReading(body);
      const source = `function run()\n  ${body}\nend\n`;
      const result = await compareEnginesFull(source);
      expect(result.divergences, formatDivergences(source, result.divergences)).toEqual([]);
      if ([">", ">=", "==", "~=", "<="].includes(operator)) {
        const offset = source.lastIndexOf(operator);
        expect(treeScopeStackAt(parseSource(source), offset)).toContain("keyword.operator.comparison.luau");
        const lines = await tokenize(source);
        expect(lines[1]!.tokens.find((token) => token.startIndex === lines[1]!.lineText.lastIndexOf(operator))?.scopes).toContain("keyword.operator.comparison.luau");
      }
    });
  test.each(["(number | string)", "(number) -> (number, string)", "Array<number | string>",
    "{value: number | string}", "{number | string}", "typeof(a)", "() -> Array<number>",
    "Array<(number) -> string>", "number?", "true", '"literal"'].flatMap((target) => ["b", "55"].map((value) => [target, value])))
    ("reads less-than after the closed target %s before %s", async (target, value) => {
      const body = `return a :: ${target} < ${value}`;
      expectLuauReading(body);
      const source = `function run()\n  ${body}\nend\n`;
      const result = await compareEnginesFull(source);
      expect(result.divergences, formatDivergences(source, result.divergences)).toEqual([]);
      const offset = source.lastIndexOf("<");
      expect(treeScopeStackAt(parseSource(source), offset)).toContain("keyword.operator.comparison.luau");
      const lines = await tokenize(source);
      expect(lines[1]!.tokens.find((token) => token.startIndex === lines[1]!.lineText.lastIndexOf("<"))?.scopes).toContain("keyword.operator.comparison.luau");
    });
  test.each(["number | string", "number & string", "() -> number", "(number | string) & number"])
    ("reference rejects unfinished generic after %s", (target) => {
      const source = `function run()\n  return a :: ${target} < b\nend\n`;
      expect(official(source).diagnostics.some((error) => error.message.includes("Expected '>'"))).toBe(true);
      expect(official(source).errors).toBeGreaterThan(0);
    });
  test.each([
    "number", "number?", "number? | string", "number & string",
    "(number) -> string", "{number}", "{value: number?}",
    "Array<number?>", "typeof(a)", '"literal"', "true",
  ])("reads %s and the following return", (target) => {
    expectLuauReading(`local a = nil :: ${target}\n  return a`);
  });

  test.each([
    "return (a :: number?) == nil",
    "return a :: number > 0",
    "return a :: number + 1",
    "return (a :: number) :: any",
    "return a :: number+1",
    "return a :: number and b",
    "return a :: number - 1",
    "return f(a :: number?, b)",
    "return {a :: number?, b}",
    "local a = nil :: number?; return a",
    "local a = nil :: number? --[[c]] return a",
    "local a = nil :: number --[[c]] ?; return a",
    "local a = nil :: number --[[c]] | string; return a",
    "local a = nil ::\n    number?\n  return a",
  ])("keeps the boundary in %s", expectLuauReading);

  test.each(["local a = nil ::", "local a = nil :: ;"])("reports a missing target in %s", (body) => {
    const source = `function run()\n  ${body}\nend\n`;
    expect(readLuauUnits(parseSource(source), source).prelude.errors.length).toBeGreaterThan(0);
  });

  test.each(["(number -> string", "{number", "Array<number", "() -> (number", "typeof(a", "{[number: string}"])("recovers after an unfinished target %s", (target) => {
    const source = `function f()\n  local a = nil :: ${target}\n  return 55\nend\n`;
    const units = readLuauUnits(parseSource(source), source);
    expect(units.prelude.errors.length).toBeGreaterThan(0);
    expect(printAst(units.prelude.root)).toContain("StatReturn\n          ExprConstantNumber 55");
    let node = parseSource(source).resolveInner(source.indexOf("return 55"), 1);
    const ancestors: string[] = [];
    for (; node.parent; node = node.parent) ancestors.push(node.name);
    expect(ancestors).toContain("LuauReturnStatement");
    expect(ancestors).not.toContain("LuauAssignmentOperation");
  });
});
