// Sparkdown-specific: the rules that read a function's locals and
// reachability (LocalUnused, PlaceholderRead, UnreachableCode) read every
// Luau function a script holds, a function value as well as a function
// definition, wherever it is written (in a `define` too, a method
// included), and each once;
// and, as Luau's linter does, both arms of an `if` for unreachable code. The
// rules are implemented in `compiler/lint/collectLuauLints.ts`.

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

  test("a function value in a define's property", () => {
    expect(functionLints("define hero as character with\n  callback = function()\n    local unused = 1\n    return _\n  end\nend\nHi.\n")).toEqual([
      "2:10 LocalUnused",
      "3:11 PlaceholderRead",
    ]);
  });

  // A method is a function whose `function` Sparkdown leaves implicit; the
  // tree lints did not read it as one.
  test("a method in a define", () => {
    expect(functionLints("define hero as character with\n  greet(): number\n    local u = 1\n    return 1\n  end\nend\nHi.\n")).toEqual(["2:10 LocalUnused"]);
  });
});

describe("the arms of an if", () => {
  test("the else arm is read for its own unreachable statements when the then arm falls through", () => {
    expect(functionLints('function f(flag)\n  if flag then\n    print("ok")\n  else\n    do return end\n    print("dead")\n  end\nend\n')).toEqual([
      "5:4 UnreachableCode",
    ]);
  });
});
