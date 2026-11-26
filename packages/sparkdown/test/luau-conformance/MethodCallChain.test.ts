import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

describe("method-call chain followed by property access", () => {
  const compileNoDesync = (src: string) => {
    const r = runConformanceSource(src);
    return r.errorMessages.filter(
      (e) =>
        !e.startsWith("RUNTIME") &&
        !e.includes("target not found: `-> add`") &&
        !e.includes("target not found: `-> map`"),
    );
  };

  test("a:m(x).y in do block — subsequent fn declaration stays nested", () => {
    const compileErrs = compileNoDesync(`do
  local a = { x = 10, add = function(self, n) return self end }
  local r = a:add(10).x
end
function marker() return 1 end
marker()`);
    expect(compileErrs).toEqual([]);
  });

  test("a:m()[i] indexer-after-method — no desync of trailing code", () => {
    const compileErrs = compileNoDesync(`local a = { add = function(self) return { 1, 2, 3 } end }
local r = a:add()[2]
function marker() return 1 end
marker()`);
    expect(compileErrs).toEqual([]);
  });

  test("bracket-key table literal still parses", () => {
    const r = runConformanceSource(`local t = { ["name"] = "Anon", ["score"] = 42 }
assert(rawget(t, "name") == "Anon")
assert(rawget(t, "score") == 42)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});

describe("Lua single-arg call sugar (`f[[...]]`, `f\"...\"`, `f{...}`)", () => {
  test("loadstring with long-string arg followed by next line", () => {
    const r = runConformanceSource(`local f = loadstring[[ return 1 ]]
local x = 2
assert(x == 2)`);
    expect(r.errorMessages.filter((e) => !e.startsWith("RUNTIME"))).toEqual([]);
  });

  test("`f{...}` table-literal arg compiles without desync", () => {
    const r = runConformanceSource(`local function f(t) return t end
local r = f{10, 20, 30}
local marker = 1`);
    expect(r.errorMessages.filter((e) => !e.startsWith("RUNTIME"))).toEqual([]);
  });

  test("`f\"...\"` single-string arg compiles without desync", () => {
    const r = runConformanceSource(`local function f(s) return s end
local r = f"hello"
local marker = 1`);
    expect(r.errorMessages.filter((e) => !e.startsWith("RUNTIME"))).toEqual([]);
  });
});

describe("block-form `if ... end` doesn't desync the parse", () => {
  test("inline block-form `if ... else ... end` compiles cleanly", () => {
    const r = runConformanceSource(`local function f()
  local a = 0
  if a then a = 1 else a = 2 end
  return a
end
local marker = 1`);
    expect(r.errorMessages.filter((e) => !e.startsWith("RUNTIME"))).toEqual([]);
  });

  test("inline block-form `if ... end` (no else) compiles cleanly", () => {
    const r = runConformanceSource(`local function f()
  if true then return 1 end
  return 0
end
local marker = 1`);
    expect(r.errorMessages.filter((e) => !e.startsWith("RUNTIME"))).toEqual([]);
  });
});
