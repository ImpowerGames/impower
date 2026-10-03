import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource, runToEnd } from "./runtimeTestHarness";

describe("Luau long strings treat backslashes as literal text", () => {
  test.each(["", "=", "=="])("closes after a backslash at level %s", (level) => {
    const ctx = makeRuntimeStoryFromSource(`function f()
  local s = [${level}[a\\]${level}]
  return #s
end
: {f()}
`);
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story).trim()).toBe("2");
  });

  test("keeps escape spellings and the following statements intact", () => {
    const ctx = makeRuntimeStoryFromSource(`function f()
  local s = [[a\\]]
  local other = [[later]]
  return #s + #other + #[[\\n\\t]]
end
: {f()}
`);
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story).trim()).toBe("11");
  });
});
