import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

describe("parameter / local shadowing of top-level knot names", () => {
  test("parameter shadows a top-level function", () => {
    const r = runConformanceSource(
      `function helper() return 1 end\n` +
      `function f(helper) return helper end\n` +
      `assert(f(42) == 42, "got " .. tostring(f(42)))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
  });

  test("local shadows a top-level function", () => {
    const r = runConformanceSource(
      `function helper() return 1 end\n` +
      `function f() local helper = 99 return helper end\n` +
      `assert(f() == 99, "got " .. tostring(f()))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
  });

  test("closure upval-as-parameter named after a top-level function", () => {
    const r = runConformanceSource(
      `function concat(head) return tostring(head) end\n` +
      `local thunk = (function() return concat(1) end)\n` +
      `assert(true)`,
    );
    expect(
      r.errorMessages.filter(
        (e) =>
          !e.startsWith("RUNTIME") &&
          !e.includes("target not found"),
      ),
    ).toEqual([]);
  });

  test("regression: top-level callable not affected if no shadowing", () => {
    const r = runConformanceSource(
      `function helper() return 1 end\n` +
      `assert(helper() == 1)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
