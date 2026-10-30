import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

describe("a function in a handler of a layout in a function", () => {
  test.each([
    ["a function value", "local h = function() a = 2 end h()"],
    ["a local function", "local function h() a = 2 end h()"],
    ["a const function", "const function h() a = 2 end h()"],
  ])("%s fails nothing but the layout's own placement", (_label, handler) => {
    const ctx = makeRuntimeStoryFromSource(`scene start
  Go {f()}.
end

function f()
  local a = 1
  layout form with
    button "Go" @click={ ${handler} }
  end
  return a
end
`);
    const text = ctx.story.Continue();
    expect([...ctx.errorMessages]).toEqual([
      "'layout' is a top-level declaration and cannot be written inside a function",
    ]);
    expect(text).toBe("Go 1.\n");
  });
});
