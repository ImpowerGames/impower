import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

describe("inner closure references a variadic sibling SubFlow", () => {
  test("variadic top-level fn called from inside an IIFE", () => {
    const r = runConformanceSource(
      `function concat(head, ...) return tostring(head) end\n` +
      `assert((function() function foo(...) return ... end return concat(foo(1, 2, 3)) end)() == "1")`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("variadic sibling-of-sibling call", () => {
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

  test("regression: non-variadic top-level fn referenced from IIFE", () => {
    const r = runConformanceSource(
      `function helper() return 42 end\n` +
      `assert((function() return helper() end)() == 42)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: local-bound closure still captures locals", () => {
    const r = runConformanceSource(
      `assert((function() local fn = function() return 99 end return (function() return fn() end)() end)() == 99)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
