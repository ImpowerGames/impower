// TableLiteral, TableOperations and DeprecatedApi for getfenv/setfenv
// (I-614). The upstream cases are in
// `luau-conformance/LintCandidatesStdlib.test.ts`; these are the controls
// around them: ranges and severities, the escape hatches Luau gives, the
// calls the rules cannot read without types, and code outside functions.

import { describe, expect, test } from "vitest";
import { diagnoseDetailed } from "../luau-conformance/diagnosticTestHarness";
import { testCompiler } from "../engineUnderTest";

const CODES = new Set(["TableLiteral", "TableOperations", "DeprecatedApi"]);
const lints = (source: string) => diagnoseDetailed(source).filter((d) => CODES.has(String(d.code)));
const messages = (source: string) => lints(source).map((d) => d.message);
const inFunction = (body: string) => messages(`& run()\nfunction run()\n${body}\nend\n`);

/** The diagnostics of a one-script compile, with their tags, which `diagnoseDetailed` leaves out. */
function tagged(source: string) {
  const compiler = testCompiler();
  compiler.configure({ files: [{ uri: "inmemory:///main.sd", type: "script", name: "main", ext: "sd", text: source, version: 1, languageId: "sparkdown" }] });
  const result = compiler.compile({ textDocument: { uri: "inmemory:///main.sd" } });
  return (result.program.diagnostics?.["inmemory:///main.sd"] ?? []).filter((d) => CODES.has(String(d.code))).map((d) => ({ code: d.code, severity: d.severity, tags: d.tags }));
}

describe("TableLiteral", () => {
  test("warns at the repeated key", () => {
    expect(lints("& run()\nfunction run()\n local t = {a = 1, a = 2}\n return t\nend\n")).toEqual([
      {
        file: "main.sd",
        code: "TableLiteral",
        message: "Table field 'a' is a duplicate; previously defined at line 3",
        severity: 2,
        range: { start: { line: 2, character: 19 }, end: { line: 2, character: 20 } },
      },
    ]);
  });

  test("an index and a table type's property warn at the repeated key too", () => {
    expect(lints("& run()\nfunction run()\n local t = {1, [1] = 2}\n local _x: {a: number, a: string}\n return t\nend\n").map(({ message, range }) => ({ message, range }))).toEqual([
      { message: "Table index 1 is a duplicate; previously defined as a list entry", range: { start: { line: 2, character: 16 }, end: { line: 2, character: 17 } } },
      { message: "Table type field 'a' is a duplicate; previously defined at line 4", range: { start: { line: 3, character: 23 }, end: { line: 3, character: 24 } } },
    ]);
  });

  test("distinct keys, a key in parentheses, and fractional, negative or large indices are not duplicates", () => {
    expect(inFunction(" local t = {a = 1, b = 2, [1] = 1, [2] = 2}\n local u = {1, [(1)] = 2, [1.5] = 1, [1.5] = 2, [2147483648] = 1, [2147483648] = 2}\n return t, u")).toEqual([]);
  });

  test("an index past the list entries is compared with the other indices only", () => {
    expect(inFunction(" local t = {1, [0] = 1, [2] = 2, [2] = 3}\n return t")).toEqual(["Table index 2 is a duplicate; previously defined at line 3"]);
  });

  test("reads tables outside functions, in a store and in a logic line", () => {
    expect(messages("store t = {a = 1, a = 2}\n& t = {[1] = 1, [1] = 2}\n")).toEqual([
      "Table field 'a' is a duplicate; previously defined at line 1",
      "Table index 1 is a duplicate; previously defined at line 2",
    ]);
  });

  test("a table holding a syntax error is left alone", () => {
    expect(inFunction(" local t = {a = 1 a = 2}\n return t")).toEqual([]);
  });
});

describe("TableOperations", () => {
  test("warns at the argument", () => {
    expect(lints("& run()\nfunction run()\n local t = {}\n table.insert(t, 0, 1)\nend\n")).toEqual([
      {
        file: "main.sd",
        code: "TableOperations",
        message: "table.insert uses index 0 but arrays are 1-based; did you mean 1 instead?",
        severity: 2,
        range: { start: { line: 3, character: 17 }, end: { line: 3, character: 18 } },
      },
    ]);
  });

  test("parentheses silence it, as in Luau", () => {
    expect(inFunction(" local t = {}\n table.insert(t, (0), 1)\n table.remove(t, (#t - 1))\n table.insert(t, (string.find('a', 'a')))\n table.create(1, ({}))")).toEqual([]);
  });

  test("a local named table is not the library", () => {
    expect(inFunction(" local table = {insert = function() end}\n local t = {}\n table.insert(t, 0, 1)")).toEqual([]);
  });

  test("a call returning more than one value warns only for the standard library's functions", () => {
    expect(inFunction(" local t = {}\n local function two() return 1, 2 end\n table.insert(t, two())\n table.insert(t, next(t))\n table.insert(t, math.frexp(1))\n table.insert(t, string.byte('a'))")).toEqual([
      "table.insert may change behavior if the call returns more than one result; consider adding parentheses around second argument",
    ]);
  });

  test("a local named string is not the library", () => {
    expect(inFunction(" local string = {find = function() return 1 end}\n local t = {}\n table.insert(t, string.find('a', 'a'))")).toEqual([]);
  });

  test("reads calls outside functions", () => {
    expect(messages("store t = {}\n& table.insert(t, 0, 1)\n")).toEqual(["table.insert uses index 0 but arrays are 1-based; did you mean 1 instead?"]);
  });

  test("a call holding a syntax error is left alone", () => {
    expect(inFunction(" local t = {}\n table.insert(t, 0, 1 2)\n getfenv(1 2)")).toEqual([]);
  });

  test("code written in a type is left alone, as in Luau", () => {
    expect(inFunction(" local t = {}\n type T = typeof(function() table.insert(t, 0, 1) return getfenv(1) end)\n local _x: T")).toEqual([]);
  });
});

describe("DeprecatedApi for getfenv and setfenv", () => {
  test("is Information tagged Deprecated, over the whole call", () => {
    expect(lints("& run()\nfunction run()\n getfenv(1)\nend\n").map(({ range, severity }) => ({ range, severity }))).toEqual([
      { severity: 3, range: { start: { line: 2, character: 1 }, end: { line: 2, character: 11 } } },
    ]);
    expect(tagged("& run()\nfunction run()\n getfenv(1)\n setfenv(1, {})\nend\n")).toEqual([
      { code: "DeprecatedApi", severity: 3, tags: [2] },
      { code: "DeprecatedApi", severity: 3, tags: [2] },
    ]);
  });

  test("a first argument that is not a literal number, no argument, or a local of the name report nothing", () => {
    expect(inFunction(" local f = function() end\n getfenv(f)\n getfenv()\n getfenv((1))\n setfenv(f, {})")).toEqual([]);
    expect(inFunction(" local getfenv = function(_n) end\n getfenv(1)")).toEqual([]);
  });

  test("other lints stay Warnings", () => {
    expect(tagged("& run()\nfunction run()\n local t = {}\n table.insert(t, 0, 1)\nend\n")).toEqual([{ code: "TableOperations", severity: 2, tags: undefined }]);
  });
});
