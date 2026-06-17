import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// Lua truthiness: ONLY `nil` and `false` are falsy — 0, 0.0, "", and
// every table are truthy. Implemented as:
//
//   - `isLuauTruthy` (engine/LuauTruthiness.ts) — the predicate.
//   - `TRUTHY` native op — Luau `if`/`elseif`/`while` conditions are
//     wrapped in it at lower time (lowerSparkdownIfBlock /
//     lowerLuauWhileLoop) so they reach the conditional-divert test
//     as a real BoolValue. Ink-style narrative constructs (choice
//     conditions, `{cond:}` interpolations) keep ink truthiness via
//     Story.IsTruthy — read-count idioms like `* if seen_scene`
//     still treat 0 as falsy.
//   - `and`/`or` operand selection + `not` (NativeFunctionCall
//     special cases) use the Lua predicate; `not` always returns a
//     genuine boolean (it formerly returned ink Ints, corrupted the
//     eval stack on nil, and threw on tables).
//   - `repeat ... until cond` needs no wrapping — its lowerer wraps
//     the condition in `not`, which now normalizes per Lua.
//   - StdLib's JS-level `isTruthy` (assert, string.find plain flag,
//     table.sort comparators) flipped to Lua semantics too.
//
// Unlocks basic.luau lines 86-87 and the and/or/not sections
// (132-140, 149-151, 167-174).

describe("Lua truthiness in conditions", () => {
  test("if 0 takes the then-branch (basic.luau line 86)", () => {
    const r = runConformanceSource(
      `assert((function() local a = 0 if a then a = 1 else a = 2 end return a end)() == 1)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test('if "" takes the then-branch', () => {
    const r = runConformanceSource(
      `local r if "" then r = 1 else r = 2 end assert(r == 1, "got " .. tostring(r))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("if {} takes the then-branch (empty table is truthy)", () => {
    const r = runConformanceSource(
      `local r if {} then r = 1 else r = 2 end assert(r == 1, "got " .. tostring(r))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("nil and false still take the else-branch (basic.luau line 87)", () => {
    const r = runConformanceSource(
      `assert((function() local a if a then a = 1 else a = 2 end return a end)() == 2)
local r if false then r = 1 else r = 2 end
assert(r == 2, "got " .. tostring(r))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("while with a 0 guard loops (0 is truthy)", () => {
    const r = runConformanceSource(
      `local n = 0
local x = 0
while x do
  n = n + 1
  x = nil
end
assert(n == 1, "got " .. tostring(n))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});

describe("and/or return operands with Lua truthiness", () => {
  test("0 or fallback returns 0 (basic.luau lines 132-140 shapes)", () => {
    const r = runConformanceSource(
      `assert((0 or 5) == 0)
assert((0 and 5) == 5)
assert(("" or "x") == "")
assert((nil or 7) == 7)
assert((nil and 7) == nil)
assert((1 and 2) == 2)
assert((1 or 2) == 1)
assert((false or "d") == "d")`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("empty table is truthy for or-defaulting", () => {
    const r = runConformanceSource(
      `local t = {}
local got = t or "fallback"
assert(got == t)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});

describe("not returns genuine booleans with Lua truthiness", () => {
  test("not over 0 / '' / nil / true / false / tables (basic.luau 149-151)", () => {
    const r = runConformanceSource(
      `assert((not 0) == false)
assert((not "") == false)
assert((not nil) == true)
assert((not false) == true)
assert((not true) == false)
assert((not {}) == false)
assert((not not nil) == false)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});

describe("Lua truthiness in the stdlib", () => {
  test("assert(0) and assert('') pass", () => {
    const r = runConformanceSource(`assert(0)\nassert("")`);
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("t:find miss returns nil (not 0), so `not t:find(x)` works", () => {
    const r = runConformanceSource(
      `local t = {"b", "d"}
assert(t:find("c") == nil)
assert(not t:find("c"))
assert(t:find("d") == 2)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
