import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// `function NAME(...) end` (without `local`) inside a function body is
// Luau-spec sugar for `NAME = function(...) end` — visible across
// do/while/for/if block boundaries within the enclosing function. The
// lowerer hoists the `local NAME = nil` pre-declaration to the
// enclosing function's body level and emits a reassignment in place,
// so the binding survives BeginScope/EndScope on the wrapping block.
//
// `local function NAME(...) end` still scopes to the innermost block
// per Luau spec — only the non-local form gets hoisted.

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
    // The local form's binding is scoped to the do block; referencing
    // `inner` after the block exits should NOT find the local. We just
    // verify the compile succeeds — calling `inner` after would be a
    // separate test for the failure path.
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
