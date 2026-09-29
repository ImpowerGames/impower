// A function expression takes no name in Luau, so a named function in a value
// position (`store g = function named() ... end`) is a parse error at the
// name. The compiler reports it there and still lowers the function as a
// value, so the rest of the story compiles.

import { describe, expect, test } from "vitest";
import {
  collectDiagnostics,
  makeRuntimeStoryFromSource,
} from "./runtimeTestHarness";

const MESSAGE = "Expected '(' when parsing function, got 'named'";

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

  test("an anonymous function value reports nothing", () => {
    const { errorMessages } = collectDiagnostics(
      "store g = function() return 7 end\nValue {g()}.\n",
    );
    expect(errorMessages).toEqual([]);
  });
});
