import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";
import { runConformanceSource } from "./conformanceTestHarness";

const passes = (source: string) => {
  const r = runConformanceSource(source, undefined, "main");
  expect(r.errorMessages).toEqual([]);
  expect(r.returnedOK).toBe(true);
};

describe("string.format `%s` and `__tostring`", () => {
  test("the ticket's story prints the metamethod's result", () => {
    const ctx = makeRuntimeStoryFromSource(
      `function run() local t = setmetatable({}, { __tostring = function() return "T" end }) return string.format("%s", t) end
Got {run()}.
`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("Got T.\n");
  });

  test("`%s` agrees with `tostring` and truncates after the conversion", () => {
    passes(`
local t = setmetatable({}, { __tostring = function() return "gororoba" end })
assert(string.format("%s", t) == tostring(t))
assert(string.format("%.3s", t) == "gor")
assert(string.format("[%10s]", t) == "[  gororoba]")
local n = setmetatable({}, { __tostring = function() return 42 end })
assert(string.format("%s", n) == "42")
assert(string.format("%s", nil) == "nil")
assert(string.format("%s|%s", 1, true) == "1|true")
assert(string.format("%s", "x") == "x")
`);
  });

  test("a `__tostring` that returns no string raises tostring's error", () => {
    passes(`
local a = setmetatable({}, { __tostring = function() return {} end })
local ok, err = pcall(string.format, "%s", a)
assert(not ok and err == "'__tostring' must return a string", tostring(err))
`);
  });

  test("an absent argument still raises the missing-argument error", () => {
    passes(`
local ok, err = pcall(string.format, "%s")
assert(not ok)
`);
  });
});
