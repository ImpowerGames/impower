// A function value captures the outer locals it reads, as Luau binds each
// read: a local of the same name declared in a function nested in it, or
// later in its own body, is another variable and does not stop the capture
// (#1333).

import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

describe("a closure captures the outer local it reads", () => {
  test.each([
    [
      "a nested function declares a local of the same name",
      "local x = 7\nlocal f = function()\n  local g = function()\n    local x = 3\n    return x\n  end\n  return x + g() - 3\nend\nassert(f() == 7)\n",
    ],
    [
      "a nested function takes a parameter of the same name",
      "local x = 7\nlocal f = function()\n  local g = function(x) return x end\n  return x + g(0)\nend\nassert(f() == 7)\n",
    ],
    [
      "the body declares a local of the same name after the read",
      "local x = 7\nlocal f = function()\n  local y = x\n  local x = 3\n  return y + x - 3\nend\nassert(f() == 7)\n",
    ],
    [
      "a block in the body declares a local of the same name",
      "local x = 7\nlocal f = function()\n  do\n    local x = 3\n  end\n  return x\nend\nassert(f() == 7)\n",
    ],
    [
      "a loop in the body declares a variable of the same name",
      "local x = 7\nlocal f = function()\n  for x = 1, 2 do end\n  return x\nend\nassert(f() == 7)\n",
    ],
  ])("%s", (_name, source) => {
    const r = runConformanceSource(source);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("a parameter of the same name is the closure's own", () => {
    const r = runConformanceSource(
      "local x = 7\nlocal f = function(x) return x end\nassert(f(3) == 3)\n",
    );
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
