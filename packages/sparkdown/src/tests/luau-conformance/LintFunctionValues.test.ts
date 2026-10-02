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

// A type name, or a structural word the grammar reads as a keyword
// (`style`), uses the local it names only where that local is in scope,
// and names the innermost one, as Luau binds a name.
describe("the local a type name or a structural word names", () => {
  test.each([
    ["a type name after the local's block has closed", "function f()\n  do\n    local number = 1\n  end\n  local x: number = 2\n  return x\nend\n", ["2:10 LocalUnused"]],
    [
      "a type name that an inner local of the same name shadows",
      "function f()\n  local number = 1\n  do\n    local number = 2\n    local x: number = 3\n    return x\n  end\nend\n",
      ["1:8 LocalUnused"],
    ],
    ["a structural word after the local's block has closed", "function f()\n  do\n    local style = {}\n  end\n  setStyle(style)\nend\n", ["2:10 LocalUnused"]],
    ["a type name in the local's scope", "function f()\n  local number = 1\n  local x: number = 2\n  return x\nend\n", []],
    // A `repeat` body's locals stay in scope through its `until` condition.
    ["a type name in the until of the local's repeat", "function f()\n  repeat\n    local number = 1\n  until (2 :: number) == 2\nend\n", []],
    // A local is not in scope in its own statement, as in `local x = x + 1`.
    ["a type name in the local's own annotation", "function f()\n  local number: number = 1\nend\n", ["1:8 LocalUnused"]],
    ["a structural word in the local's own initializer", "function f()\n  local style = setStyle(style)\nend\n", ["1:8 LocalUnused"]],
    // A local function's name is in scope from its body, after its signature.
    ["a type name in a local function's signature naming an outer local", "function f()\n  local Foo = {}\n  local function Foo(x: Foo)\n    return x\n  end\n  return Foo\nend\n", []],
    ["a type name after the local's repeat", "function f()\n  repeat\n    local number = 1\n  until true\n  local x: number = 2\n  return x\nend\n", ["2:10 LocalUnused"]],
    // A `const` declares a global constant; a read of its name reads the local of that name in scope.
    ["a read of a name a later const also declares", "Value {f()} {n}.\nfunction f()\n  local n = 1\n  const n = 2\n  return n\nend\n", []],
    ["a plain write to a name a later const also declares", "Value {f()} {n}.\nfunction f()\n  local n = 1\n  const n = 2\n  n = 3\nend\n", ["2:8 LocalUnused"]],
  ])("%s", (_name, source, expected) => {
    expect(functionLints(source).filter((lint) => lint.endsWith("LocalUnused"))).toEqual(expected);
  });
});
