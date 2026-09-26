// Ported from Luau's linter tests (`luau/tests/Linter.test.cpp`), the
// UnreachableCode rule. Snippets and expected messages are quoted verbatim
// and placed inside a function body; the upstream test-case name is in the
// comment above each group. Line numbers are 0-based, as upstream checks
// them. The rule is implemented in `compiler/lint/collectLuauLints.ts`.

import { describe, expect, test } from "vitest";
import { lintInFunction } from "./diagnosticTestHarness";

// Luau: UnreachableCodeBasic
describe("a statement after a block that always returns", () => {
  test("do return end, then print", () => {
    expect(
      lintInFunction(`
do
return 'ok'
end

print("hi!")
`),
    ).toEqual([
      { line: 5, message: "Unreachable code (previous statement always returns)" },
    ]);
  });
});

// Luau: UnreachableCodeLoopBreak
describe("a statement after a block that always breaks", () => {
  test("do break end, then print", () => {
    expect(
      lintInFunction(`
while true do
    do break end
    print("nope")
end

print("hi!")
`),
    ).toEqual([
      { line: 3, message: "Unreachable code (previous statement always breaks)" },
    ]);
  });
});

// Luau: UnreachableCodeLoopContinue
describe("a statement after a block that always continues", () => {
  test("do continue end, then print", () => {
    expect(
      lintInFunction(`
while true do
    do continue end
    print("nope")
end

print("hi!")
`),
    ).toEqual([
      {
        line: 3,
        message: "Unreachable code (previous statement always continues)",
      },
    ]);
  });
});

// Luau: UnreachableCodeIfMerge
describe("an if whose every arm returns", () => {
  test("only the if with an else that returns in both arms", () => {
    expect(
      lintInFunction(`
function foo1(a)
    if a then
        return 'x'
    else
        return 'y'
    end
    return 'z'
end

function foo2(a)
    if a then
        return 'x'
    end
    return 'z'
end

function foo3(a)
    if a then
        return 'x'
    else
        print('y')
    end
    return 'z'
end

return { foo1, foo2, foo3 }
`),
    ).toEqual([
      { line: 7, message: "Unreachable code (previous statement always returns)" },
    ]);
  });
});

// Luau: UnreachableCodeErrorReturnSilent
describe("error() followed by a final return is not reported", () => {
  test("error then return in one arm, error in the other", () => {
    expect(
      lintInFunction(`
function foo1(a)
    if a then
        error('x')
        return 'z'
    else
        error('y')
    end
end

return foo1
`),
    ).toEqual([]);
  });
});

// Luau: UnreachableCodeAssertFalseReturnSilent
describe("assert(false) as the last statement is not reported", () => {
  test("return in an if, then assert(false)", () => {
    expect(
      lintInFunction(`
function foo1(a)
    if a then
        return 'z'
    end

    assert(false)
end

return foo1
`),
    ).toEqual([]);
  });
});

// Luau: UnreachableCodeErrorReturnNonSilentBranchy
describe("a return after an if whose every arm errors", () => {
  test("error in both arms, then return", () => {
    expect(
      lintInFunction(`
function foo1(a)
    if a then
        error('x')
    else
        error('y')
    end
    return 'z'
end

return foo1
`),
    ).toEqual([
      { line: 7, message: "Unreachable code (previous statement always errors)" },
    ]);
  });
});

// Luau: UnreachableCodeErrorReturnPropagate
describe("an arm ending in error() then return still errors", () => {
  test("error+return in one arm, error in the other, then return", () => {
    expect(
      lintInFunction(`
function foo1(a)
    if a then
        error('x')
        return 'z'
    else
        error('y')
    end
    return 'x'
end

return foo1
`),
    ).toEqual([
      { line: 8, message: "Unreachable code (previous statement always errors)" },
    ]);
  });
});

// Luau: UnreachableCodeLoopWhile
describe("a loop that may not run does not end its block", () => {
  test("while a do return end, then return", () => {
    expect(
      lintInFunction(`
function foo1(a)
    while a do
        return 'z'
    end
    return 'x'
end

return foo1
`),
    ).toEqual([]);
  });
});

// Luau: UnreachableCodeLoopRepeat
// Upstream notes this silence is technically a bug (the body always
// returns); sparkdown keeps Luau's result.
describe("a repeat loop does not end its block", () => {
  test("repeat return until a, then return", () => {
    expect(
      lintInFunction(`
function foo1(a)
    repeat
        return 'z'
    until a
    return 'x'
end

return foo1
`),
    ).toEqual([]);
  });
});

// Luau: BreakFromInfiniteLoopMakesStatementReachable
describe("a conditional break keeps what follows the loop reachable", () => {
  test("repeat with if-break, then return", () => {
    expect(
      lintInFunction(`
local bar = ...

repeat
    if bar then
        break
    end

    return 2
until true

return 1
`),
    ).toEqual([]);
  });
});

// Sparkdown-specific. Luau refuses a `return` that is not the last statement
// of its block as a syntax error, which is why the upstream cases wrap it in
// `do ... end`. Sparkdown accepts it, so the lint is what reports the dead
// statements after it.
describe("statements after a return in the same block", () => {
  test("return, then print", () => {
    expect(
      lintInFunction(`
local x = 1
return x
print("hi!")
`),
    ).toEqual([
      { line: 3, message: "Unreachable code (previous statement always returns)" },
    ]);
  });

  test("break, then print, inside a loop", () => {
    expect(
      lintInFunction(`
for i = 1, 3 do
    break
    print(i)
end
`),
    ).toEqual([
      { line: 3, message: "Unreachable code (previous statement always breaks)" },
    ]);
  });
});

// As in Luau, an expression on the line after a bare `return` is the value it
// returns, and a statement there is not.
describe("the line after a bare return", () => {
  test("an expression on the next line is the returned value", () => {
    expect(
      lintInFunction(`
local a1 = 1
return
  a1 + 1
`),
    ).toEqual([]);
  });

  test.each([
    ["a local", "\nreturn\n  local _b = 2\n"],
    ["a do block", "\nreturn\n  do print(1) end\n"],
  ])("%s on the next line is unreachable", (_name, body) => {
    expect(lintInFunction(body)).toEqual([
      { line: 2, message: "Unreachable code (previous statement always returns)" },
    ]);
  });
});

describe("a return whose expression spans lines is one statement", () => {
  test.each([
    ["a call split across lines", "\nreturn f(\n  1\n)\n"],
    ["a table across lines", "\nreturn {\n  k = 1,\n}\n"],
    ["a method call", "\nlocal a = {}\nreturn a:m(1)\n"],
  ])("%s", (_name, body) => {
    expect(lintInFunction(body)).toEqual([]);
  });
});
