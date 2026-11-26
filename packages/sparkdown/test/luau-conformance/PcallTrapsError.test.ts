import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

describe("pcall traps `error()` calls", () => {
  test("pcall returns (false, msg) when callee calls error", () => {
    const r = runConformanceSource(
      `local ok, err = pcall(function() error("oops") end)\n` +
      `assert(ok == false, "ok = " .. tostring(ok))\n` +
      `assert(err == "oops" or (type(err) == "string" and err:find("oops")), "err = " .. tostring(err))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("pcall returns 2 values from select's perspective when error raises", () => {
    const r = runConformanceSource(
      `local n = select('#', pcall(function() error("oops") end))\n` +
      `assert(n == 2, "n=" .. tostring(n))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("execution continues after a trapped error", () => {
    const r = runConformanceSource(
      `pcall(function() error("ignored") end)\n` +
      `assert(true, "never reached if pcall corrupted state")`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: error() outside pcall still propagates as a runtime error", () => {
    const r = runConformanceSource(`error("oops")`);
    expect(
      r.errorMessages.some(
        (e) => e.startsWith("RUNTIME") && e.includes("oops"),
      ),
    ).toBe(true);
  });

  test("pcall over a successful callee returns (true, ...returns)", () => {
    const r = runConformanceSource(
      `local ok, a, b = pcall(function() return 1, 2 end)\n` +
      `assert(ok == true)\n` +
      `assert(a == 1 and b == 2, "a=" .. tostring(a) .. " b=" .. tostring(b))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
