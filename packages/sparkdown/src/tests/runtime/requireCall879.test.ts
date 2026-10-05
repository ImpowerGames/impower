import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

// A local function deliberately shadows require. This proves ordinary
// identifier/call behavior and the enclosing function's story output without
// assuming Sparkdown has a runtime module loader or that require(1) succeeds.
describe("locally shadowed require calls retain story output (#879)", () => {
  for (const [label, eol] of [["LF", "\n"], ["CRLF", "\r\n"]] as const) {
    test.each(["require", "find"])(`${label}: local %s call preserves the following return`, (name) => {
      const source = [
        "Value {f()}.",
        "After the function call.",
        "function f()",
        `  local ${name} = function(x) return x end`,
        `  local m = ${name}(1)`,
        "  return m",
        "end",
        "",
      ].join(eol);
      const ctx = makeRuntimeStoryFromSource(source);
      expect(ctx.errorMessages).toEqual([]);
      const runtimeErrors: string[] = [];
      ctx.story.onError = (message: string) => runtimeErrors.push(message);
      expect(ctx.story.ContinueMaximally()).toBe("Value 1.\nAfter the function call.\n");
      expect(runtimeErrors).toEqual([]);
    });
  }
});
