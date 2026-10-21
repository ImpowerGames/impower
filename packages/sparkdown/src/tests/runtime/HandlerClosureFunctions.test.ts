// A handler's closure (`@click={ ... }`) is a function of its own (I-1332),
// in a layout written in a function too: the functions declared or written
// in it belong to the closure, not to the function around the layout, so a
// call of one finds it. (The click on such a layout is not run here: a layout
// in a function does not mount.)

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

describe("a function in a handler of a layout in a function", () => {
  test.each([
    ["a function value", "local h = function() a = 2 end h()"],
    ["a local function", "local function h() a = 2 end h()"],
    ["a const function", "const function h() a = 2 end h()"],
  ])("%s is found where it is called", (_label, handler) => {
    const ctx = makeRuntimeStoryFromSource(`Go {f()}.
function f()
  local a = 1
  layout form with
    button "Go" @click={ ${handler} }
  end
  return a
end
`);
    const text = ctx.story.Continue();
    expect([...ctx.errorMessages]).toEqual([]);
    expect(text).toBe("Go 1.\n");
  });
});
