import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

describe("_G globals table", () => {
  test("dot write, bracket read (basic.luau line 48)", () => {
    const r = runConformanceSource(
      `assert((function() _G.foo = 1 return _G['foo'] end)() == 1)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("bracket write, dot read (basic.luau line 49)", () => {
    const r = runConformanceSource(
      `assert((function() _G['bar'] = 1 return _G.bar end)() == 1)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("reading an absent global through _G is nil", () => {
    const r = runConformanceSource(
      `assert(_G['nope'] == nil)\nassert(_G.alsonope == nil)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("_G reads the global even when a local shadows it", () => {
    const r = runConformanceSource(
      `g = 7
local function f()
  local g = 99
  return _G.g
end
assert(f() == 7, "got " .. tostring(f()))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("_G write is visible as a plain global read", () => {
    const r = runConformanceSource(
      `_G.score = 42\nassert(score == 42, "got " .. tostring(score))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("plain global write is visible through _G", () => {
    const r = runConformanceSource(
      `lives = 3\nassert(_G.lives == 3)\nassert(_G['lives'] == 3)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("dynamic key through _G", () => {
    const r = runConformanceSource(
      `hp = 11
local key = "hp"
assert(_G[key] == 11)
_G[key] = 12
assert(hp == 12, "got " .. tostring(hp))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("type(_G) is table", () => {
    const r = runConformanceSource(`assert(type(_G) == "table")`);
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
