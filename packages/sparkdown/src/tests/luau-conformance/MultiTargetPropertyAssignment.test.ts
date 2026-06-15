import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// Multi-target reassignment with at least one property-access target:
//   `a.x, b = 1, 2`
//   `a.x, b, a[1] = 1, 2, f()` (last RHS spreads multi-return)
//
// The original `lowerMultiTargetReassignment` rejected any target
// without a plain `LuauVariableName` (returned an empty block when
// `getDescendent("LuauVariableName")` failed). For property targets
// like `a.x`, the descendent walker did find `a` (the deepest leftmost
// variable name in the subtree) — so the lowerer silently treated
// `a.x = …` as `a = …`, clobbering the whole table. Examples from
// upstream attrib.luau lines 13 + 15 — common Luau idiom.
//
// Fix: detect mixed-target shapes and expand them via synthetic
// temps. The RHS values are stashed into N synthetic `__mt_<from>_<i>`
// locals via the existing `MultiVariableAssignment` (so multi-return
// spread on the last RHS still works), then per-target writes are
// emitted — `VariableAssignment` for simple-variable targets,
// `StorePropertyAssignment` for property targets.

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
    // f() returns 3 values; first goes into a.x, second into b,
    // third into a[1]. Extra values would be discarded (only 3 slots).
    const r = runConformanceSource(`a = {}
function f() return 10, 20, 30 end
a.x, b, a[1] = f()
assert(a.x == 10 and b == 20 and a[1] == 30)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: simple multi-variable still uses fast path", () => {
    // All-variable targets should keep using the single
    // MultiVariableAssignment shape (no temp expansion). Verifies
    // behavior is preserved.
    const r = runConformanceSource(`a, b, c = 1, 2, 3
assert(a == 1 and b == 2 and c == 3)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});

// Lua's "assignments with local conflicts" semantics: in a multiple
// assignment, ALL expressions — the RHS values and every property
// target's base + subscript — evaluate before ANY store happens.
// `lowerMultiTargetReassignment` enforces this by stashing each
// property target's base and key into `__mt_base_*` / `__mt_key_*`
// temps ahead of the store phase, so a store to an earlier target
// can't change what a later target's subscript (or base) refers to.
// basic.luau lines 53-56.

describe("multi-target assignment conflict semantics", () => {
  test("subscript reads the pre-store value (basic.luau line 53)", () => {
    // `b[a]` must mean `b[1]` (the OLD a), not `b[43]`.
    const r = runConformanceSource(
      `assert((function() local a, b = 1, {} a, b[a] = 43, -1 return a + b[1] end)() == 42)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("base captured before its variable is overwritten (line 54)", () => {
    // `a[1]` must store into the ORIGINAL table (still aliased by
    // `b`) even though `a` itself is reassigned to -1 in the same
    // statement.
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
