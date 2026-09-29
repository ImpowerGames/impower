import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// A `while` body is a block: its locals end with each iteration and never
// replace a binding from an enclosing scope.
describe("while body scope", () => {
  test("a body local is not visible after the loop", () => {
    const r = runConformanceSource(
      `while true do\n  local x = 1\n  break\nend\nassert(x == nil, "while-body local leaked: " .. tostring(x))\n`,
    );
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("a body local shadows an outer local only inside the loop", () => {
    const r = runConformanceSource(
      `local x = "outer"\nwhile true do\n  local x = "inner"\n  assert(x == "inner", "inner x is " .. tostring(x))\n  break\nend\nassert(x == "outer", "outer x replaced: " .. tostring(x))\n`,
    );
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("a loop that ends by its condition leaves the outer local in place", () => {
    const r = runConformanceSource(
      `local x = "outer"\nlocal i = 0\nwhile i < 3 do\n  i = i + 1\n  local x = i\nend\nassert(i == 3, "i is " .. tostring(i))\nassert(x == "outer", "outer x replaced: " .. tostring(x))\n`,
    );
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("break from a nested block leaves the outer local in place", () => {
    const r = runConformanceSource(
      `local x = "outer"\nwhile true do\n  local x = "inner"\n  if x == "inner" then\n    local y = 1\n    break\n  end\nend\nassert(x == "outer", "outer x replaced: " .. tostring(x))\nassert(y == nil, "if-body local leaked: " .. tostring(y))\n`,
    );
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("continue skips the rest of the body and keeps the outer local", () => {
    const r = runConformanceSource(
      `local v = "outer"\nlocal i = 0\nlocal sum = 0\nwhile i < 5 do\n  i = i + 1\n  local v = i * 10\n  if v == 30 then\n    continue\n  end\n  sum = sum + v\nend\nassert(sum == 120, "sum is " .. tostring(sum))\nassert(v == "outer", "outer v replaced: " .. tostring(v))\n`,
    );
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("a closure captures a fresh body local on each iteration", () => {
    const r = runConformanceSource(
      `local fns = {}\nlocal i = 0\nwhile i < 3 do\n  i = i + 1\n  local j = i\n  fns[i] = function() return j end\nend\nassert(fns[1]() == 1, "fns[1] is " .. tostring(fns[1]()))\nassert(fns[2]() == 2, "fns[2] is " .. tostring(fns[2]()))\nassert(fns[3]() == 3, "fns[3] is " .. tostring(fns[3]()))\n`,
    );
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("nested while loops keep their own locals", () => {
    const r = runConformanceSource(
      `local x = "outer"\nlocal i = 0\nlocal seen = ""\nwhile i < 2 do\n  i = i + 1\n  local x = "a" .. i\n  local k = 0\n  while k < 2 do\n    k = k + 1\n    local x = "b" .. k\n    seen = seen .. x\n  end\n  seen = seen .. x\nend\nassert(seen == "b1b2a1b1b2a2", "seen is " .. seen)\nassert(x == "outer", "outer x replaced: " .. tostring(x))\n`,
    );
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
