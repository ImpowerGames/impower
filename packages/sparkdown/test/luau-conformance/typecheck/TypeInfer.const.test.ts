import { portUpstreamFile } from "./portedCases";

portUpstreamFile("TypeInfer.const.test.cpp", [
  {
    name: "basic_declarations_work",
    fixture: "Fixture",
    source: `
        const PI = 3.14
    `,
    expect: [{ errors: 0 }, { type: "PI", equals: "number" }],
  },
  {
    name: "reassignments_dont_affect_type_state",
    malformed: "`PI` is a const and is reassigned",
    fixture: "Fixture",
    flags: { LuauExportValueSyntax: true },
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
    name: "empty_domain_is_ok",
    malformed: "the const `PI` has no value",
    fixture: "Fixture",
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
    name: "const_extra_lvalues_are_nil_and_syntax_error_from_underfill",
    malformed: "the const has more names than values",
    fixture: "Fixture",
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
    name: "const_syntax_error_in_annotation",
    malformed: "a table type must close before the second unseparated field name",
    fixture: "Fixture",
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
    name: "assign_different_values_to_const_x",
    malformed: "`x` is a const and is reassigned",
    fixture: "Fixture",
    flags: { LuauExportValueSyntax: true },
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
