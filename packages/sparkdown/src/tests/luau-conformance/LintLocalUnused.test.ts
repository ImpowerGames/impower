import { describe, expect, test } from "vitest";
import {
  diagnoseDetailed,
  diagnoseWithLints,
  lintInFunction as lintAllInFunction,
  lintMessagesInFunction as lintAllMessagesInFunction,
} from "./diagnosticTestHarness";

const lintInFunction = (body: string) => lintAllInFunction(body, "LocalUnused");
const lintMessagesInFunction = (body: string) => lintAllMessagesInFunction(body, "LocalUnused");

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

describe("names after a typed name in one local", () => {
  test("untyped control", () => {
    expect(
      lintMessagesInFunction(`
local a, b = 1, 2
return a
`),
    ).toEqual(["Variable 'b' is never used; prefix with '_' to silence"]);
  });

  test("a typed first name", () => {
    expect(
      lintMessagesInFunction(`
local a: number, b: number = 1, 2
return a
`),
    ).toEqual(["Variable 'b' is never used; prefix with '_' to silence"]);
  });
});

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

describe("reads the rule recognizes", () => {
  test.each([
    ["a read in a nested function", "\nlocal x = 1\nlocal f = function() return x end\nreturn f\n"],
    ["a read in string interpolation", "\nlocal x = 1\nreturn `value {x}`\n"],
    ["a compound assignment", "\nlocal x = 1\nx += 1\n"],
    ["a read in its own redeclaration", "\nlocal x = 1\nlocal x = x + 1\nreturn x\n"],
    ["a read in a repeat's until", "\nrepeat\n    local done = true\nuntil done\n"],
    ["a call through the local", "\nlocal f = print\nf(1)\n"],
    ["an index through the local", "\nlocal t = {}\nt.k = 1\n"],
    ["a read later on the same line", "\nlocal s, r = pcall(print) return s, r\n"],
    ["a read in a function statement on the same line", "\nlocal a = 1 function foo() return a end return foo()\n"],
    ["a read of a local named `style`", "\nlocal style = {}\nsetStyle(style)\n"],
    ["a read of a local named `layout`", "\nlocal layout = {}\nreturn layout.x\n"],
    ["a read of a local named `match` in a condition", "\nlocal match = true\nif match then return 1 end\n"],
    ["a local named in a primitive type annotation", "\nlocal number = 1\nlocal x: number = 2\nreturn x\n"],
  ])("%s", (_name, body) => {
    expect(lintInFunction(body)).toEqual([]);
  });

  test.each([
    ["a field of the same name", "\nlocal k = 1\nlocal t = {}\nreturn t.k\n", 1],
    ["a method of the same name", "\nlocal m = 1\nlocal t = {}\nreturn t:m()\n", 1],
    ["the name in a string", "\nlocal x = 1\nreturn 'x'\n", 1],
    ["the name in a comment", "\nlocal x = 1\n-- x\n", 1],
    ["a local in a then arm read only in the else arm", "\nlocal c = true\nif c then\n    local y = 1\nelse\n    print(y)\nend\n", 3],
    ["a write from a narrative logic line", "\nlocal hp = 1\n& hp = 5\n", 1],
  ])("%s is not a read", (_name, body, line) => {
    expect(lintInFunction(body)).toEqual([
      {
        line,
        message: expect.stringMatching(/^Variable '\w+' is never used; prefix with '_' to silence$/),
      },
    ]);
  });

  const unused = (line: number) => ({
    line,
    message: "Variable 'x' is never used; prefix with '_' to silence",
  });
  test.each([
    ["a read after it reads the redeclaration", "\nlocal x = 1\nlocal a = {} local x = 3\nprint(x, a)\n", [unused(1)]],
    ["no read leaves both unused", "\nlocal x = 1\nlocal a = {} local x = 3\nprint(a)\n", [unused(1), unused(2)]],
  ])("a redeclaration after another declaration on its line: %s", (_name, body, expected) => {
    expect(lintInFunction(body)).toEqual(expected);
  });
});

describe("names the rule does not report", () => {
  test.each([
    ["an underscore-prefixed local", "\nlocal _unused = 1\n"],
    ["an unused parameter", "\nlocal f = function(a) end\nreturn f\n"],
    ["an unused loop variable", "\nfor i = 1, 3 do\nend\n"],
    ["an unused generic-for variable", "\nfor k, v in pairs({}) do\n    print(v)\nend\n"],
    ["a value after the first in the list", "\nlocal _ = 1, true\n"],
  ])("%s", (_name, body) => {
    expect(lintInFunction(body)).toEqual([]);
  });

  test("locals in a function that is missing its end", () => {
    expect(
      diagnoseWithLints("function f()\n  local x = 1\n  if x then\n    print(x)\n").filter(
        (m) => m.includes("never used"),
      ),
    ).toEqual([]);
  });

  test("a local outside any function", () => {
    expect(
      diagnoseWithLints("local x = 1\nHello there.\n").filter((m) =>
        m.includes("never used"),
      ),
    ).toEqual([]);
  });
});

