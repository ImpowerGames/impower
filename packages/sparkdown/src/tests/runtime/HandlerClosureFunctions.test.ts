// A handler's closure (`@click={ ... }`) is a function of its own (I-1332),
// in a layout written in a function too: the functions declared or written
// in it belong to the closure, not to the function around the layout, and
// none fails the compile. A layout in a function is itself an error, a
// top-level declaration written inside a function (I-1405), which registers
// nothing, so it is the script's only error and the function runs.

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
