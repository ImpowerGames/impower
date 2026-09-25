// Luau's type-checker tests from `tests/TypeInfer.singletons.test.cpp` at the
// commit pinned in `../upstream/typecheck-cases.json`, ported as `README.md`
// describes. Each case names its upstream line.

import { NEW_SOLVER_GUARD_REASON, portUpstreamFile } from "./portedCases";

portUpstreamFile("TypeInfer.singletons.test.cpp", [
  {
    // TypeInfer.singletons.test.cpp:14 TEST_CASE_FIXTURE(Fixture, "function_args_infer_singletons")
    name: "function_args_infer_singletons",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
--!strict
type Phase = "A" | "B" | "C"
local function f(e : Phase) : number
    return 0
end
local e = f("B")
`,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.singletons.test.cpp:28 TEST_CASE_FIXTURE(Fixture, "bool_singletons")
    name: "bool_singletons",
    fixture: "Fixture",
    source: `
        local a: true = true
        local b: false = false
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.singletons.test.cpp:38 TEST_CASE_FIXTURE(Fixture, "string_singletons")
    name: "string_singletons",
    fixture: "Fixture",
    source: `
        local a: "foo" = "foo"
        local b: "bar" = "bar"
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.singletons.test.cpp:48 TEST_CASE_FIXTURE(Fixture, "string_singleton_function_call")
    name: "string_singleton_function_call",
    fixture: "Fixture",
    source: `
        local x = "a"
        function f(x: "a") end
        f(x)
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.singletons.test.cpp:62 TEST_CASE_FIXTURE(Fixture, "bool_singletons_mismatch")
    name: "bool_singletons_mismatch",
    fixture: "Fixture",
    source: `
        local a: true = false
    `,
    expect: [{ errors: 1 }, { error: 0, message: "Expected this to be 'true', but got 'false'" }],
  },
  {
    // TypeInfer.singletons.test.cpp:72 TEST_CASE_FIXTURE(Fixture, "string_singletons_mismatch")
    name: "string_singletons_mismatch",
    fixture: "Fixture",
    source: `
        local a: "foo" = "bar"
    `,
    expect: [
      { errors: 1 },
      { error: 0, message: "Expected this to be '\"foo\"', but got '\"bar\"'" },
    ],
  },
  {
    // TypeInfer.singletons.test.cpp:82 TEST_CASE_FIXTURE(Fixture, "string_singletons_escape_chars")
    name: "string_singletons_escape_chars",
    fixture: "Fixture",
    source: `
        local a: "\\n" = "\\000\\r"
    `,
    expect: [
      { errors: 1 },
      { error: 0, message: "Expected this to be '\"\\n\"', but got '\"\\000\\r\"'" },
    ],
  },
  {
    // TypeInfer.singletons.test.cpp:92 TEST_CASE_FIXTURE(Fixture, "bool_singleton_subtype")
    name: "bool_singleton_subtype",
    fixture: "Fixture",
    source: `
        local a: true = true
        local b: boolean = a
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.singletons.test.cpp:102 TEST_CASE_FIXTURE(Fixture, "string_singleton_subtype")
    name: "string_singleton_subtype",
    fixture: "Fixture",
    source: `
        local a: "foo" = "foo"
        local b: string = a
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.singletons.test.cpp:112 TEST_CASE_FIXTURE(Fixture, "string_singleton_subtype_multi_assignment")
    name: "string_singleton_subtype_multi_assignment",
    fixture: "Fixture",
    source: `
        local a: "foo" = "foo"
        local b: string, c: number = a, 10
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.singletons.test.cpp:122 TEST_CASE_FIXTURE(Fixture, "function_call_with_singletons")
    name: "function_call_with_singletons",
    fixture: "Fixture",
    source: `
        function f(a: true, b: "foo") end
        f(true, "foo")
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.singletons.test.cpp:132 TEST_CASE_FIXTURE(Fixture, "function_call_with_singletons_mismatch")
    name: "function_call_with_singletons_mismatch",
    fixture: "Fixture",
    source: `
        function f(a: true, b: "foo") end
        f(true, "bar")
    `,
    expect: [
      { errors: 1 },
      { error: 0, message: "Expected this to be '\"foo\"', but got '\"bar\"'" },
    ],
  },
  {
    // TypeInfer.singletons.test.cpp:143 TEST_CASE_FIXTURE(Fixture, "overloaded_function_call_with_singletons")
    name: "overloaded_function_call_with_singletons",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        function f(a, b) end
        local g : ((true, string) -> ()) & ((false, number) -> ()) = (f::any)
        g(true, "foo")
        g(false, 37)
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.singletons.test.cpp:157 TEST_CASE_FIXTURE(Fixture, "overloaded_function_resolution_singleton_parameters")
    name: "overloaded_function_resolution_singleton_parameters",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        type A = ("A") -> string
        type B = ("B") -> number

        local function foo(f: A & B)
            return f("A"), f("B")
        end
    `,
    expect: [
      { errors: 0 },
      { type: "foo", kind: "FunctionType" },
      { type: "foo", equals: "(((\"A\") -> string) & ((\"B\") -> number)) -> (string, number)" },
    ],
  },
  {
    // TypeInfer.singletons.test.cpp:177 TEST_CASE_FIXTURE(Fixture, "overloaded_function_call_with_singletons_mismatch")
    name: "overloaded_function_call_with_singletons_mismatch",
    fixture: "Fixture",
    source: `
        function f(g: ((true, string) -> ()) & ((false, number) -> ()))
            g(true, 37)
        end
    `,
    expect: [
      { errors: 2 },
      { error: 0, message: "None of the overloads for function that accept 2 arguments are compatible." },
      { error: 1, message: "Available overloads: (true, string) -> (); and (false, number) -> ()" },
    ],
  },
  {
    // TypeInfer.singletons.test.cpp:198 TEST_CASE_FIXTURE(Fixture, "enums_using_singletons")
    name: "enums_using_singletons",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        type MyEnum = "foo" | "bar" | "baz"
        local a : MyEnum = "foo"
        local b : MyEnum = "bar"
        local c : MyEnum = "baz"
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.singletons.test.cpp:210 TEST_CASE_FIXTURE(Fixture, "enums_using_singletons_mismatch")
    name: "enums_using_singletons_mismatch",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        type MyEnum = "foo" | "bar" | "baz"
        local a : MyEnum = "bang"
    `,
    expect: [
      { errors: 1 },
      { error: 0, message: "Expected this to be '\"bar\" | \"baz\" | \"foo\"', but got '\"bang\"'" },
    ],
  },
  {
    // TypeInfer.singletons.test.cpp:228 TEST_CASE_FIXTURE(Fixture, "enums_using_singletons_subtyping")
    name: "enums_using_singletons_subtyping",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        type MyEnum1 = "foo" | "bar"
        type MyEnum2 = MyEnum1 | "baz"
        local a : MyEnum1 = "foo"
        local b : MyEnum2 = a
        local c : string = b
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.singletons.test.cpp:241 TEST_CASE_FIXTURE(Fixture, "tagged_unions_using_singletons")
    name: "tagged_unions_using_singletons",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        type Dog = { tag: "Dog", howls: boolean }
        type Cat = { tag: "Cat", meows: boolean }
        type Animal = Dog | Cat
        local a : Dog = { tag = "Dog", howls = true }
        local b : Animal = { tag = "Cat", meows = true }
        local c : Animal = a
        c = b
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.singletons.test.cpp:256 TEST_CASE_FIXTURE(Fixture, "tagged_unions_using_singletons_mismatch")
    name: "tagged_unions_using_singletons_mismatch",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        type Dog = { tag: "Dog", howls: boolean }
        type Cat = { tag: "Cat", meows: boolean }
        type Animal = Dog | Cat
        local a : Animal = { tag = "Cat", howls = true }
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.singletons.test.cpp:268 TEST_CASE_FIXTURE(Fixture, "tagged_unions_immutable_tag")
    // Upstream compares `rhsType` with the builtin `string` type itself, which
    // prints as `string`.
    name: "tagged_unions_immutable_tag",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        type Dog = { tag: "Dog", howls: boolean }
        type Cat = { tag: "Cat", meows: boolean }
        type Animal = Dog | Cat
        local a: Animal = { tag = "Cat", meows = true }
        a.tag = "Dog"
    `,
    expect: [
      { errors: "some" },
      { error: 0, code: "CannotAssignToNever", fields: { rhsType: "string", reason: "PropertyNarrowed", cause: ["\"Dog\"", "\"Cat\""] } },
    ],
  },
  {
    // TypeInfer.singletons.test.cpp:293 TEST_CASE_FIXTURE(Fixture, "table_has_a_boolean")
    name: "table_has_a_boolean",
    fixture: "Fixture",
    source: `
        local t={a=1,b=false}
    `,
    expect: [{ type: "t", options: { exhaustive: true }, equals: "{ a: number, b: boolean }" }],
  },
  {
    // TypeInfer.singletons.test.cpp:305 TEST_CASE_FIXTURE(Fixture, "table_properties_singleton_strings")
    name: "table_properties_singleton_strings",
    fixture: "Fixture",
    source: `
        --!strict
        type T = {
            ["foo"] : number,
            ["$$bar"] : string,
            baz : boolean
        }
        local t: T =  {
            ["foo"] = 37,
            ["$$bar"] = "hi",
            baz = true
        }
        local a: number = t.foo
        local b: string = t["$$bar"]
        local c: boolean = t.baz
        t.foo = 5
        t["$$bar"] = "lo"
        t.baz = false
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.singletons.test.cpp:329 TEST_CASE_FIXTURE(Fixture, "table_properties_singleton_strings_mismatch")
    name: "table_properties_singleton_strings_mismatch",
    fixture: "Fixture",
    source: `
        --!strict
        type T = {
            ["$$bar"] : string,
        }
        local t: T =  {
            ["$$bar"] = "hi",
        }
        t["$$bar"] = 5
    `,
    expect: [
      { errors: 1 },
      { error: 0, message: "Expected this to be 'string', but got 'number'" },
    ],
  },
  {
    // TypeInfer.singletons.test.cpp:346 TEST_CASE_FIXTURE(Fixture, "table_properties_alias_or_parens_is_indexer")
    name: "table_properties_alias_or_parens_is_indexer",
    fixture: "Fixture",
    malformed: "Cannot have more than one table indexer",
    source: `
        --!strict
        type S = "bar"
        type T = {
            [("foo")] : number,
            [S] : string,
        }
    `,
    expect: [{ errors: 1 }, { error: 0, message: "Cannot have more than one table indexer" }],
  },
  {
    // TypeInfer.singletons.test.cpp:361 TEST_CASE_FIXTURE(Fixture, "indexer_can_be_union_of_singletons")
    name: "indexer_can_be_union_of_singletons",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        type Target = "A" | "B"

        type Test = {[Target]: number}

        local test: Test = {}

        test.A = 2
        test.C = 4
    `,
    expect: [{ errors: 1 }, { error: 0, line: 8 }],
  },
  {
    // TypeInfer.singletons.test.cpp:382 TEST_CASE_FIXTURE(Fixture, "table_properties_type_error_escapes")
    name: "table_properties_type_error_escapes",
    fixture: "Fixture",
    source: `
        --!strict
        local x: { ["<>"] : number }
        x = { ["\\n"] = 5 }
    `,
    expect: [
      { errors: 1 },
      { error: 0, message: "Table type '{ [\"\\n\"]: number }' not compatible with type '{ [\"<>\"]: number }' because the former is missing field '<>'" },
    ],
  },
  {
    // TypeInfer.singletons.test.cpp:399 TEST_CASE_FIXTURE(Fixture, "error_detailed_tagged_union_mismatch_string")
    name: "error_detailed_tagged_union_mismatch_string",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
type Cat = { tag: 'cat', catfood: string }
type Dog = { tag: 'dog', dogfood: string }
type Animal = Cat | Dog

local a: Animal = { tag = 'cat', cafood = 'something' }
    `,
    expect: [
      { errors: 1 },
      { error: 0, message: "Table type '{ cafood: string, tag: \"cat\" }' not compatible with type 'Cat' because the former is missing field 'catfood'" },
    ],
  },
  {
    // TypeInfer.singletons.test.cpp:425 TEST_CASE_FIXTURE(Fixture, "error_detailed_tagged_union_mismatch_bool")
    name: "error_detailed_tagged_union_mismatch_bool",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
type Good = { success: true, result: string }
type Bad = { success: false, error: string }
type Result = Good | Bad

local a: Result = { success = false, result = 'something' }
    `,
    expect: [
      { errors: 1 },
      { error: 0, message: "Table type '{ result: string, success: false }' not compatible with type 'Bad' because the former is missing field 'error'" },
    ],
  },
  {
    // TypeInfer.singletons.test.cpp:453 TEST_CASE_FIXTURE(Fixture, "parametric_tagged_union_alias")
    name: "parametric_tagged_union_alias",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        type Ok<T> = {success: true, result: T}
        type Err<T> = {success: false, error: T}
        type Result<O, E> = Ok<O> | Err<E>

        local a : Result<string, number> = {success = false, result = "hotdogs"}
        -- local b : Result<string, number> = {success = true, result = "hotdogs"}
    `,
    expect: [
      { errors: 1 },
      { error: 0, message: "Table type '{ result: string, success: false }' not compatible with type 'Err<number>' because the former is missing field 'error'" },
    ],
  },
  {
    // TypeInfer.singletons.test.cpp:474 TEST_CASE_FIXTURE(Fixture, "if_then_else_expression_singleton_options")
    name: "if_then_else_expression_singleton_options",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
type Cat = { tag: 'cat', catfood: string }
type Dog = { tag: 'dog', dogfood: string }
type Animal = Cat | Dog

local a: Animal = if true then { tag = 'cat', catfood = 'something' } else { tag = 'dog', dogfood = 'other' }
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.singletons.test.cpp:487 TEST_CASE_FIXTURE(Fixture, "widen_the_supertype_if_it_is_free_and_subtype_has_singleton")
    name: "widen_the_supertype_if_it_is_free_and_subtype_has_singleton",
    fixture: "Fixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        local function foo(f, x)
            if x == "hi" then
                f(x)
                f("foo")
            end
        end
    `,
    expect: [],
  },
  {
    // TypeInfer.singletons.test.cpp:507 TEST_CASE_FIXTURE(Fixture, "return_type_of_f_is_not_widened")
    name: "return_type_of_f_is_not_widened",
    fixture: "Fixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    unparsed: { defect: 881 }, // an if expression written over several lines
    source: `
        local function foo(f, x): "hello"? -- anyone there?
            return if x == "hi"
                then f(x)
                else nil
        end
    `,
    expect: [],
  },
  {
    // TypeInfer.singletons.test.cpp:526 TEST_CASE_FIXTURE(Fixture, "widening_happens_almost_everywhere")
    name: "widening_happens_almost_everywhere",
    fixture: "Fixture",
    source: `
        local foo: "foo" = "foo"
        local copy = foo
    `,
    expect: [{ errors: 0 }, { type: "copy", equals: "\"foo\"" }],
  },
  {
    // TypeInfer.singletons.test.cpp:541 TEST_CASE_FIXTURE(Fixture, "widening_happens_almost_everywhere_except_for_tables")
    name: "widening_happens_almost_everywhere_except_for_tables",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        type Cat = {tag: "Cat", meows: boolean}
        type Dog = {tag: "Dog", barks: boolean}
        type Animal = Cat | Dog

        local function f(tag: "Cat" | "Dog"): Animal?
            if tag == "Cat" then
                local result = {tag = tag, meows = true}
                return result
            elseif tag == "Dog" then
                local result = {tag = tag, barks = true}
                return result
            else
                return nil
            end
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.singletons.test.cpp:564 TEST_CASE_FIXTURE(Fixture, "functions_are_not_to_be_widened")
    name: "functions_are_not_to_be_widened",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        local function foo(my_enum: "A" | "B") end
    `,
    expect: [{ errors: 0 }, { type: "foo", equals: "(\"A\" | \"B\") -> ()" }],
  },
  {
    // TypeInfer.singletons.test.cpp:575 TEST_CASE_FIXTURE(Fixture, "indexing_on_string_singletons")
    name: "indexing_on_string_singletons",
    fixture: "Fixture",
    source: `
        local a: string = "hi"
        if a == "hi" then
            local x = a:byte()
        end
    `,
    expect: [{ errors: 0 }, { typeAt: [3, 22], equals: "\"hi\"" }],
  },
  {
    // TypeInfer.singletons.test.cpp:589 TEST_CASE_FIXTURE(Fixture, "indexing_on_union_of_string_singletons")
    name: "indexing_on_union_of_string_singletons",
    fixture: "Fixture",
    source: `
        local a: string = "hi"
        if a == "hi" or a == "bye" then
            local x = a:byte()
        end
    `,
    expect: [{ errors: 0 }, { typeAt: [3, 22], equals: "\"bye\" | \"hi\"" }],
  },
  {
    // TypeInfer.singletons.test.cpp:603 TEST_CASE_FIXTURE(Fixture, "taking_the_length_of_string_singleton")
    name: "taking_the_length_of_string_singleton",
    fixture: "Fixture",
    source: `
        local a: string = "hi"
        if a == "hi" then
            local x = #a
        end
    `,
    expect: [{ errors: 0 }, { typeAt: [3, 23], equals: "\"hi\"" }],
  },
  {
    // TypeInfer.singletons.test.cpp:617 TEST_CASE_FIXTURE(Fixture, "taking_the_length_of_union_of_string_singleton")
    name: "taking_the_length_of_union_of_string_singleton",
    fixture: "Fixture",
    source: `
        local a: string = "hi"
        if a == "hi" or a == "bye" then
            local x = #a
        end
    `,
    expect: [{ errors: 0 }, { typeAt: [3, 23], equals: "\"bye\" | \"hi\"" }],
  },
  {
    // TypeInfer.singletons.test.cpp:631 TEST_CASE_FIXTURE(Fixture, "no_widening_from_callsites")
    name: "no_widening_from_callsites",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        type Direction = "North" | "East" | "West" | "South"

        local function direction(): Direction
            return "North"
        end

        local d: Direction = direction()
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.singletons.test.cpp:646 TEST_CASE_FIXTURE(BuiltinsFixture, "singletons_stick_around_under_assignment")
    name: "singletons_stick_around_under_assignment",
    fixture: "BuiltinsFixture",
    source: `
        type Foo = {
            kind: "Foo",
        }

        local foo = (nil :: any) :: Foo

        print(foo.kind == "Bar") -- type of equality refines to \`false\`
        local kind = foo.kind
        print(kind == "Bar") -- type of equality refines to \`false\`
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.singletons.test.cpp:666 TEST_CASE_FIXTURE(Fixture, "tagged_union_in_ternary")
    name: "tagged_union_in_ternary",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        type Result = { type: "ok", value: unknown } | { type: "error" }

        local function coinflip(): boolean return true end

        local function readFromDB(): Result
            return if coinflip() then { type = "ok", value = 42 } else { type = "error" }
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.singletons.test.cpp:679 TEST_CASE_FIXTURE(Fixture, "table_literal_with_singleton_union_values")
    name: "table_literal_with_singleton_union_values",
    fixture: "Fixture",
    source: `
        local t1: {[string]: "a" | "b"} = { a = "a", b = "b" }
        local t2: {[string]: "a" | true} = { a = "a", b = true }
        local t3: {[string]: "a" | nil} = { a = "a" }
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.singletons.test.cpp:690 TEST_CASE_FIXTURE(Fixture, "singleton_type_mismatch_via_variable")
    name: "singleton_type_mismatch_via_variable",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        local c = "c"
        local x: "a" = c
        local y: "a" | "b" = c
        local z: "a"? = c
        local w: "a" | "b" = "c"
    `,
    expect: [
      { errors: 4 },
      { error: 0, code: "TypeMismatch" },
      { error: 1, code: "TypeMismatch" },
      { error: 2, code: "TypeMismatch" },
      { error: 3, code: "TypeMismatch" },
    ],
  },
  {
    // TypeInfer.singletons.test.cpp:708 TEST_CASE_FIXTURE(Fixture, "cli_163481_any_indexer_pushes_type")
    name: "cli_163481_any_indexer_pushes_type",
    fixture: "Fixture",
    source: `
        --!strict

        type test = "A"
        type test2 = "A"|"B"|"C"

        local t: { [any]: test } = { A = "A" }

        local t2: { [any]: test2 } = {
            A = "A",
            B = "B",
            C = "C"
        }
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.singletons.test.cpp:726 TEST_CASE_FIXTURE(Fixture, "oss_2010")
    name: "oss_2010",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        local function foo<T>(my_enum: "" | T): T
            return my_enum :: T
        end

        local var = foo("meow")
    `,
    expect: [{ errors: 0 }, { type: "var", equals: "\"meow\"" }],
  },
  {
    // TypeInfer.singletons.test.cpp:741 TEST_CASE_FIXTURE(Fixture, "oss_1773")
    name: "oss_1773",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        --!strict

        export type T = "foo" | "bar" | "toto"

        local object: T = "foo"

        local getOpposite: {[T]: T} = {
            ["foo"] = "bar",
            ["bar"] = "toto",
            ["toto"] = "foo"
        }

        local function hello()
            local x = getOpposite[object]

            if x then
                object = x
            end
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.singletons.test.cpp:768 TEST_CASE_FIXTURE(Fixture, "bidirectionally_infer_indexers_errored")
    // Upstream checks that every error is a TypeMismatch; there are three.
    name: "bidirectionally_infer_indexers_errored",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        --!strict

        export type T = "foo" | "bar" | "toto"

        local getOpposite: { [number]: T } = {
            ["foo"] = "bar",
            ["bar"] = "toto",
            ["toto"] = "foo"
        }
    `,
    expect: [
      { errors: 3 },
      { error: 0, code: "TypeMismatch" },
      { error: 1, code: "TypeMismatch" },
      { error: 2, code: "TypeMismatch" },
    ],
  },
  {
    // TypeInfer.singletons.test.cpp:790 TEST_CASE_FIXTURE(Fixture, "oss_2018")
    name: "oss_2018",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        local rule: { rule: "AppendTextComment" } | { rule: "Other" } = { rule = "AppendTextComment" }
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.singletons.test.cpp:797 TEST_CASE_FIXTURE(Fixture, "oss_2010_but_with_booleans")
    name: "oss_2010_but_with_booleans",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        local function foo<T>(my_enum: true | T): T
            return my_enum :: T
        end

        local function bar<T>(my_enum: true & T): T
            return my_enum :: T
        end

        local var1 = foo(true)
        local var2 = foo(false)

        local var3 = bar(true)
        local var4 = bar(false)
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "TypeMismatch", fields: { wantedType: "false & true", givenType: "false" } },
      { type: "var1", equals: "unknown" },
      { type: "var2", equals: "false" },
      { type: "var3", equals: "true" },
      { type: "var4", equals: "false" },
    ],
  },
  {
    // TypeInfer.singletons.test.cpp:833 TEST_CASE_FIXTURE(Fixture, "cli_184125")
    name: "cli_184125",
    fixture: "Fixture",
    source: `
        type MyTypeA = {Value: true}
        type MyTypeB = {Value: false}

        local function Func(input: number) : (MyTypeA | MyTypeB)
            if input == 1 then
                return {Value = true}
            else
                return {Value = false}
            end
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.singletons.test.cpp:851 TEST_CASE_FIXTURE(Fixture, "pass_singleton_through_to_identity")
    name: "pass_singleton_through_to_identity",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        local function id(x) return x end

        local function foobar(): "hello"
            return id("hello")
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.singletons.test.cpp:866 TEST_CASE_FIXTURE(BuiltinsFixture, "singleton_when_type_is_blocked")
    name: "singleton_when_type_is_blocked",
    fixture: "BuiltinsFixture",
    ignoreMissingAnnotations: true,
    source: `
        local function id(x: typeof("hello")) return x end

        local function foobar()
            return id("hello")
        end
    `,
    expect: [{ errors: 0 }],
  },
]);
