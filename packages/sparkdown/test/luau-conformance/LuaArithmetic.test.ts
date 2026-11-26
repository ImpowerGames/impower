import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

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
