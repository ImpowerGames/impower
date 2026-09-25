// Ported from Luau's linter tests (`luau/tests/Linter.test.cpp`): lints about
// names and scopes that sparkdown does not have yet. Snippets and expected
// messages are quoted verbatim inside a function body; the upstream test-case
// name is in the comment above each group. Each `describe.skip` is the ready
// specification for a lint not implemented (docs/compiler/LINTS.md); a rule
// that implements one adds its code to `LINT_CODES` in the harness and
// unskips it. Upstream cases whose expected result is silence run now, so a
// future rule cannot start warning on them.

import { describe, expect, test } from "vitest";
import {
  diagnoseInFunction,
  lintMessagesInFunction,
} from "./diagnosticTestHarness";

// Luau: PlaceholderRead
describe.skip("reading the local placeholder `_` (not implemented: PlaceholderRead)", () => {
  test("local _ = 5; return _", () => {
    expect(
      lintMessagesInFunction(`
local _ = 5
return _
`),
    ).toEqual([
      "Placeholder value '_' is read here; consider using a named variable",
    ]);
  });
});

// Luau: PlaceholderReadGlobal
describe.skip("reading the global placeholder `_` (not implemented: PlaceholderRead)", () => {
  test("_ = 5; print(_)", () => {
    expect(
      lintMessagesInFunction(`
_ = 5
print(_)
`),
    ).toEqual([
      "Placeholder value '_' is read here; consider using a named variable",
    ]);
  });
});

// Luau: PlaceholderWrite
describe("writing the placeholder `_` is not reported", () => {
  test("local _ = 5; _ = 6", () => {
    expect(
      diagnoseInFunction(`
local _ = 5
_ = 6
`),
    ).toEqual([]);
  });
});

// Luau: BuiltinGlobalWrite
describe.skip("overwriting a builtin global (not implemented: BuiltinGlobalWrite)", () => {
  test("math = {} and function assert", () => {
    expect(
      lintMessagesInFunction(`
math = {}

function assert(x)
end

assert(5)
`),
    ).toEqual([
      "Built-in global 'math' is overwritten here; consider using a local or changing the name",
      "Built-in global 'assert' is overwritten here; consider using a local or changing the name",
    ]);
  });
});

// Luau: GlobalAsLocal
describe.skip("a global used only in one function (not implemented: GlobalAsLocal)", () => {
  test("foo written and read only in bar", () => {
    expect(
      lintMessagesInFunction(`
function bar()
    foo = 6
    return foo
end

return bar()
`),
    ).toEqual([
      "Global 'foo' is only used in the enclosing function 'bar'; consider changing it to local",
    ]);
  });
});

// Luau: GlobalAsLocalMultiFx
describe.skip("a global always written before read (not implemented: GlobalAsLocal)", () => {
  test("foo written then read in two functions", () => {
    expect(
      lintMessagesInFunction(`
function bar()
    foo = 6
    return foo
end

function baz()
    foo = 6
    return foo
end

return bar() + baz()
`),
    ).toEqual([
      "Global 'foo' is never read before being written. Consider changing it to local",
    ]);
  });
});

// Luau: GlobalAsLocalMultiFxWithRead
// Luau: GlobalAsLocalWithConditional
// Luau: GlobalAsLocal3WithConditionalRead
// Luau: GlobalAsLocalInnerRead
describe("globals that are genuinely shared are not reported", () => {
  test.each([
    [
      "GlobalAsLocalMultiFxWithRead",
      `
function bar()
    foo = 6
    return foo
end

function baz()
    foo = 6
    return foo
end

function read()
    print(foo)
end

return bar() + baz() + read()
`,
    ],
    [
      "GlobalAsLocalWithConditional",
      `
function bar()
    if true then foo = 6 end
    return foo
end

function baz()
    foo = 6
    return foo
end

return bar() + baz()
`,
    ],
    [
      "GlobalAsLocal3WithConditionalRead",
      `
function bar()
    foo = 6
    return foo
end

function baz()
    foo = 6
    return foo
end

function read()
    if false then print(foo) end
end

return bar() + baz() + read()
`,
    ],
    [
      "GlobalAsLocalInnerRead",
      `
function foo()
   local f = function() return bar end
   f()
   bar = 42
end

function baz() bar = 0 end

return foo() + baz()
`,
    ],
  ])("%s", (_name, body) => {
    expect(diagnoseInFunction(body)).toEqual([]);
  });
});

// Luau: GlobalAsLocalMulti
describe.skip("a function statement meant as a local (not implemented: GlobalAsLocal)", () => {
  test("moreInternalLogic declared inside createFunction", () => {
    expect(
      lintMessagesInFunction(`
local createFunction = function(configValue)
    -- Create an internal convenience function
    local function internalLogic()
        print(configValue) -- prints passed-in value
    end
    -- Here, we thought we were creating another internal convenience function
    -- that closed over the passed-in configValue, but this is actually being
    -- declared at module scope!
    function moreInternalLogic()
        print(configValue) -- nil!!!
    end
    return function()
        internalLogic()
        moreInternalLogic()
        return nil
    end
end
fnA = createFunction(true)
fnB = createFunction(false)
fnA() -- prints "true", "nil"
fnB() -- prints "false", "nil"
`),
    ).toEqual([
      "Global 'moreInternalLogic' is only used in the enclosing function defined at line 2; consider changing it to local",
    ]);
  });
});

