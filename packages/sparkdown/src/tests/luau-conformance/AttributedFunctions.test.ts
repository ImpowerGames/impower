// A function written with attributes (`@native`, `@checked`) runs as the
// same function without them. The attributes are nodes of their own before
// the function's in the syntax tree, while the converter's AST includes them
// in the function, so the compiler finds the function's own node after them
// (#1287).

import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

describe("an attributed function runs", () => {
  test.each([
    ["a named function", "@native function f() return 7 end\nassert(f() == 7)\n"],
    [
      "a local function with a typed parameter",
      "@checked local function f(x: number) return x + 1 end\nassert(f(6) == 7)\n",
    ],
    ["an attribute on the line before", "@native\nfunction f() return 7 end\nassert(f() == 7)\n"],
    ["a function value", "local f = @native function() return 7 end\nassert(f() == 7)\n"],
    [
      "a function value inside a function",
      "local function g()\n  local f = @native function() return 7 end\n  return f()\nend\nassert(g() == 7)\n",
    ],
    // A comment between the attribute and the function is trivia to Luau.
    ["a line comment after the attribute", "@native -- note\nfunction f() return 7 end\nassert(f() == 7)\n"],
    ["a block comment after the attribute", "@native --[[ note ]] function f() return 7 end\nassert(f() == 7)\n"],
    [
      "a block comment before a local function",
      "@checked --[[ note ]] local function f(x: number) return x + 1 end\nassert(f(6) == 7)\n",
    ],
    [
      "a block comment before a function value",
      "local f = @native --[[ note ]] function() return 7 end\nassert(f() == 7)\n",
    ],
    [
      "a line comment before a function value",
      "local f = @native -- note\nfunction() return 7 end\nassert(f() == 7)\n",
    ],
    ["two attributes", "@native @checked function f() return 7 end\nassert(f() == 7)\n"],
    [
      "a property target",
      "local t = {}\n@native function t.f() return 7 end\nassert(t.f() == 7)\n",
    ],
    [
      "a method target",
      "local t = {x = 6}\n@native function t:f() return self.x + 1 end\nassert(t:f() == 7)\n",
    ],
    [
      "a variadic local function",
      "@native local function f(...) return ... end\nassert(f(7) == 7)\n",
    ],
  ])("%s", (_name, source) => {
    const r = runConformanceSource(source);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
