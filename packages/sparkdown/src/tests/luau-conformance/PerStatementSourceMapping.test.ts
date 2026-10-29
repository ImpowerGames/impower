import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

describe("per-statement debug metadata at runtime", () => {
  test("error() at user line 1 reports line 1", () => {
    const r = runConformanceSource(`error("oops")`, undefined, "smoke");
    expect(
      r.errorMessages.find((e) => e.includes("smoke:1: oops")),
    ).toBeDefined();
  });

  test("error() at user line 3 reports line 3", () => {
    const r = runConformanceSource(
      `local x = 1\nlocal y = 2\nerror("oops")`,
      undefined,
      "smoke",
    );
    expect(
      r.errorMessages.find((e) => e.includes("smoke:3: oops")),
    ).toBeDefined();
  });

  test("error() at user line 5 reports line 5", () => {
    const r = runConformanceSource(
      `local a = 1\nlocal b = 2\nlocal c = 3\nlocal d = 4\nerror("oops")`,
      undefined,
      "smoke",
    );
    expect(
      r.errorMessages.find((e) => e.includes("smoke:5: oops")),
    ).toBeDefined();
  });

  test("error() at user line 10 reports line 10", () => {
    const r = runConformanceSource(
      `local a = 1\nlocal b = 2\nlocal c = 3\nlocal d = 4\nlocal e = 5\n` +
      `local f = 6\nlocal g = 7\nlocal h = 8\nlocal i = 9\nerror("oops")`,
      undefined,
      "smoke",
    );
    expect(
      r.errorMessages.find((e) => e.includes("smoke:10: oops")),
    ).toBeDefined();
  });

  test("pcall captures the error()'s precise source line", () => {
    const r = runConformanceSource(
      `local ok, err = pcall(function() error("oops") end)\n` +
      `assert(err == "basic.luau:1: oops", "got " .. tostring(err))`,
      undefined,
      "basic.luau",
    );
    expect(
      r.errorMessages.filter(
        (e) => !e.startsWith("RUNTIME") && !e.includes("Can't use a divert target"),
      ),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});

describe("Temp shadows parameter (Luau spec)", () => {
  test("function f(b) local b = ... end compiles cleanly", () => {
    const r = runConformanceSource(
      `function f(b) local b = 99 return b end\nassert(f(1) == 99)`,
    );
    expect(
      r.errorMessages.filter(
        (e) => !e.startsWith("RUNTIME") && !e.includes("Can't use a divert target"),
      ),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("inner local shadows param in nested block", () => {
    const r = runConformanceSource(
      `function f(b)\n  if b == 1 then local b = 100 return b end\n  return b\nend\nassert(f(1) == 100)\nassert(f(2) == 2)`,
    );
    expect(
      r.errorMessages.filter(
        (e) => !e.startsWith("RUNTIME") && !e.includes("Can't use a divert target"),
      ),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});

describe("Divert.Error forwards isWarning flag", () => {
  test("a function value passed through a Divert ancestor raises no error", () => {
    const r = runConformanceSource(
      `local function noinline(x, ...) local s, r = pcall(function(y) return y end, x) return r end\nassert(noinline(42) == 42)`,
    );
    expect(
      r.errorMessages.filter(
        (e) => !e.startsWith("RUNTIME"),
      ),
    ).toEqual([]);
  });
});
