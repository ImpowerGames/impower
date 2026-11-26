import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

describe("multi-target reassignment with property targets", () => {
  test("a.x, b = 1, 2 (mixed property + variable, scalar RHS)", () => {
    const r = runConformanceSource(`a = {}
a.x, b = 1, 2
assert(a.x == 1 and b == 2)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("a.x, b, a[1] = 1, 2, f() (attrib.luau line 13)", () => {
    const r = runConformanceSource(`a={}
function f() return 10, 11, 12 end
a.x, b, a[1] = 1, 2, f()
assert(a.x==1 and b==2 and a[1]==10)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("only property targets: a.x, a.y = 1, 2", () => {
    const r = runConformanceSource(`a = {}
a.x, a.y = 1, 2
assert(a.x == 1 and a.y == 2)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("indexer target: a[1], b = 'x', 'y'", () => {
    const r = runConformanceSource(`a = {}
a[1], b = "x", "y"
assert(a[1] == "x" and b == "y")`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("multi-return spread into mixed targets", () => {
    const r = runConformanceSource(`a = {}
function f() return 10, 20, 30 end
a.x, b, a[1] = f()
assert(a.x == 10 and b == 20 and a[1] == 30)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: simple multi-variable still uses fast path", () => {
    const r = runConformanceSource(`a, b, c = 1, 2, 3
assert(a == 1 and b == 2 and c == 3)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});

describe("multi-target assignment conflict semantics", () => {
  test("subscript reads the pre-store value (basic.luau line 53)", () => {
    const r = runConformanceSource(
      `assert((function() local a, b = 1, {} a, b[a] = 43, -1 return a + b[1] end)() == 42)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("base captured before its variable is overwritten (line 54)", () => {
    const r = runConformanceSource(
      `assert((function() local a = {} local b = a a[1], a = 43, -1 return a + b[1] end)() == 42)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("conflict semantics with multi-return RHS (lines 55-56)", () => {
    const r = runConformanceSource(
      `assert((function() local a, b = 1, {} a, b[a] = (function() return 43, -1 end)() return a + b[1] end)() == 42)
assert((function() local a = {} local b = a a[1], a = (function() return 43, -1 end)() return a + b[1] end)() == 42)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
