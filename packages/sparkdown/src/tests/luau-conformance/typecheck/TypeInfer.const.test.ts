// Luau's type-checker tests from `tests/TypeInfer.const.test.cpp` at the
// commit pinned in `../upstream/typecheck-cases.json`, ported as `README.md`
// describes. Each case names its upstream line.

import { portUpstreamFile } from "./portedCases";

portUpstreamFile("TypeInfer.const.test.cpp", [
  {
    // TypeInfer.const.test.cpp:14 TEST_CASE_FIXTURE(Fixture, "basic_declarations_work")
    name: "basic_declarations_work",
    fixture: "Fixture",
    source: `
        const PI = 3.14
    `,
    expect: [{ errors: 0 }, { type: "PI", equals: "number" }],
  },
  {
    // TypeInfer.const.test.cpp:23 TEST_CASE_FIXTURE(Fixture, "reassignments_dont_affect_type_state")
    name: "reassignments_dont_affect_type_state",
    fixture: "Fixture",
    flags: { LuauExportValueSyntax: true },
    malformed: "Variable 'PI' is constant and may not be reassigned",
    source: `
        const PI = 3.14
        PI = "apple"
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "SyntaxError", fields: { message: "Variable 'PI' is constant and may not be reassigned" } },
      { type: "PI", equals: "number" },
    ],
  },
  {
    // TypeInfer.const.test.cpp:40 TEST_CASE_FIXTURE(Fixture, "empty_domain_is_ok")
    name: "empty_domain_is_ok",
    fixture: "Fixture",
    malformed: "Missing initializer in const declaration",
    source: `
        const PI

        return PI
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "SyntaxError", fields: { message: "Missing initializer in const declaration" } },
      { type: "PI", equals: "nil" },
    ],
  },
  {
    // TypeInfer.const.test.cpp:59 TEST_CASE_FIXTURE(Fixture, "const_extra_lvalues_are_nil_and_syntax_error_from_call")
    name: "const_extra_lvalues_are_nil_and_syntax_error_from_call",
    fixture: "Fixture",
    source: `
        local function getparams(): (number, number)
            return 42, 13
        end

        const X, Y, Z = getparams()
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "CountMismatch", fields: { actual: 3, expected: 2 } },
      { type: "X", equals: "number" },
      { type: "Y", equals: "number" },
      { type: "Z", equals: "nil" },
    ],
  },
  {
    // TypeInfer.const.test.cpp:83 TEST_CASE_FIXTURE(Fixture, "const_extra_lvalues_are_nil_and_syntax_error_from_underfill")
    name: "const_extra_lvalues_are_nil_and_syntax_error_from_underfill",
    fixture: "Fixture",
    malformed: "Missing initializer in const declaration",
    source: `
        const X, Y, Z = 42, 13

        return { X, Y, Z }
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "SyntaxError", fields: { message: "Missing initializer in const declaration" } },
    ],
  },
  {
    // TypeInfer.const.test.cpp:102 TEST_CASE_FIXTURE(Fixture, "const_syntax_error_in_annotation")
    // Upstream asserts nothing: checking a snippet with a broken annotation
    // must finish.
    name: "const_syntax_error_in_annotation",
    fixture: "Fixture",
    malformed: "a table type with two fields and no separator",
    source: `
        const foo: {
            bar
            baz
        } = {}

        return foo
    `,
    expect: [],
  },
  {
    // TypeInfer.const.test.cpp:118 TEST_CASE_FIXTURE(Fixture, "assign_different_values_to_const_x")
    name: "assign_different_values_to_const_x",
    fixture: "Fixture",
    flags: { LuauExportValueSyntax: true },
    malformed: "Variable 'x' is constant and may not be reassigned",
    source: `
        const x: string? = nil
        local a = x
        x = "hello!"
        local b = x
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "SyntaxError", fields: { message: "Variable 'x' is constant and may not be reassigned" } },
      { type: "a", equals: "string?" },
      { type: "b", equals: "string?" },
    ],
  },
  {
    // TypeInfer.const.test.cpp:137 TEST_CASE_FIXTURE(Fixture, "const_recursive_function_works")
    name: "const_recursive_function_works",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        const function f(x)
            f(5)
        end
    `,
    expect: [{ errors: 0 }, { type: "f", equals: "(unknown) -> ()" }],
  },
  {
    // TypeInfer.const.test.cpp:154 TEST_CASE_FIXTURE(BuiltinsFixture, "const_tables_are_still_mutable")
    name: "const_tables_are_still_mutable",
    fixture: "BuiltinsFixture",
    ignoreMissingAnnotations: true,
    source: `
        const TABLE = {}
        TABLE.foobar = "the fooest of bars!"
        TABLE.TAU = 6.12
        function TABLE.callback(x, y)
            print(math.abs(x), string.len(y))
            return true
        end

        return TABLE
    `,
    expect: [
      { errors: 0 },
      { type: "TABLE", options: { exhaustive: true }, equals: "{ TAU: number, callback: (number, string) -> boolean, foobar: string }" },
    ],
  },
  {
    // TypeInfer.const.test.cpp:177 TEST_CASE_FIXTURE(Fixture, "const_shadowing")
    // Upstream leaves the types of `y` and `X` unchecked, because they differ
    // between platforms (CLI-197269).
    name: "const_shadowing",
    fixture: "Fixture",
    source: `
        const X = "huh"
        const X = 3.14

        local y = X
    `,
    expect: [{ errors: 0 }],
  },
]);
