import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

describe("uninitialized local + same-line statement", () => {
  test("shadows an existing global (basic.luau line 84 in context)", () => {
    const r = runConformanceSource(
      `a = 99
assert((function() local a if a then a = 2 end return a end)() == nil)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("write lands on the local, not the global", () => {
    const r = runConformanceSource(
      `g = 7
local function f() local g if g == nil then g = 1 end return g end
assert(f() == 1, "f=" .. tostring(f()))
assert(g == 7, "g=" .. tostring(g))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("bare multi declaration shadows globals", () => {
    const r = runConformanceSource(
      `a = 99
b = 98
assert((function() local a, b if a or b then a = 2 end return a end)() == nil)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: initialized one-line local + if still works", () => {
    const r = runConformanceSource(
      `a = 99
assert((function() local a = 5 if a then a = a + 1 end return a end)() == 6)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: property path before `=` is NOT a bare declaration", () => {
    const r = runConformanceSource(
      `local t = {x = 4}
local y = t.x
assert(y == 4)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
