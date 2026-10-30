import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

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
    const r = runConformanceSource(`assert(type{} == 'table')
assert(type"x" == 'string')
assert(type'x' == 'string')`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: type Foo = number still parses as type-alias", () => {
    const r = runConformanceSource(`type Foo = number
local x: Foo = 5
assert(x == 5)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