describe("a local read only by a method of a define in its function", () => {
  const localUnused = (source: string) =>
    diagnoseDetailed(source)
      .filter((d) => d.code === "LocalUnused")
      .map((d) => ({ line: d.range?.start.line, message: d.message }));

  test("is used", () => {
    expect(
      localUnused(
        [
          "function outer()",
          "  local b = 7",
          "  define other with",
          "    function get()",
          "      return b",
          "    end",
          "  end",
          "  return other.get()",
          "end",
          "Got {outer()}.",
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  test("is used when the define is in a function further in", () => {
    expect(
      localUnused(
        [
          "function outer()",
          "  local b = 7",
          "  local function inner()",
          "    define other with",
          "      function get()",
          "        return b",
          "      end",
          "    end",
          "    return other.get()",
          "  end",
          "  return inner()",
          "end",
          "Got {outer()}.",
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  test("is used when the define is in another define's method", () => {
    expect(
      localUnused(
        [
          "function outer()",
          "  local b = 7",
          "  define thing with",
          "    function get()",
          "      define other with",
          "        function get()",
          "          return b",
          "        end",
          "      end",
          "      return other.get()",
          "    end",
          "  end",
          "  return thing.get()",
          "end",
          "Got {outer()}.",
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  test("leaves a local beside the define that nothing reads unused", () => {
    expect(
      localUnused(
        [
          "function outer()",
          "  local b = 7",
          "  local c = 8",
          "  define other with",
          "    function get()",
          "      return b",
          "    end",
          "  end",
          "  return other.get()",
          "end",
          "Got {outer()}.",
        ].join("\n"),
      ),
    ).toEqual([{ line: 2, message: "Variable 'c' is never used; prefix with '_' to silence" }]);
  });

  test("leaves a local unused that the method's own local of its name hides", () => {
    expect(
      localUnused(
        [
          "function outer()",
          "  local b = 7",
          "  define other with",
          "    function get()",
          "      local b = 1",
          "      return b",
          "    end",
          "  end",
          "  return other.get()",
          "end",
          "Got {outer()}.",
        ].join("\n"),
      ),
    ).toEqual([{ line: 1, message: "Variable 'b' is never used; prefix with '_' to silence" }]);
  });

  test.each([
    ["the implicit form", "    get()"],
    ["the function form", "    function get()"],
  ])("leaves a local unused that a method only writes, in %s", (_, header) => {
    expect(
      localUnused(
        [
          "function outer()",
          "  local b = 7",
          "  define thing with",
          header,
          "      b = 9",
          "    end",
          "  end",
          "  thing.get()",
          "  return 0",
          "end",
          "Got {outer()}.",
        ].join("\n"),
      ),
    ).toEqual([{ line: 1, message: "Variable 'b' is never used; prefix with '_' to silence" }]);
  });

  test("is used by a method that writes a field of it", () => {
    expect(
      localUnused(
        [
          "function outer()",
          "  local b = {}",
          "  define thing with",
          "    function set()",
          "      b.x = 9",
          "    end",
          "  end",
          "  thing.set()",
          "  return 0",
          "end",
          "Got {outer()}.",
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  test.each([
    ["the implicit form", "    get()"],
    ["the function form", "    function get()"],
  ])("leaves a local named self unused that a method's self hides, in %s", (_, header) => {
    expect(
      localUnused(
        [
          "function outer()",
          "  local self = 7",
          "  define thing with",
          header,
          "      return self",
          "    end",
          "  end",
          "  return thing:get()",
          "end",
          "Got {outer()}.",
        ].join("\n"),
      ),
    ).toEqual([{ line: 1, message: "Variable 'self' is never used; prefix with '_' to silence" }]);
  });

  test("leaves a local unused that a method around the define hides", () => {
    expect(
      localUnused(
        [
          "function outer()",
          "  local b = 7",
          "  define thing with",
          "    function get()",
          "      local b = 1",
          "      define other with",
          "        function get()",
          "          return b",
          "        end",
          "      end",
          "      return other.get()",
          "    end",
          "  end",
          "  return thing.get()",
          "end",
          "Got {outer()}.",
        ].join("\n"),
      ),
    ).toEqual([{ line: 1, message: "Variable 'b' is never used; prefix with '_' to silence" }]);
  });

  test("leaves an ended block's local unused", () => {
    expect(
      localUnused(
        [
          "function outer()",
          "  local b = 7",
          "  do",
          "    local b = 1",
          "  end",
          "  define other with",
          "    function get()",
          "      return b",
          "    end",
          "  end",
          "  return other.get()",
          "end",
          "Got {outer()}.",
        ].join("\n"),
      ),
    ).toEqual([{ line: 3, message: "Variable 'b' is never used; prefix with '_' to silence" }]);
  });
});
