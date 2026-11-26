import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

describe("local-bound callable dispatch", () => {
  test("compile route: local user-fn called from inner closure", () => {
    const r = runConformanceSource(
      `function helper() return 7 end\n` +
      `assert((function() local h = helper function inner() return h() end return inner() end)() == 7)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("runtime: variable-divert dispatch on `__stdlib_fn` marker", () => {
    const r = runConformanceSource(
      `local abs = math.abs\nassert(abs(-5) == 5)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("runtime: stdlib_fn marker in an IIFE, called directly", () => {
    const r = runConformanceSource(
      `assert((function() local abs = math.abs return abs(-5) end)() == 5)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("runtime: stdlib_fn marker captured by inner closure (basic.luau-803)", () => {
    const r = runConformanceSource(
      `assert((function() local abs = math.abs function foo() return abs(-5) end return foo() end)() == 5)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: bare stdlib calls still work", () => {
    const r = runConformanceSource(
      `assert(math.abs(-7) == 7)\nassert(tostring(42) == "42")`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: top-level user function calls still work", () => {
    const r = runConformanceSource(
      `function helper(x) return x * 2 end\nassert(helper(3) == 6)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: variadic sibling SubFlow call still routes via Divert", () => {
    const r = runConformanceSource(
      `function foo(...) return ... end\n` +
      `function bar(...) return foo(...) end\n` +
      `assert(tostring(bar(1)) == "1")`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
