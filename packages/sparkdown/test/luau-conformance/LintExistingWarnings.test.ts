import { describe, expect, test } from "vitest";
import {
  diagnoseWithLints,
  diagnoseDetailed,
  diagnoseWithLintsInFunction,
} from "./diagnosticTestHarness";

describe("an unknown global read in a scene", () => {
  test("& print(foo)", () => {
    expect(diagnoseWithLints("scene start\n  & print(foo)\nend\n")).toEqual([
      "Cannot find variable named `foo`",
    ]);
  });
});

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
describe("an unknown global read inside a function (adapted)", () => {
  test("return foo", () => {
    expect(diagnoseWithLintsInFunction("return foo")).toEqual([
      "Cannot find variable named `foo`",
    ]);
  });
});

// Luau: DeprecatedGlobal (adapted)
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

describe("a missing stdlib member (diverges: reported as a missing path)", () => {
  test("table.nogetn()", () => {
    expect(
      diagnoseWithLintsInFunction(`
return function ()
    print(table.nogetn()) -- verify that we correctly handle non-existent members
end
`),
    ).toEqual(["Cannot find item or path named `table.nogetn`"]);
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
describe("an unknown global inside interpolation", () => {
  test("local _ = `unknown {foo}`", () => {
    expect(diagnoseWithLintsInFunction("local _ = `unknown {foo}`")).toEqual([
      "Cannot find variable named `foo`",
    ]);
  });
});

// Luau: no_spurious_warning_after_a_function_type_alias (adapted)
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
