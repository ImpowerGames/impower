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
  ])("%s", (_name, source) => {
    const r = runConformanceSource(source);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
