// Ported from Luau's linter tests (`luau/tests/Linter.test.cpp`): lints about
// names and scopes. Snippets and expected messages are quoted verbatim inside
// a function body; the upstream test-case name is in the comment above each
// group, marked adapted where sparkdown's result differs. Upstream cases
// whose expected result is silence run too, so no rule can start warning on
// them.

import { describe, expect, test } from "vitest";
import { indexProgramNames, lintBuiltinGlobalWrites } from "../../compiler/lint/collectLuauLints";
import { testCompiler } from "../engineUnderTest";
import {
  diagnoseWithLints,
  diagnoseWithLintsInFunction,
  diagnoseDetailed,
  diagnoseFilesDetailed,
  lintMessages,
  lintMessagesInFunction,
} from "./diagnosticTestHarness";

// Luau: BuiltinGlobalWrite
describe("overwriting a builtin global (BuiltinGlobalWrite)", () => {
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

// Sparkdown-specific: the rule over sparkdown's flows, callbacks, handlers and
// included scripts, which upstream has no counterpart for.
describe("overwriting a builtin global across sparkdown's units and scripts (BuiltinGlobalWrite)", () => {
  test("a future flow local does not hide a preceding write to an explicit global", () => {
    const diagnostics = diagnoseDetailed("store math = {}\nfunction run()\n math = {}\n local math = {}\n math = {}\nend\nReady.\n");
    expect(diagnostics.filter((d) => d.code === "BuiltinGlobalWrite").map((d) => [d.severity, d.range])).toEqual([
      [2, { start: { line: 0, character: 6 }, end: { line: 0, character: 10 } }],
      [2, { start: { line: 2, character: 1 }, end: { line: 2, character: 5 } }],
    ]);
  });
  test.each(([
    ["callback", "define hero as character with\n callback = function() math = {}; return math end\nend\n", 1, 23],
    ["method", "local T = {}\nfunction T:update()\n math = {}\nend\n", 2, 1],
    ["scene", "scene intro()\n & math = {}\nend\n", 1, 3],
  ] as const).flatMap(([kind, body, line, character]) => [true, false].map((local) => ({ kind, body, line, character, local }))))("$kind surrounding local=$local", ({ body, line, character, local }) => {
    const prefix = local ? "local math = {}\n" : "";
    const diagnostics = diagnoseDetailed(`${prefix}${body}Ready.\n`);
    const writes = diagnostics.filter((d) => d.code === "BuiltinGlobalWrite");
    expect(writes).toEqual(local ? [] : [{
      code: "BuiltinGlobalWrite", file: "main.sd", severity: 2,
      message: "Built-in global 'math' is overwritten here; consider using a local or changing the name",
      range: { start: { line, character }, end: { line, character: character + 4 } },
    }]);
  });
  test("incremental include removal and restoration match cold binding diagnostics", () => {
    const included = "include helper.sd\n& math = {}\nReady.\n";
    const detached = "& math = {}\nReady.\n";
    const uri = "inmemory:///main.sd";
    const configured = (text: string) => {
      const compiler = testCompiler();
      compiler.configure({ files: [
        { uri, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" },
        { uri: "inmemory:///helper.sd", type: "script", name: "helper", ext: "sd", text: "local math = {}\n", version: 1, languageId: "sparkdown" },
      ] });
      return compiler;
    };
    const diagnostics = (compiler: ReturnType<typeof testCompiler>) => compiler.compile({ textDocument: { uri } }).program.diagnostics ?? {};
    const warm = configured(included);
    let previous = included;
    for (const [index, source] of [included, detached, included].entries()) {
      if (index) warm.updateDocument({ textDocument: { uri, version: index + 1 }, contentChanges: [{
        range: { start: { line: 0, character: 0 }, end: { line: previous.split("\n").length - 1, character: 0 } }, text: source,
      }] });
      const actual = diagnostics(warm);
      expect(actual).toEqual(diagnostics(configured(source)));
      expect((actual[uri] ?? []).filter((d) => d.code === "BuiltinGlobalWrite")).toHaveLength(index === 1 ? 1 : 0);
      previous = source;
    }
  });
  test("an included local shadows the builtin in the including script and its later function", () => {
    const ds = diagnoseFilesDetailed({
      "main.sd": "include helper.sd\nfunction run() math = {} end\nReady.\n",
      "helper.sd": "local math = {}\nfunction helper() math = {} end\nfunction assert(x) return x end\n",
    }).filter((d) => d.code === "BuiltinGlobalWrite");
    expect(ds.sort((a, b) => a.file.localeCompare(b.file)).map((d) => [d.file, d.range?.start.line, d.message])).toEqual([
      ["helper.sd", 2, "Built-in global 'assert' is overwritten here; consider using a local or changing the name"],
    ]);
  });
  test("a top-level local in any script silences that name program-wide", () => {
    // Conservative: the AST cannot show which writes a top-level local reaches.
    const ds = diagnoseFilesDetailed({
      "main.sd": "include helper.sd\nlocal math = {}\nReady.\n",
      "helper.sd": "& math = {}\nfunction f() assert = 1 end\n",
    }).filter((d) => d.code === "BuiltinGlobalWrite");
    expect(ds.map((d) => [d.file, d.range?.start.line, d.message])).toEqual([
      ["helper.sd", 1, "Built-in global 'assert' is overwritten here; consider using a local or changing the name"],
    ]);
  });
  test.each([
    "do\n  local math = {}\nend\n& math = {}\nReady.\n",
    "& if true then local math = {} end\n& math = {}\nReady.\n",
    "& for math = 1, 2 do end\n& math = {}\nReady.\n",
    "scene intro()\n  & do local math = {} end\n  & math = {}\nend\n",
    "& math = {}\nlayout main with\n  button \"Check\" @click={ local math = {} }\nend\nReady.\n",
  ])("a local in a nested top-level block or a handler does not silence another write: %s", (source) => {
    const ds = diagnoseDetailed(source).filter((d) => d.code === "BuiltinGlobalWrite");
    const lines = source.split("\n");
    expect(ds.map((d) => lines[d.range!.start.line]!.trim())).toEqual(["& math = {}"]);
  });
  test.each([
    ["& math = {}\nlocal math = {}\nReady.\n", 1],
    ["local math = {}\n& math = {}\nReady.\n", 0],
    ["scene intro()\n  & math = {}\n  & local math = {}\nend\n", 1],
  ] as const)("a top-level local does not silence a write before it in its block: %s", (source, count) => {
    expect(diagnoseDetailed(source).filter((d) => d.code === "BuiltinGlobalWrite")).toHaveLength(count);
  });
  test("an uncertain occurrence of the name anywhere silences it, but creates no warning", () => {
    const write = { name: "math", kind: "assignment" as const, from: 0, to: 4, node: {} as never };
    const uncertain = { name: "math", from: 9, to: 13, reason: "grammar-keyword" as const };
    const facts = (globals: typeof write[], uncertainNames: typeof uncertain[]) => ({ declarations: [], references: [], functions: [], globals, uncertainNames, functionStarts: new Map() });
    expect(lintBuiltinGlobalWrites(indexProgramNames([
      { uri: "a", names: facts([write], []) },
      { uri: "b", names: facts([], [uncertain]) },
    ]))).toEqual([]);
    expect(lintBuiltinGlobalWrites(indexProgramNames([{ uri: "b", names: facts([], [uncertain]) }]))).toEqual([]);
    expect(lintBuiltinGlobalWrites(indexProgramNames([{ uri: "a", names: facts([write], []) }])).map((f) => f.uri)).toEqual(["a"]);
  });
  test("a genuinely global write in the including script still warns", () => {
    const ds = diagnoseFilesDetailed({
      "main.sd": "include helper.sd\n& math = {}\nReady.\n",
      "helper.sd": "local ordinary = {}\n",
    }).filter((d) => d.code === "BuiltinGlobalWrite");
    expect(ds.map((d) => [d.file, d.range?.start.line])).toEqual([["main.sd", 1]]);
  });
  test.each(["& math = {}", "function late()\n math = {}\nend"])("included local binding silences %s", (write) => {
    expect(diagnoseFilesDetailed({
      "main.sd": `include helper.sd\n${write}\nReady.\n`,
      "helper.sd": "local math = {}\n",
    }).filter((d) => d.code === "BuiltinGlobalWrite")).toEqual([]);
  });
  test.each(["store", "const"])("explicit %s remains global despite an included local", (keyword) => {
    const ds = diagnoseFilesDetailed({
      "main.sd": `include helper.sd\n& ${keyword} math = {}\nReady.\n`,
      "helper.sd": "local math = {}\n",
    }).filter((d) => d.code === "BuiltinGlobalWrite");
    expect(ds.map((d) => [d.file, d.range?.start.line])).toEqual([["main.sd", 1]]);
  });
  test.each([
    "store math = {}\nReady.\n",
    "const math = 1\nReady.\n",
    "function run() store math = {} end\nReady.\n",
    "define hero as character with\n callback = function() store math = {}; return math end\nend\nReady.\n",
  ])("explicit global declarations warn once: %s", (source) => {
    const ds = diagnoseDetailed(source).filter((d) => d.code === "BuiltinGlobalWrite");
    expect(ds.map((d) => d.message)).toEqual(["Built-in global 'math' is overwritten here; consider using a local or changing the name"]);
    const range = ds[0]!.range!;
    const lines = source.split("\n");
    expect(lines[range.start.line]!.slice(range.start.character, range.end.character)).toBe("math");
  });
  test("compound writes and registry constants warn at the name", () => {
    const ds = diagnoseDetailed("function run()\n    _VERSION ..= 'x'\nend\n").filter((d) => d.code === "BuiltinGlobalWrite");
    expect(ds).toEqual([{ file: "main.sd", code: "BuiltinGlobalWrite", severity: 2, message: "Built-in global '_VERSION' is overwritten here; consider using a local or changing the name", range: { start: { line: 1, character: 4 }, end: { line: 1, character: 12 } } }]);
  });
  test("locals, parameters, member writes and user globals stay silent", () => {
    expect(lintMessagesInFunction(`
local math = {}
math = {}
local function assert(x) return x end
function assert(x) return x end
local function f(print) print = 1; return print end
table.custom = 1
function table.custom() end
constructor = 1
toString = 1
return math, assert, f
`).filter((message) => message.startsWith("Built-in global"))).toEqual([]);
  });
});

// The GlobalAsLocal cases below are adapted. An upstream snippet is a Luau
// chunk, and its globals are the chunk's; in the wrapper `run` they would be
// held by one function, which the harness does not report (it leaves out
// every GlobalUsedAsLocal warning naming `run`), so the snippet is placed at
// the script's top level instead, where a `function f()` is a story function
// and a Luau statement such as `fnA = createFunction(true)` is outside every
// function, as in the chunk. The chunk's last line, `return bar()`, which
// Sparkdown's top level reads as narrative, becomes the interpolation
// `{bar()}`, a use of the same functions outside every function. Line
// numbers are unchanged.

// Luau: GlobalAsLocal (adapted)
describe("a global used only in one function", () => {
  test("foo written and read only in bar", () => {
    expect(
      lintMessages(`
function bar()
    foo = 6
    return foo
end

{bar()}
`),
    ).toEqual([
      "Global 'foo' is only used in the enclosing function 'bar'; consider changing it to local",
    ]);
  });
});

// Luau: GlobalAsLocalMultiFx (adapted)
describe("a global always written before read", () => {
  test("foo written then read in two functions", () => {
    expect(
      lintMessages(`
function bar()
    foo = 6
    return foo
end

function baz()
    foo = 6
    return foo
end

{bar() + baz()}
`),
    ).toEqual([
      "Global 'foo' is never read before being written. Consider changing it to local",
    ]);
  });
});

// Luau: GlobalAsLocalMultiFxWithRead (adapted)
// Luau: GlobalAsLocalWithConditional (adapted)
// Luau: GlobalAsLocal3WithConditionalRead (adapted)
// Luau: GlobalAsLocalInnerRead (adapted)
// Each also runs as written in the wrapper, which stays silent too.
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
    expect(diagnoseWithLintsInFunction(body)).toEqual([]);
    const chunk = body.replace(/^return (.*)$/m, "{$1}");
    expect(chunk).not.toBe(body);
    expect(diagnoseWithLints(chunk)).toEqual([]);
  });
});

