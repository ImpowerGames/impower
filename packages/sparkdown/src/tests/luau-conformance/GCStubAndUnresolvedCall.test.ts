import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

describe("collectgarbage / gcinfo no-op", () => {
  test("collectgarbage() returns 0 and doesn't error", () => {
    const r = runConformanceSource(
      `collectgarbage()\nassert(collectgarbage("count") == 0)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("gcinfo() returns 0 and doesn't error", () => {
    const r = runConformanceSource(
      `assert(gcinfo() == 0)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("sprinkled collectgarbage calls between asserts", () => {
    const r = runConformanceSource(
      `assert(1 == 1)\ncollectgarbage()\nassert(2 == 2)\ncollectgarbage("collect")\nassert(3 == 3)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});

describe("unresolved CALL target → runtime variable-divert", () => {
  test("unreachable unknown global compiles cleanly", () => {
    const r = runConformanceSource(
      `function helper() return 1 end\n` +
      `if false then\n` +
      `  unknown_global()\n` +
      `end\n` +
      `assert(helper() == 1)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("reachable unknown global produces runtime error, not compile-time", () => {
    const r = runConformanceSource(`unknown_global()`);
    const compileErr = r.errorMessages.find(
      (e) => !e.startsWith("RUNTIME") && !e.includes("Can't use a divert target"),
    );
    expect(compileErr).toBeUndefined();
  });

});
