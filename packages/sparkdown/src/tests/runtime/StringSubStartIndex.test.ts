// I-853 — `string.sub` checks its start index the way Luau's
// `luaL_checkinteger` does: a nil (or other non-number) start index raises
// `invalid argument #N to 'sub' (number expected, got <type>)`, which `pcall`
// traps. The function form counts the string as argument #1, so the start
// index is #2; the method form does not count the receiver, so it is #1. An
// absent or nil end index still means "to the end"; a table end index raises.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

function probe(body: string): string {
  const ctx = makeRuntimeStoryFromSource(`scene start
  Got {run()}.
end
function run()
  local ok, e = pcall(function() return ${body} end)
  return tostring(ok) .. " " .. tostring(e)
end
`);
  const text = ctx.story.ContinueMaximally();
  expect(ctx.errorMessages).toEqual([]);
  return text.trim();
}

describe("string.sub start index", () => {
  test("function form raises invalid argument #2 for a nil start index", () => {
    expect(probe(`string.sub("abc", nil)`)).toBe(
      "Got false invalid argument #2 to 'sub' (number expected, got nil).",
    );
  });

  test("method form raises invalid argument #1 for a nil start index", () => {
    expect(probe(`("abc"):sub(nil)`)).toBe(
      "Got false invalid argument #1 to 'sub' (number expected, got nil).",
    );
  });

  test("a table start index names its type", () => {
    expect(probe(`string.sub("abc", {})`)).toBe(
      "Got false invalid argument #2 to 'sub' (number expected, got table).",
    );
    expect(probe(`("abc"):sub({})`)).toBe(
      "Got false invalid argument #1 to 'sub' (number expected, got table).",
    );
  });

  test("a table end index raises", () => {
    expect(probe(`string.sub("abc", 1, {})`)).toBe(
      "Got false invalid argument #3 to 'sub' (number expected, got table).",
    );
    expect(probe(`("abc"):sub(1, {})`)).toBe(
      "Got false invalid argument #2 to 'sub' (number expected, got table).",
    );
  });

  test("an absent or nil end index means to the end", () => {
    expect(probe(`string.sub("abc", 2)`)).toBe("Got true bc.");
    expect(probe(`string.sub("abc", 2, nil)`)).toBe("Got true bc.");
    expect(probe(`("abc"):sub(2)`)).toBe("Got true bc.");
    expect(probe(`("abc"):sub(2, nil)`)).toBe("Got true bc.");
  });
});