// Luau: GlobalAsLocalMulti (adapted)
describe("a function statement meant as a local", () => {
  test("moreInternalLogic declared inside createFunction", () => {
    expect(
      lintMessages(`
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
describe("a local redeclared in the same scope", () => {
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
describe("a local named like a global in use", () => {
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
describe("a local named like a parameter", () => {
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
describe("functions that are never called", () => {
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
describe("a function used only in a type", () => {
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

// Luau: DeadLocalsUsed (adapted)
// Sparkdown has no `--!nolint` (#598), so the directive is dropped, which
// moves every line up by one, and the loop variable's LocalShadow warning is
// expected too, first in the source order the warnings are reported in.
describe("locals read but never assigned", () => {
  test("x hidden by a loop variable, c without a value", () => {
    expect(
      lintMessagesInFunction(`
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
      "Variable 'x' shadows previous declaration at line 3",
      "Variable 'x' defined at line 3 is never initialized or assigned; initialize with 'nil' to silence",
      "Assigning 2 values to 3 variables initializes extra variables with nil; add 'nil' to value list to silence",
      "Variable 'c' defined at line 11 is never initialized or assigned; initialize with 'nil' to silence",
    ]);
  });
});

// Luau: DuplicateGlobalFunction
describe("a global function defined twice", () => {
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
describe("a local function defined twice", () => {
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
describe("a method defined twice", () => {
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
      diagnoseWithLintsInFunction(`
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
describe("a name declared twice in one list", () => {
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
