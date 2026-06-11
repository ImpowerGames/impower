import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// Lua arithmetic semantics (basic.luau lines 93-161):
//
//   - `/` is ALWAYS true float division (`1 / 2` is 0.5); `//` is the
//     separate floor-division op (rounds toward -infinity).
//   - `%` is floor-mod (`a - floor(a/b)*b`), not JS truncated
//     remainder — they differ for negative operands.
//   - NaN and -0 are first-class: `Value.Create` maps NaN to
//     FloatValue (it formerly returned null and corrupted the eval
//     stack), and the Int/Float constructors use `?? 0` instead of
//     `|| 0` (NaN and -0 are falsy in JS, so `|| 0` silently
//     normalized both to +0 — `inf - inf` came out 0).
//   - tostring formats Lua-style: "nan" / "inf" / "-inf" / "-0".
//   - `..` is a first-class concat op (formerly aliased to `+`, which
//     ADDED numbers: `1 .. 2` was 3). Numbers stringify; nil /
//     boolean / table operands raise "attempt to concatenate <type>
//     with <type>" (pcall fixtures pattern-match it).
//   - Arithmetic coerces numeric STRINGS (`1 + "2"` is 3, `2 * "0xa"`
//     is 20), including hex; string+string `+` keeps ink concat.
//   - `#t` is the ARRAY-PORTION length (consecutive int keys from 1),
//     so `#_G` and `#{a=1}` are 0; `__len` metamethods fire.
//   - JS-driven Lua calls (metamethods, sort comparators, pcall)
//     normalize arg counts: extras discarded, missing padded with
//     nil — a zero-param `__len` handler no longer strands its
//     receiver on the eval stack.

describe("division and modulo", () => {
  test("/ is float division; // floors toward -infinity (lines 93, 106-111)", () => {
    const r = runConformanceSource(
      `assert((function() local a = 1 a = a / 2 return a end)() == 0.5)
assert(1 // 2 == 0)
assert(3 // 2 == 1)
assert(3.5 // 2 == 1)
assert(-1 // 2 == -1)
assert(-3 // 2 == -2)
assert(-3.5 // 2 == -2)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("% is floor-mod (negative operands)", () => {
    const r = runConformanceSource(
      `assert(5 % 2 == 1)
assert(-5 % 3 == 1)
assert(5 % -3 == -1)
assert(12 % 5 == 2)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});

describe("fp specials: nan / inf / -0 (lines 95-103)", () => {
  test("inf arithmetic and Lua-format tostring", () => {
    const r = runConformanceSource(
      `assert(tostring(1/0) == "inf")
assert(tostring(-1/0) == "-inf")
local a = 1 / 0
assert(tostring(a - a) == "nan", "got " .. tostring(a - a))
local n = 0 / 0
assert(tostring(n * 0) == "nan", "got " .. tostring(n * 0))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("negative zero keeps its sign (lines 97-99)", () => {
    const r = runConformanceSource(
      `assert((function(a) return tostring(a + 0) end)(-0) == "0")
assert((function(a) return tostring(a - 0) end)(-0) == "-0")
assert((function(a) return tostring(0 - a) end)(0) == "0")`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("tonumber accepts nan / inf / hex spellings", () => {
    const r = runConformanceSource(
      `assert(tostring(tonumber("nan")) == "nan")
assert(tonumber("inf") == 1/0)
assert(tonumber("0xa") == 10)
assert(tonumber("zzz") == nil)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});

describe(".. concatenation (lines 120-123)", () => {
  test("strings and numbers concatenate", () => {
    const r = runConformanceSource(
      `assert((function() local a = '1' a = a .. '2' return a end)() == "12")
assert((function() local a = '1' a = a .. '2' .. '3' return a end)() == "123")
assert((1 .. 2) == "12")
assert(("x" .. 5) == "x5")`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("concatenating nil raises the Lua error message (line 123)", () => {
    const r = runConformanceSource(
      `local ok, err = pcall(function() return '1' .. nil .. '2' end)
assert(ok == false)
assert(err:find("attempt to concatenate nil with string") ~= nil, "got " .. tostring(err))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});

describe("arithmetic string coercion (lines 145-146)", () => {
  test("numeric strings coerce in arithmetic, including hex", () => {
    const r = runConformanceSource(
      `assert(1 + "2" == 3)
assert(2 * "0xa" == 20)
assert("10" - 4 == 6)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});

describe("# length operator (lines 153-161)", () => {
  test("# measures the array portion only", () => {
    const r = runConformanceSource(
      `assert(#_G == 0)
assert(#{1,2} == 2)
assert(#'g' == 1)
local t = {}
t.x = 1
assert(#t == 0)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("__len metamethod fires, zero-param handler safe (line 161)", () => {
    // The zero-param handler exercises the arg-count normalization in
    // CallLuauFunction — the table operand Lua passes to __len must
    // be DISCARDED, not stranded on the eval stack (where it was
    // mis-collected as the return value).
    const r = runConformanceSource(
      `local t = {}
setmetatable(t, { __len = function() return 42 end })
assert(#t == 42, "got " .. tostring(#t))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
