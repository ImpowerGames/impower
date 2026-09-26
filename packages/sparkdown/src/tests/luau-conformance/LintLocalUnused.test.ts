// Ported from Luau's linter tests (`luau/tests/Linter.test.cpp`), the
// LocalUnused rule. Snippets and expected messages are quoted verbatim and
// placed inside a function body; the upstream test-case name is in the
// comment above each group. Line numbers are 0-based, as upstream checks
// them. The rule is implemented in `compiler/lint/collectLuauLints.ts`.

import { describe, expect, test } from "vitest";
import {
  diagnoseWithLints,
  lintInFunction,
  lintMessagesInFunction,
} from "./diagnosticTestHarness";

// Luau: LocalUnused
describe("locals that are never read", () => {
  test("a shadowed outer local and a local that is only written", () => {
    expect(
      lintInFunction(`
local arg = 6

local function bar()
    local arg = 5
    local blarg = 6
    if arg then
        blarg = 42
    end
end

return bar()
`),
    ).toEqual([
      { line: 1, message: "Variable 'arg' is never used; prefix with '_' to silence" },
      { line: 5, message: "Variable 'blarg' is never used; prefix with '_' to silence" },
    ]);
  });
});

// Luau: ImportOnlyUsedInTypeAnnotation (adapted)
// Sparkdown has no `require`; a plain local stands in for the import. The
// grammar does not read a dotted type name (`Foo.Y`) and leaves the function
// unfinished, so the type is the bare name. A name read only in a type
// annotation still counts as used.
describe("a local read only in another local's type annotation", () => {
  test("only the annotated, unread local is reported", () => {
    expect(
      lintMessagesInFunction(`
        local Foo = {}

        local x: Foo = 1
    `),
    ).toEqual(["Variable 'x' is never used; prefix with '_' to silence"]);
  });
});

// Luau: LocalFunctionNotDead
describe("a local assigned by a function statement", () => {
  test("local foo; function foo() end", () => {
    expect(
      lintInFunction(`
local foo
function foo() end
    `),
    ).toEqual([]);
  });
});

// Sparkdown-specific: what does and does not count as a read.
describe("reads the rule recognizes", () => {
  test.each([
    ["a read in a nested function", "\nlocal x = 1\nlocal f = function() return x end\nreturn f\n"],
    ["a read in string interpolation", "\nlocal x = 1\nreturn `value {x}`\n"],
    ["a compound assignment", "\nlocal x = 1\nx += 1\n"],
    ["a read in its own redeclaration", "\nlocal x = 1\nlocal x = x + 1\nreturn x\n"],
    ["a read in a repeat's until", "\nrepeat\n    local done = true\nuntil done\n"],
    ["a call through the local", "\nlocal f = print\nf(1)\n"],
    ["an index through the local", "\nlocal t = {}\nt.k = 1\n"],
    // On one line the grammar nests what follows a declaration inside it;
    // these shapes are from Luau's conformance suite.
    ["a read later on the same line", "\nlocal s, r = pcall(print) return s, r\n"],
    ["a read in a function statement on the same line", "\nlocal a = 1 function foo() return a end return foo()\n"],
  ])("%s", (_name, body) => {
    expect(lintInFunction(body)).toEqual([]);
  });

  test.each([
    ["a field of the same name", "\nlocal k = 1\nlocal t = {}\nreturn t.k\n", 1],
    ["a method of the same name", "\nlocal m = 1\nlocal t = {}\nreturn t:m()\n", 1],
    ["the name in a string", "\nlocal x = 1\nreturn 'x'\n", 1],
    ["the name in a comment", "\nlocal x = 1\n-- x\n", 1],
    ["a local in a then arm read only in the else arm", "\nlocal c = true\nif c then\n    local y = 1\nelse\n    print(y)\nend\n", 3],
  ])("%s is not a read", (_name, body, line) => {
    expect(lintInFunction(body)).toEqual([
      {
        line,
        message: expect.stringMatching(/^Variable '\w+' is never used; prefix with '_' to silence$/),
      },
    ]);
  });
});

describe("names the rule does not report", () => {
  test.each([
    ["an underscore-prefixed local", "\nlocal _unused = 1\n"],
    ["an unused parameter", "\nlocal f = function(a) end\nreturn f\n"],
    ["an unused loop variable", "\nfor i = 1, 3 do\nend\n"],
    ["an unused generic-for variable", "\nfor k, v in pairs({}) do\n    print(v)\nend\n"],
    // The grammar wraps the value `true` like a declared name.
    ["a value after the first in the list", "\nlocal _ = 1, true\n"],
  ])("%s", (_name, body) => {
    expect(lintInFunction(body)).toEqual([]);
  });

  // A function without its `end` (one being typed, or one the parser gave up
  // on) ends early in the tree, and the lines after the break are parsed as
  // top-level code, so the reads there are out of its reach.
  test("locals in a function that is missing its end", () => {
    expect(
      diagnoseWithLints("function f()\n  local x = 1\n  if x then\n    print(x)\n").filter(
        (m) => m.includes("never used"),
      ),
    ).toEqual([]);
  });

  // Top-level code is narrative with embedded logic, and a top-level local
  // can be read from interpolated text or later lines the rule cannot scope,
  // so only locals inside functions are checked.
  test("a local outside any function", () => {
    expect(
      diagnoseWithLints("local x = 1\nHello there.\n").filter((m) =>
        m.includes("never used"),
      ),
    ).toEqual([]);
  });
});
