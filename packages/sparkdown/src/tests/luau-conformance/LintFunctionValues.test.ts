// Sparkdown-specific: the rules that read a function's locals and
// reachability (LocalUnused, PlaceholderRead, UnreachableCode) read every
// Luau function a script holds, a function value as well as a function
// definition, wherever it is written, and each once. The rules are
// implemented in `compiler/lint/collectLuauLints.ts`.

import { describe, expect, test } from "vitest";
import { diagnoseDetailed } from "./diagnosticTestHarness";

const FUNCTION_RULES = new Set(["LocalUnused", "PlaceholderRead", "UnreachableCode"]);

/** The function rules' warnings for a document, as `line:character code`. */
function functionLints(source: string): string[] {
  return diagnoseDetailed(source)
    .filter((d) => FUNCTION_RULES.has(String(d.code)))
    .map((d) => `${d.range!.start.line}:${d.range!.start.character} ${String(d.code)}`);
}

describe("the functions the rules read", () => {
  test("a function value assigned at the top level", () => {
    expect(functionLints("local f = function()\n  local unused = 1\n  return _\n  print(2)\nend\n")).toEqual([
      "1:8 LocalUnused",
      "2:9 PlaceholderRead",
      "3:2 UnreachableCode",
    ]);
  });

  test("a function value passed as an argument", () => {
    expect(functionLints("& print(function()\n  local unused = 1\nend)\n")).toEqual(["1:8 LocalUnused"]);
  });

  test("a function definition and a function value in a scene, each read once", () => {
    expect(
      functionLints("scene alpha\n  function helper()\n    local unused = 1\n  end\n  & local g = function()\n    local other = 2\n  end\n  Alpha waits.\nend\n"),
    ).toEqual(["2:10 LocalUnused", "5:10 LocalUnused"]);
  });
});
