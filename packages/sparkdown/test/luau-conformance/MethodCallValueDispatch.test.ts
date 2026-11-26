import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

describe("user-defined method dispatch", () => {
  test("dot-form `a.method(args)`", () => {
    const r = runConformanceSource(`local a = { greet = function() return "hi" end }
local r = a.greet()
assert(r == "hi", "got " .. tostring(r))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("colon-form `a:method()` doesn't error at compile time", () => {
    const r = runConformanceSource(`local a = { mul = function(self, n) return n end }
local r = a:mul(42)`);
    expect(
      r.errorMessages.filter((e) => e.includes("target not found")),
    ).toEqual([]);
  });

  test("dot-form on indexed value `a[k].method()`", () => {
    const r = runConformanceSource(`local a = { [1] = { get = function() return "found" end } }
local r = a[1].get()
assert(r == "found", "got " .. tostring(r))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("stdlib namespace methods still route through builtin dispatch", () => {
    const r = runConformanceSource(`local r = math.floor(3.7)
assert(r == 3, "got " .. tostring(r))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("statement-position call discards return value", () => {
    const r = runConformanceSource(`local recorded = 0
local a = { record = function(v) recorded = v end }
a.record(42)
assert(recorded == 42, "got " .. tostring(recorded))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
