import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// Lua/Luau allows declaring functions directly onto a table:
//   `function a.f(p) BODY end`  → desugars to `a.f = function(p) BODY end`
//   `function a:m(p) BODY end`  → desugars to `a.m = function(self, p) BODY end`
//
// The grammar's `LuauFunctionDeclarationName` has a negative lookahead
// `(?!{{LUAU_ACCESSOR_OPERATOR}})` that rejects dotted/colon names, so
// these forms parse with the name as a `LuauAccessPath` child of the
// function definition instead. Previously the lowerer returned an
// empty block when it didn't find a `LuauFunctionDeclarationName`,
// silently dropping the declaration — calling `a.f(...)` at the
// runtime then failed with "Tried to call a non-function value as a
// function (got )" because `a.f` was nil.
//
// Lowerer now detects the LuauAccessPath child, builds an anonymous
// synthetic Function (pushed as a subFlow of the enclosing scope),
// and emits a StorePropertyAssignment writing the closure DivertTarget
// into the table key.
//
// Limitations of this initial version:
//   - Upval capture: no closure wrapper (just a bare DivertTarget),
//     so outer locals referenced from the body don't update if
//     reassigned after the declaration. Acceptable for the common
//     "declare a method on a table" pattern.
//
// The colon form's `self.property` lookups were initially broken
// because the access-path lowerer's LuauVariable case only checked
// LuauVariableName / LuauStdLibConstants / LuauStdLibGlobals — but
// the grammar tags `self` as `LuauSelfKeyword`. Fixed by adding
// `LuauSelfKeyword` to the lookup list in both `lowerSimpleAccessPath`
// and `lowerValueChainAccessPath`. See the `colon form` tests below.

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
    // Regression guard: the explicit form still works and produces
    // the same observable behavior.
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
    // `function a:x (x) return x + self.i end`
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
