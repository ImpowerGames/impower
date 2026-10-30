import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

describe("locals shadow same-named globals", () => {
  test("simple shadow: local x = 1 over global x = 2", () => {
    const r = runConformanceSource(`x = 2
do
  local x = 1
  assert(x == 1)
end
assert(x == 2)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("local function shadows global of same name (no recursion)", () => {
    const r = runConformanceSource(`g = false
do
  local function g() return 42 end
  assert(g() == 42)
end
assert(g == false)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("local function self-recursion with same-named outer global", () => {
    const r = runConformanceSource(`g = false
do
  local function g(n) if n==0 then return 1 else return g(n-1) end end
  assert(g(3) == 1)
end
assert(g == false)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("calls.luau line 21-31 shape: fact = false + local function fact", () => {
    const r = runConformanceSource(`fact = false
do
  local res = 1
  local function fact (n)
    if n==0 then return res
    else return n*fact(n-1)
    end
  end
  assert(fact(5) == 120)
end
assert(fact == false)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: write to existing global (no local in scope) still hits global", () => {
    const r = runConformanceSource(`x = 1
x = 5
assert(x == 5)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: temps with no same-named global still work", () => {
    const r = runConformanceSource(`local x = 7
assert(x == 7)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
