import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

describe("function a.f(...) — property-target function definition", () => {
  test("simplest: function a.f() ... end", () => {
    const r = runConformanceSource(`a = {}
function a.f () return 1 end
assert(a.f() == 1)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("with arg: function a.f(p)", () => {
    const r = runConformanceSource(`a = {}
function a.f (p) return p + 1 end
assert(a.f(5) == 6)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("multiple args: function a.f(p, q)", () => {
    const r = runConformanceSource(`a = {}
function a.f (p, q) return p * q end
assert(a.f(3, 4) == 12)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("multi-level: function a.b.c.f(p)", () => {
    const r = runConformanceSource(`a = {b = {c = {}}}
function a.b.c.f (p) return p * 2 end
assert(a.b.c.f(3) == 6)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("two methods on the same table", () => {
    const r = runConformanceSource(`a = {}
function a.f (p) return p + 1 end
function a.g (p) return p + 2 end
assert(a.f(5) == 6)
assert(a.g(5) == 7)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("equivalent to explicit a.f = function() form", () => {
    const r = runConformanceSource(`a = {}
a.f = function () return 1 end
assert(a.f() == 1)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});

describe("colon form: function a:m(...) self-bound", () => {
  test("self is bound to the receiver", () => {
    const r = runConformanceSource(`a = {}
function a:m () return self end
local r = a:m()
assert(r == a)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("self.property reads the receiver's field", () => {
    const r = runConformanceSource(`a = {i = 10}
function a:m () return self.i end
assert(a:m() == 10)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("self + user arg (calls.luau line 36 pattern)", () => {
    const r = runConformanceSource(`a = {i = 10}
function a:x (x) return x + self.i end
assert(a:x(1) == 11)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("multiple methods on the same table, both colon-form", () => {
    const r = runConformanceSource(`a = {n = 100}
function a:get () return self.n end
function a:set (v) self.n = v end
assert(a:get() == 100)
a:set(42)
assert(a:get() == 42)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