// Luau: LocalShadowLocal
describe.skip("a local redeclared in the same scope (not implemented: LocalShadow)", () => {
  test("local arg twice", () => {
    expect(
      lintMessagesInFunction(`
local arg = 6
print(arg)

local arg = 5
print(arg)
`),
    ).toEqual(["Variable 'arg' shadows previous declaration at line 2"]);
  });
});

// Luau: LocalShadowGlobal
// Shadowing itself is covered as behavior in LocalShadowsGlobal.test.ts.
describe.skip("a local named like a global in use (not implemented: LocalShadow)", () => {
  test("local global inside bar", () => {
    expect(
      lintMessagesInFunction(`
local math = math
global = math

function bar()
    local global = math.max(5, 1)
    return global
end

return bar()
`),
    ).toEqual(["Variable 'global' shadows a global variable used at line 3"]);
  });
});

// Luau: LocalShadowArgument
describe.skip("a local named like a parameter (not implemented: LocalShadow)", () => {
  test("local a inside bar(a, b)", () => {
    expect(
      lintMessagesInFunction(`
function bar(a, b)
    local a = b + 1
    return a
end

return bar()
`),
    ).toEqual(["Variable 'a' shadows previous declaration at line 2"]);
  });
});

// Luau: FunctionUnused
describe.skip("functions that are never called (not implemented: FunctionUnused)", () => {
  test("bar and qux", () => {
    expect(
      lintMessagesInFunction(`
function bar()
end

local function qux()
end

function foo()
end

local function _unusedl()
end

function _unusedg()
end

return foo()
`),
    ).toEqual([
      "Function 'bar' is never used; prefix with '_' to silence",
      "Function 'qux' is never used; prefix with '_' to silence",
    ]);
  });
});

// Luau: ImportOnlyUsedInReturnType (adapted)
// Sparkdown has no `require`; a plain local stands in for the import, which
// is read only in the return type.
describe.skip("a function used only in a type (not implemented: FunctionUnused)", () => {
  test("foo(): Foo.Y", () => {
    expect(
      lintMessagesInFunction(`
        local Foo = {}

        function foo(): Foo.Y
        end
    `),
    ).toEqual(["Function 'foo' is never used; prefix with '_' to silence"]);
  });
});

// Luau: DeadLocalsUsed
describe.skip("locals read but never assigned (not implemented: UninitializedLocal, UnbalancedAssignment)", () => {
  test("x hidden by a loop variable, c without a value", () => {
    expect(
      lintMessagesInFunction(`
--!nolint LocalShadow
do
    local x
    for x in pairs({}) do
        print(x)
    end
    print(x) -- x is not initialized
end

do
    local a, b, c = 1, 2
    print(a, b, c) -- c is not initialized
end

do
    local a, b, c = table.unpack({})
    print(a, b, c) -- no warning as we don't know anything about c
end
    `),
    ).toEqual([
      "Variable 'x' defined at line 4 is never initialized or assigned; initialize with 'nil' to silence",
      "Assigning 2 values to 3 variables initializes extra variables with nil; add 'nil' to value list to silence",
      "Variable 'c' defined at line 12 is never initialized or assigned; initialize with 'nil' to silence",
    ]);
  });
});

// Luau: DuplicateGlobalFunction
describe.skip("a global function defined twice (not implemented: DuplicateFunction)", () => {
  test("function x twice", () => {
    expect(
      lintMessagesInFunction(`
        function x() end

        function x() end

        return x
    `),
    ).toEqual(["Duplicate function definition: 'x' also defined on line 2"]);
  });
});

// Luau: DuplicateLocalFunction
// Upstream checks only that the warning's code is DuplicateFunction.
describe.skip("a local function defined twice (not implemented: DuplicateFunction)", () => {
  test("local function x twice", () => {
    expect(
      lintMessagesInFunction(`
        local function x() end

        print(x)

        local function x() end

        return x
    `),
    ).toHaveLength(1);
  });
});

// Luau: DuplicateMethod
describe.skip("a method defined twice (not implemented: DuplicateFunction)", () => {
  test("function T:x twice", () => {
    expect(
      lintMessagesInFunction(`
        local T = {}
        function T:x() end

        function T:x() end

        return x
    `),
    ).toEqual(["Duplicate function definition: 'T.x' also defined on line 3"]);
  });
});

// Luau: DontTriggerTheWarningIfTheFunctionsAreInDifferentScopes
describe("the same function in two arms is not a duplicate", () => {
  test("function c in then and else", () => {
    expect(
      diagnoseInFunction(`
        if true then
            function c() end
        else
            function c() end
        end

        return c
    `),
    ).toEqual([]);
  });
});

// Luau: DuplicateLocal
// The second message is LocalUnused, which sparkdown has; it does not report
// it here because two declarations of `a1` in one statement share a scope,
// and the rule counts the later reads for both.
describe.skip("a name declared twice in one list (not implemented: DuplicateLocal)", () => {
  test("parameters, locals and an explicit self", () => {
    expect(
      lintMessagesInFunction(`
function foo(a1, a2, a3, a1)
end

local _, _, _ = ... -- ok!
local a1, a2, a1 = ... -- not ok

local moo = {}
function moo:bar(self)
end

return foo, moo, a1, a2
`),
    ).toEqual([
      "Function parameter 'a1' already defined on column 14",
      "Variable 'a1' is never used; prefix with '_' to silence",
      "Variable 'a1' already defined on column 7",
      "Function parameter 'self' already defined implicitly",
    ]);
  });
});
