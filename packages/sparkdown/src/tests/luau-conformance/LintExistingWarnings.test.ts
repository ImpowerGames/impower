// Ported from Luau's linter tests (`luau/tests/Linter.test.cpp`): the cases
// sparkdown already has a warning (or a clean result) for. Snippets are
// quoted verbatim inside a function body unless marked adapted; the upstream
// test-case name is in the comment above each group. Where sparkdown's
// wording differs, the test pins sparkdown's, since changing the wording of
// existing warnings is out of scope here.

import { describe, expect, test } from "vitest";
import {
  diagnoseWithLints,
  diagnoseDetailed,
  diagnoseWithLintsInFunction,
} from "./diagnosticTestHarness";

// Luau: CleanCode
describe("clean code has no warnings", () => {
  test("recursive fib", () => {
    expect(
      diagnoseWithLintsInFunction(`
function fib(n)
    return n < 2 and 1 or fib(n-1) + fib(n-2)
end
`),
    ).toEqual([]);
  });
});

// Luau: type_function_fully_reduces
// Upstream checks that the type solver reduces this without a warning.
// Type annotations are parsed but ignored (DIVERGENCES.md), so here it pins
// only that the snippet is clean.
describe("an and/or return that mixes types has no warnings", () => {
  test("return n < 2 or fib(n-2)", () => {
    expect(
      diagnoseWithLintsInFunction(`
function fib(n)
    return n < 2 or  fib(n-2)
end
`),
    ).toEqual([]);
  });
});

// Luau: UnknownGlobal
// "Unknown global 'foo'; consider assigning to it first"
//
// Sparkdown reports the read with its own wording, inside a function and at
// the top level (adapted below).
describe("an unknown global read inside a function (adapted)", () => {
  test("return foo", () => {
    expect(diagnoseWithLintsInFunction("return foo")).toEqual([
      "Cannot find variable named `foo`",
    ]);
  });
});

describe("an unknown global read at the top level (adapted)", () => {
  test("& print(foo)", () => {
    expect(diagnoseWithLints("& print(foo)\n")).toEqual([
      "Cannot find variable named `foo`",
    ]);
  });
});

// Luau: DeprecatedGlobal (adapted)
// "Global 'Wait' is deprecated, use 'wait' instead"
//
// Upstream registers a host global as deprecated. Sparkdown's deprecated
// globals are Luau's own stdlib entries; each reports an Information
// diagnostic tagged Deprecated, naming the replacement.
describe("a deprecated stdlib global (adapted)", () => {
  test("unpack", () => {
    const [d, ...rest] = diagnoseDetailed(
      "function run()\nprint(unpack({1}))\nend\n",
    );
    expect(rest).toEqual([]);
    expect(d!.message).toBe(
      "The global `unpack` is deprecated in Luau. Use `table.unpack(t)` instead.",
    );
    expect(d!.severity).toBe(3);
  });
});

// Luau: DeprecatedApiUntyped
// Upstream expects exactly two warnings. Sparkdown's wording for the two
// deprecated members is its own; the member that does not exist is covered
// separately below.
describe("deprecated table members (adapted wording)", () => {
  test("table.getn and table.foreach", () => {
    const messages = diagnoseWithLintsInFunction(`
-- TODO
return function ()
    print(table.getn({}))
    table.foreach({}, function() end)
end
`);
    expect(messages).toEqual([
      "`table.getn(t)` is deprecated in Luau. Use the length operator `#t` instead.",
      "`table.foreach` is deprecated in Luau. Use `for k, v in pairs(t) do … end`.",
    ]);
  });
});

// The third line of the same upstream case: a member `table` does not have
// is not a deprecation, so Luau's linter says nothing about it.
describe.skip("a missing stdlib member (diverges: reported as a missing `table`)", () => {
  test("table.nogetn()", () => {
    expect(
      diagnoseWithLintsInFunction(`
return function ()
    print(table.nogetn()) -- verify that we correctly handle non-existent members
end
`),
    ).toEqual([]);
  });
});

// Luau: TypeAnnotationsShouldNotProduceWarnings
describe("a type alias has no warnings", () => {
  test("type InputData = { ... }", () => {
    expect(
      diagnoseWithLintsInFunction(`--!strict
type InputData = {
    id: number,
    inputType: EnumItem,
    inputState: EnumItem,
    updated: number,
    position: Vector3,
    keyCode: EnumItem,
    name: string
}
`),
    ).toEqual([]);
  });
});

// Luau: TestStringInterpolation
// The unknown global inside the interpolation warns.
describe("an unknown global inside interpolation", () => {
  test("local _ = `unknown {foo}`", () => {
    expect(diagnoseWithLintsInFunction("local _ = `unknown {foo}`")).toEqual([
      "Cannot find variable named `foo`",
    ]);
  });
});

// Luau: no_spurious_warning_after_a_function_type_alias (adapted)
// `export` is a module keyword, which sparkdown does not have; the alias is
// written without it.
describe("a function type alias between statements has no warnings (adapted)", () => {
  test("exports table with a function type alias", () => {
    expect(
      diagnoseWithLintsInFunction(`
        local exports = {}
        type PathFunction<P> = (P?) -> string
        exports.tokensToFunction = function() end
        return exports
    `),
    ).toEqual([]);
  });
});

// Luau: type_instantiation_lints
// Upstream checks explicit type instantiation. Type annotations are parsed
// but ignored, so here it pins only that the snippet is clean.
describe("explicit type instantiation has no warnings", () => {
  test('a<<"hi">>("hi")', () => {
    expect(
      diagnoseWithLintsInFunction(`
local function a<b>(cool: b)
    print(cool)
end

a<<"hi">>("hi")
`),
    ).toEqual([]);
  });
});
