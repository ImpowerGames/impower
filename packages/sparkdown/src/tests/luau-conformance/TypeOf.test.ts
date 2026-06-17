import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// `type(v)` / `typeof(v)` should report "function" for callable
// values (DivertTargetValue for bare knot references, closure-shaped
// ObjectValues for anonymous functions with upvalues, and the
// stdlib-fn sentinel for bare-name stdlib references like `type`,
// `assert`, `print`).
//
// Two-part fix landed for these:
//   - `luauTypeOf` extended to return "function" for DivertTargetValue,
//     VariablePointerValue, closure-ObjectValue (`__closure_fn` tag),
//     and the new stdlib-fn sentinel (`__stdlib_fn` tag).
//   - Story.ts runtime variable-lookup fallback: when the name isn't
//     a real variable or a knot but IS a known stdlib function,
//     push a `__stdlib_fn`-tagged ObjectValue so the type-of check
//     succeeds. (Calling the marker is a separate, future fix.)
//   - Grammar's `LuauDataTypeDeclaration` now requires whitespace +
//     an identifier after `type` (the type-alias name) so bare
//     `type` in expression position reaches the variable-lookup
//     path instead of being misparsed as a type declaration.

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

  test("type(user_named_fn) == 'function' (DivertTargetValue branch)", () => {
    // Bare-knot reference resolves to a DivertTargetValue at runtime.
    // Previously `type(f)` returned "userdata" — now correctly
    // returns "function".
    const r = runConformanceSource(`local function f() end
assert(type(f) == 'function', "got " .. type(f))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("type(anon_fn_local) == 'function' (closure-ObjectValue branch)", () => {
    // An anonymous fn captures via upvals — lowers to a closure-shaped
    // ObjectValue with a `__closure_fn` key.
    const r = runConformanceSource(`local x = 1
local f = function() return x end
assert(type(f) == 'function', "got " .. type(f))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: type Foo = number still parses as type alias", () => {
    // The grammar lookahead now requires `type` to be followed by
    // whitespace + an identifier (the alias being declared). Make
    // sure that didn't accidentally drop the type-declaration form.
    const r = runConformanceSource(`type Foo = number
local x: Foo = 5
assert(x == 5)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
