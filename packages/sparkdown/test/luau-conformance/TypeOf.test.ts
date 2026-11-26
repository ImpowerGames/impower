import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

describe("type(v) reports 'function' for callable values", () => {
  test("type(type) == 'function'", () => {
    const r = runConformanceSource(
      `assert(type(type) == 'function', "got " .. type(type))`,
    );
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("type(assert) == 'function'", () => {
    const r = runConformanceSource(
      `assert(type(assert) == 'function', "got " .. type(assert))`,
    );
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("type(print) == 'function'", () => {
    const r = runConformanceSource(
      `assert(type(print) == 'function', "got " .. type(print))`,
    );
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("type(assert) == type(print) (both 'function')", () => {
    const r = runConformanceSource(`assert(type(assert) == type(print))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("type(user_named_fn) == 'function' (symbol value branch)", () => {
    const r = runConformanceSource(`local function f() end
assert(type(f) == 'function', "got " .. type(f))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("type(anon_fn_local) == 'function' (closure-ObjectValue branch)", () => {
    const r = runConformanceSource(`local x = 1
local f = function() return x end
assert(type(f) == 'function', "got " .. type(f))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: type Foo = number still parses as type alias", () => {
    const r = runConformanceSource(`type Foo = number
local x: Foo = 5
assert(x == 5)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
