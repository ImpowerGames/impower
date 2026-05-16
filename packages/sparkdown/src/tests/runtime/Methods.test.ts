// Builtin method-call dispatch (`obj:method(args)`).
//
// Sparkdown parses `s:upper()` / `t:concat(",")` etc. as a
// `LuauAccessPath` ending in `LuauFunctionAccessor` paired with a
// sibling `LuauParenthetical` holding the args. The lowerer
// (`lowerMethodCall`) translates `receiver:method(args)` into a
// `FunctionCall(__method_<method>, [receiver, ...args])` when the
// method name is a registered builtin in `MethodDispatch.ts`. The
// runtime (`NativeFunctionCall.Call`) recognizes the `__method_*`
// prefix and routes to `callBuiltinMethod` for receiver-type-aware
// dispatch.
//
// Design spec: `packages/sparkdown/METHODS.md`.

import { describe, expect, test } from "vitest";
import {
  makeRuntimeStoryFromFile,
  makeRuntimeStoryFromSource,
} from "./runtimeTestHarness";

describe("Builtin methods (strings)", () => {
  test("string method set", () => {
    const ctx = makeRuntimeStoryFromFile("methods", "string-methods");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      [
        "HELLO, WORLD!",
        "hello, world!",
        "13",
        "!dlroW ,olleH",
        "ello",
        "ld!",
        "hi",
        "true",
        "true",
        "8",
        "0",
        "Hello, Luau!",
        "ababab",
        "x-x-x",
        "00042",
        "42___",
        "H",
        "!",
        "",
      ].join("\n"),
    );
  });
});

describe("Chained method calls", () => {
  test("multi-level method chains return values flow correctly", () => {
    // Phase 0 of the first-class-functions work (FUNCTIONS.md) added
    // chained-method-call support via the dedicated grammar rule
    // `LuauChainedFunctionCall`. After a `LuauParenthetical`, each
    // subsequent `:method(args)` link is matched as a
    // `LuauChainedFunctionCall + LuauParenthetical` sibling pair;
    // the lowerer threads the previous result as the receiver.
    // Verified here at multiple chain depths and with both string and
    // numeric arguments in mid-chain positions.
    const ctx = makeRuntimeStoryFromFile("methods", "chained");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      [
        "1,2,3,4,5,6", // a:union(b):concat(",")
        "3|4",         // a:intersection(b):concat("|")
        "2,1",         // a:difference(b):reverse():concat(",")
        "6",           // a:union(b):sort():reverse():at(1) — numeric mid-chain
        "2,3,4",       // a:union(b):sort():sub(2, 4):concat(",")
        "",
      ].join("\n"),
    );
  });
});

describe("Builtin methods (tables)", () => {
  test("table method set", () => {
    const ctx = makeRuntimeStoryFromFile("methods", "table-methods");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      [
        "5",
        "1",
        "5",
        "3",
        "0",
        "1-2-3-4-5",
        "5,4,3,2,1",
        "1,1,2,3,4,5,6,9",
        "2,3,4",
        "",
      ].join("\n"),
    );
  });

  test("min / max / random — comparison-based and probabilistic picks", () => {
    // `:min()` and `:max()` use the same `compareValues` helper that
    // `:sort()` does — number-to-number and string-to-string comparisons
    // are allowed, mixed types raise. Empty table returns `nil`
    // (IntValue(0), falsy under `if t:min() then`).
    //
    // `:random()` picks any element from the array portion. The
    // fixture's deterministic lines pin min/max; the test below
    // separately samples `:random()` to verify every result is one
    // of the source elements (and that empty → nil).
    const ctx = makeRuntimeStoryFromFile("methods", "min-max-random");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      [
        "1", // nums:min()
        "9", // nums:max()
        "apple", // strs:min()
        "pear", // strs:max()
        "0", // empty:min() → nil
        "0", // empty:max() → nil
        "0", // empty:random() → nil
        "",
      ].join("\n"),
    );
  });

  test(":random() returns an element from the array portion", () => {
    // Re-compile-and-run a small fixture many times; each `:random()`
    // result must be one of the source elements. This is a sanity-check
    // on the dispatch, not a distribution test.
    const src = `store t = {10, 20, 30, 40, 50}\n{t:random()}\n`;
    const valid = new Set([10, 20, 30, 40, 50]);
    for (let i = 0; i < 50; i++) {
      const ctx = makeRuntimeStoryFromSource(src);
      expect(ctx.errorMessages).toEqual([]);
      const output = ctx.story.ContinueMaximally().trim();
      const picked = parseInt(output, 10);
      expect(valid.has(picked)).toBe(true);
    }
  });

  test("set operations (union / intersection / difference / some / every)", () => {
    const ctx = makeRuntimeStoryFromFile("methods", "set-ops");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      [
        "1,2,3,4,5,6",
        "3,4",
        "1,2",
        "true",
        "false",
        "true",
        "false",
        "",
      ].join("\n"),
    );
  });
});
