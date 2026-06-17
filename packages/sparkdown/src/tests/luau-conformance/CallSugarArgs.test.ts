import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// Lua/Luau call sugar: `f{...}` and `f"..."` are single-arg calls
// equivalent to `f({...})` / `f("...")`. The grammar absorbs the
// table/string as a body child of LuauFunctionCall (instead of
// wrapping it in LuauFunctionCallParameters). The lowerer now picks
// up these sugar shapes and threads them as the single arg.
//
// Previously dropped silently — `f{}` lowered as `f()` (zero args),
// triggering arity / cast mismatches downstream. The `type` keyword
// also needed a grammar fix: its negative lookahead only excluded
// `type(...)` for stdlib dispatch — `type{...}` slipped through to
// `LuauDataTypeDeclaration` instead.

describe("call-sugar arg shapes", () => {
  test("f{} — empty-table call sugar on user fn", () => {
    const r = runConformanceSource(`local function f(t) return type(t) end
assert(f{} == 'table')`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("f{a=1, b=2} — keyed-table call sugar", () => {
    const r = runConformanceSource(`local function f(t) return t.a + t.b end
assert(f{a=1, b=2} == 3)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("f'hello' — string call sugar on user fn", () => {
    const r = runConformanceSource(`local function id(x) return x end
assert(id'hello' == 'hello')`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test('f"hello" — double-quoted string call sugar', () => {
    const r = runConformanceSource(`local function id(x) return x end
assert(id"hello" == "hello")`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("type{} — stdlib call with table sugar (was DataTypeDeclaration)", () => {
    // The `type` Luau keyword is a soft keyword — type-alias at
    // statement scope (`type Foo = number`), stdlib fn at expression
    // scope (`type(v)` / `type{}`). The DataTypeDeclaration rule's
    // negative lookahead must reject ALL call-sugar shapes — `(`,
    // `{`, `"`, `'`, `[[` — not just `(`.
    const r = runConformanceSource(`assert(type{} == 'table')
assert(type"x" == 'string')
assert(type'x' == 'string')`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: type Foo = number still parses as type-alias", () => {
    // Make sure tightening the lookahead didn't accidentally drop
    // the type-declaration form.
    const r = runConformanceSource(`type Foo = number
local x: Foo = 5
assert(x == 5)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
