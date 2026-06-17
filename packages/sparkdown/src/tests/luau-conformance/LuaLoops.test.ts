import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// Loop semantics (basic.luau lines 163-215):
//
//   - GRAMMAR: `while`/`for` loops close immediately after their
//     do-block's `end` (`(?<=\bend)` end-pattern alternative), so a
//     one-line `while c do BODY end return x` no longer swallows the
//     trailing statements; `until <cond>` terminates at
//     statement-boundary keywords and bare reassignments.
//   - Numeric for drives a HIDDEN index (`__forIdx_*`); the user
//     variable is a fresh copy each iteration, so body writes to it
//     can't affect iteration (line 188).
//   - Direction check is `step > 0` forward, otherwise backward —
//     zero and nan steps take the backward branch (`for i=10,1,0`
//     iterates; `for i=1,10,0/0` doesn't), and a nan INDEX exits
//     (both comparisons false). Lines 194-215.
//   - `scanFreeVariables` binds only the loop TARGETS, not names in
//     the start/stop/step expressions — `local z = 0` + an IIFE with
//     `for i=10,1,z` must capture z as an upvalue (lines 196-197).
//   - `nan` and `inf` are ordinary IDENTIFIERS (the grammar literals
//     were removed) — `local nan = tonumber("nan")` declares a
//     variable (line 201).
//   - Infinity/NaN survive the story-JSON round trip via "inff" /
//     "-inff" / "nanf" string markers (SimpleJson.WriteFloat +
//     JsonSerialisation) — `math.huge` constants compile to real
//     Infinity instead of the old 3.4e38 clamp (lines 214-215).

describe("one-line loop statements", () => {
  test("one-line while + trailing return (basic.luau line 164)", () => {
    const r = runConformanceSource(
      `assert((function() local a = 10 local b = 1 while a > 1 do b = b * 2 a = a - 1 end return b end)() == 512)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("one-line repeat-until + trailing return (line 165)", () => {
    const r = runConformanceSource(
      `assert((function() local a = 10 local b = 1 repeat b = b * 2 a = a - 1 until a == 1 return b end)() == 512)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("one-line numeric for + trailing return (line 178)", () => {
    const r = runConformanceSource(
      `assert((function() local a = 1 for b=1,9 do a = a * 2 end return a end)() == 512)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});

describe("numeric for: hidden index + Luau direction semantics", () => {
  test("assigning the loop variable doesn't affect iteration (line 188)", () => {
    const r = runConformanceSource(
      `assert((function() local a = 1 for b=9,1,-2 do a = a * 2 b = nil end return a end)() == 32)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("zero step iterates backward (lines 194-197)", () => {
    const r = runConformanceSource(
      `assert((function() local c = 0 for i=1,10,0 do c += 1 if c > 10 then break end end return c end)() == 0)
assert((function() local c = 0 for i=10,1,0 do c += 1 if c > 10 then break end end return c end)() == 11)
local zero = tonumber("0")
assert((function() local c = 0 for i=1,10,zero do c += 1 if c > 10 then break end end return c end)() == 0)
assert((function() local c = 0 for i=10,1,zero do c += 1 if c > 10 then break end end return c end)() == 11)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("nan limits and steps (lines 201-211)", () => {
    const r = runConformanceSource(
      `local nan = tonumber("nan")
assert((function() local c = 0 for i=1,0/0 do c += 1 end return c end)() == 0)
assert((function() local c = 0 for i=1,nan do c += 1 end return c end)() == 0)
assert((function() local c = 0 for i=1,10,0/0 do c += 1 end return c end)() == 0)
assert((function() local c = 0 for i=10,1,0/0 do c += 1 end return c end)() == 1)
assert((function() local c = 0 for i=10,1,nan do c += 1 end return c end)() == 1)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("index turning nan mid-iteration exits (lines 214-215, math.huge)", () => {
    const r = runConformanceSource(
      `assert((function() local c = 0 for i=-math.huge,0,math.huge do c += 1 end return c end)() == 1)
assert((function() local c = 0 for i=math.huge,math.huge,-math.huge do c += 1 end return c end)() == 1)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});

describe("upvalue capture from for-loop header expressions", () => {
  test("step expression referencing an outer local captures it (lines 196-197)", () => {
    const r = runConformanceSource(
      `local z = 0
assert((function() local c = 0 for i=10,1,z do c += 1 if c > 10 then break end end return c end)() == 11)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});

describe("nan / inf are ordinary identifiers", () => {
  test("local variables named nan and inf work", () => {
    const r = runConformanceSource(
      `local nan = tonumber("nan")
assert(tostring(nan) == "nan", "got " .. tostring(nan))
local inf = 1 / 0
assert(inf > 0)
assert((function() return tostring(nan) end)() == "nan")`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});

describe("Infinity/NaN survive the story-JSON round trip", () => {
  test("math.huge compiles to true Infinity (not 3.4e38)", () => {
    const r = runConformanceSource(
      `assert(tostring(math.huge) == "inf", "got " .. tostring(math.huge))
assert(tostring(-math.huge) == "-inf")
assert(math.huge > 3.4e38)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
