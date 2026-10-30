import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

describe("error message format (test-suite prefix)", () => {
  test("error() message includes fixture-name prefix", () => {
    const r = runConformanceSource(
      `local ok, err = pcall(function() error("oops") end)\n` +
      `assert(err:find("basic.luau:%d+: oops") ~= nil, "got " .. tostring(err))`,
      undefined,
      "basic.luau",
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("default fixture name is 'main'", () => {
    const r = runConformanceSource(
      `local ok, err = pcall(function() error("oops") end)\n` +
      `assert(err:find("main:%d+: oops") ~= nil, "got " .. tostring(err))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("concat(pcall(...)) produces full Luau-format output", () => {
    const r = runConformanceSource(
      `function concat(head, ...) if select('#', ...) == 0 then return tostring(head) else return tostring(head) .. "," .. concat(...) end end\n` +
      `local s = concat(pcall(function() error("oops") end))\n` +
      `assert(s:find("false,basic.luau:%d+: oops") ~= nil, "got " .. s)`,
      undefined,
      "basic.luau",
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: empty source preserves prefix safety (no crash)", () => {
    const r = runConformanceSource(`error("oops")`, undefined, "smoke.sd");
    expect(
      r.errorMessages.some(
        (e) => e.includes("smoke.sd:") && e.includes("oops"),
      ),
    ).toBe(true);
  });
});
