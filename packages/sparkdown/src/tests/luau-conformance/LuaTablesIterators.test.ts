import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// Table + iterator semantics (basic.luau lines 219-328):
//
//   - nil entries don't EXIST: constructors drop them (EndObject),
//     later duplicate fields assigning nil DELETE earlier values,
//     and `t[k] = nil` removes the key (StoreIndex).
//   - ipairs stops at the first nil VALUE, not just a missing key.
//   - `pairs(t)` / `ipairs(t)` return Lua's full iterator triple
//     `(fn, state, control)`; the builtin-iterator dispatch honors
//     explicitly-passed (state, control), making manual invocation
//     work: `local inext = ipairs(t)` then `inext(t, 2)`.
//   - `for k in next, t do` works: the generic-for lowerer splits the
//     post-`in` expression list on commas, calls the iterator via
//     CallValueExpression (carries the call-site arg count so the
//     VARIADIC stdlib `next` can dispatch as a first-class value).
//   - Computed bracket keys `{[1+2] = 4}` evaluate at runtime
//     (readStaticBracketKey only accepts single-literal brackets).

describe("nil entries don't exist", () => {
  test("constructor gaps (basic.luau lines 224-226)", () => {
    const r = runConformanceSource(
      `local t = {5, 6, 7, nil, 8}
assert(t[3] == 7)
assert(t[4] == nil)
assert(t[5] == 8)
local a = ''
for k in ipairs(t) do a = a .. k end
assert(a == "123", "got " .. a)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("pairs skips constructor gaps (lines 238-240)", () => {
    const r = runConformanceSource(
      `local a = ''
for k in pairs({5, 6, 7, nil, 8}) do a = a .. k end
assert(a == "1235", "got " .. a)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("duplicate fields assign left-to-right; nil deletes (lines 327-328)", () => {
    const r = runConformanceSource(
      `assert((function() local t = {data = 4, data = nil, data = 42} return t.data end)() == 42)
assert((function() local t = {data = 4, data = nil, data = 42, data = nil} return t.data end)() == nil)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("t[k] = nil deletes the key", () => {
    const r = runConformanceSource(
      `local t = {x = 1, y = 2}
t.x = nil
local a = ''
for k in pairs(t) do a = a .. k end
assert(a == "y", "got " .. a)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});

describe("iterator protocol", () => {
  test("manual ipairs iterator invocation (basic.luau lines 229-230)", () => {
    const r = runConformanceSource(
      `function concat(head, ...) if select('#', ...) == 0 then return tostring(head) else return tostring(head) .. "," .. concat(...) end end
local inext = ipairs({5,6,7})
assert(concat(inext({5,6,7}, 2)) == "3,7", "got " .. concat(inext({5,6,7}, 2)))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("for k,v in next, t (lines 253-258)", () => {
    const r = runConformanceSource(
      `local a = ''
for k in next,{5, 6, 7} do a = a .. k end
assert(a == "123", "got " .. a)
local s = ''
for k,v in next,{5, 6, 7} do s = s .. v end
assert(s == "567", "got " .. s)
local t = {}
for k,v in next,{a=1, b=2, c=3} do t[k] = v end
assert(t.a + t.b + t.c == 6)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: pairs/ipairs loops and closure iterators still work", () => {
    const r = runConformanceSource(
      `local a = ''
for k, v in ipairs({9, 8, 7}) do a = a .. k .. v end
assert(a == "192837", "got " .. a)
local function range(n)
  local i = 0
  return function() i = i + 1 if i <= n then return i end end
end
local s = 0
for x in range(4) do s = s + x end
assert(s == 10)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});

describe("computed table keys", () => {
  test("{[1+2] = 4} evaluates the key at runtime (line 293)", () => {
    const r = runConformanceSource(
      `local t = {[1+2] = 4}
assert(t[3] == 4)
local k = "dy"
local u = {[k .. "n"] = 9}
assert(u.dyn == 9)
local s = {["lit"] = 1}
assert(s.lit == 1)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
