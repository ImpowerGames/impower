import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

describe("nested function hoisting", () => {
  test("function in do block, called after do block", () => {
    const r = runConformanceSource(`do
  function inner(n)
    return n * 2
  end
end
assert(inner(5) == 10, "got " .. tostring(inner(5)))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("function in if block, called after if block", () => {
    const r = runConformanceSource(`if true then
  function inner(n) return n + 100 end
end
assert(inner(5) == 105, "got " .. tostring(inner(5)))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("function in while block, called after while exits", () => {
    const r = runConformanceSource(`local i = 0
while i < 1 do
  function inner(n) return n - 1 end
  i = i + 1
end
assert(inner(10) == 9, "got " .. tostring(inner(10)))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("local function in do block stays local", () => {
    const r = runConformanceSource(`do
  local function inner(n) return n end
end
local x = 1`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("top-level function definition unchanged", () => {
    const r = runConformanceSource(`function inner(n) return n * 3 end
assert(inner(4) == 12, "got " .. tostring(inner(4)))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("self-referential local function still works", () => {
    const r = runConformanceSource(`local function fact(n)
  if n == 0 then return 1 end
  return n * fact(n - 1)
end
assert(fact(5) == 120, "got " .. tostring(fact(5)))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
