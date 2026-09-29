// A function expression takes no name in Luau, so a named function in a value
// position (`store g = function named() ... end`) is a parse error at the
// name. The compiler reports it there and still lowers the function as a
// value, so the rest of the story compiles.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import {
  collectDiagnostics,
  makeRuntimeStoryFromSource,
} from "./runtimeTestHarness";

const MESSAGE = "Expected '(' when parsing function, got 'named'";

// The ranges of every error the compiler reports for `source`.
function errorRanges(source: string): unknown[] {
  const uri = "inmemory:///main.sd";
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const result = compiler.compile({ textDocument: { uri } });
  return Object.values(result.program.diagnostics ?? {})
    .flat()
    .filter((d) => (d as { severity?: number }).severity === 1)
    .map((d) => (d as { range?: unknown }).range);
}

const store = "store g = function named() return 7 end\nValue {g()}.\n";
const storeList = "store a, g = 1, function named() return 7 end\nValue {g()}.\n";
const local =
  "Value {f()}.\nfunction f()\n  local g = function named() return 7 end\n  return g()\nend\n";

describe("named function in a value position", () => {
  test.each([
    ["store", store],
    ["store value list", storeList],
    ["local", local],
  ])("%s: reports an error at the name", (_name, source) => {
    const { errorMessages } = collectDiagnostics(source);
    expect(errorMessages).toEqual([MESSAGE]);
  });

  test.each([
    ["store", store],
    ["store value list", storeList],
    ["local", local],
  ])("%s: the story still compiles and runs", (_name, source) => {
    const ctx = makeRuntimeStoryFromSource(source);
    const runtimeErrors: string[] = [];
    ctx.story.onError = (m: string) => runtimeErrors.push(m);
    expect(ctx.story.Continue()).toBe("Value 7.\n");
    expect(runtimeErrors).toEqual([]);
  });

  test.each([
    ["dotted", "a.f"],
    ["method", "a:f"],
  ])("%s name: reports an error at the whole name", (_name, fnName) => {
    const source = `store a = 999\nstore g = function ${fnName}() return 7 end\nValue {g()}.\n`;
    const { errorMessages } = collectDiagnostics(source);
    expect(errorMessages).toEqual([
      `Expected '(' when parsing function, got '${fnName}'`,
    ]);
    expect(errorRanges(source)).toEqual([
      { start: { line: 1, character: 19 }, end: { line: 1, character: 22 } },
    ]);
  });

  test("a compound assignment that lowers its target twice reports once", () => {
    const { errorMessages } = collectDiagnostics(
      "Value {f()}.\nfunction f()\n  local t = {}\n  t[function named() return 1 end] = 1\n  t[function named() return 1 end] += 1\n  return 1\nend\n",
    );
    expect(errorMessages).toEqual([MESSAGE, MESSAGE]);
  });

  test.each([
    ["anonymous value", "store g = function() return 7 end\nValue {g()}.\n"],
    [
      "inline body starting with an access path",
      "store t = {}\nstore g = function() t.x = 1 return 7 end\nValue {g()}.\n",
    ],
  ])("%s reports nothing", (_name, source) => {
    const { errorMessages } = collectDiagnostics(source);
    expect(errorMessages).toEqual([]);
  });
});
