// Luau's type-checker tests from `tests/TypeInfer.unknownnever.test.cpp` at the
// commit pinned in `../upstream/typecheck-cases.json`, ported as `README.md`
// describes. Each case names its upstream line.

import { portUpstreamFile } from "./portedCases";

portUpstreamFile("TypeInfer.unknownnever.test.cpp", [
  {
    // TypeInfer.unknownnever.test.cpp:13 TEST_CASE_FIXTURE(Fixture, "string_subtype_and_unknown_supertype")
    name: "string_subtype_and_unknown_supertype",
    fixture: "Fixture",
    source: `
        local function f(x: string)
            local foo: unknown = x
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.unknownnever.test.cpp:24 TEST_CASE_FIXTURE(Fixture, "unknown_subtype_and_string_supertype")
    name: "unknown_subtype_and_string_supertype",
    fixture: "Fixture",
    source: `
        local function f(x: unknown)
            local foo: string = x
        end
    `,
    expect: [{ errors: 1 }],
  },
  {
    // TypeInfer.unknownnever.test.cpp:35 TEST_CASE_FIXTURE(Fixture, "unknown_is_reflexive")
    name: "unknown_is_reflexive",
    fixture: "Fixture",
    source: `
        local function f(x: unknown)
            local foo: unknown = x
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.unknownnever.test.cpp:46 TEST_CASE_FIXTURE(Fixture, "string_subtype_and_never_supertype")
    name: "string_subtype_and_never_supertype",
    fixture: "Fixture",
    source: `
        local function f(x: string)
            local foo: never = x
        end
    `,
    expect: [{ errors: 1 }],
  },
  {
    // TypeInfer.unknownnever.test.cpp:57 TEST_CASE_FIXTURE(Fixture, "never_subtype_and_string_supertype")
    name: "never_subtype_and_string_supertype",
    fixture: "Fixture",
    source: `
        local function f(x: never)
            local foo: string = x
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.unknownnever.test.cpp:68 TEST_CASE_FIXTURE(Fixture, "never_is_reflexive")
    name: "never_is_reflexive",
    fixture: "Fixture",
    source: `
        local function f(x: never)
            local foo: never = x
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.unknownnever.test.cpp:79 TEST_CASE_FIXTURE(Fixture, "unknown_is_optional_because_it_too_encompasses_nil")
    // Upstream asserts nothing about the result.
    name: "unknown_is_optional_because_it_too_encompasses_nil",
    fixture: "Fixture",
    source: `
        local t: {x: unknown} = {}
    `,
    expect: [],
  },
  {
    // TypeInfer.unknownnever.test.cpp:86 TEST_CASE_FIXTURE(Fixture, "table_with_prop_of_type_never_is_uninhabitable")
    name: "table_with_prop_of_type_never_is_uninhabitable",
    fixture: "Fixture",
    source: `
        local t: {x: never} = {}
    `,
    expect: [{ errors: 1 }],
  },
  {
    // TypeInfer.unknownnever.test.cpp:95 TEST_CASE_FIXTURE(Fixture, "table_with_prop_of_type_never_is_also_reflexive")
    name: "table_with_prop_of_type_never_is_also_reflexive",
    fixture: "Fixture",
    source: `
        local t: {x: never} = {x = 5 :: never}
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.unknownnever.test.cpp:104 TEST_CASE_FIXTURE(Fixture, "array_like_table_of_never_is_inhabitable")
    name: "array_like_table_of_never_is_inhabitable",
    fixture: "Fixture",
    source: `
        local t: {never} = {}
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.unknownnever.test.cpp:113 TEST_CASE_FIXTURE(Fixture, "type_packs_containing_never_is_itself_uninhabitable")
    name: "type_packs_containing_never_is_itself_uninhabitable",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        local function f() return "foo", 5 :: never end

        local x, y, z = f()
    `,
    expect: [
      { errors: 1 },
      { error: 0, message: "Function only returns 2 values, but 3 are required here" },
      { type: "x", equals: "string" },
      { type: "y", equals: "never" },
      { type: "z", equals: "nil" },
    ],
  },
  {
    // TypeInfer.unknownnever.test.cpp:142 TEST_CASE_FIXTURE(Fixture, "type_packs_containing_never_is_itself_uninhabitable2")
    name: "type_packs_containing_never_is_itself_uninhabitable2",
    fixture: "Fixture",
    source: `
        local function f(): (string, never) return "", 5 :: never end
        local function g(): (never, string) return 5 :: never, "" end

        local x1, x2 = f()
        local y1, y2 = g()
    `,
    expect: [
      { errors: 0 },
      { type: "x1", equals: "string" },
      { type: "x2", equals: "never" },
      { type: "y1", equals: "never" },
      { type: "y2", equals: "string" },
    ],
  },
  {
    // TypeInfer.unknownnever.test.cpp:170 TEST_CASE_FIXTURE(Fixture, "index_on_never")
    name: "index_on_never",
    fixture: "Fixture",
    source: `
        local x: never = 5 :: never
        local z = x.y
    `,
    expect: [{ errors: 0 }, { type: "z", equals: "never" }],
  },
  {
    // TypeInfer.unknownnever.test.cpp:182 TEST_CASE_FIXTURE(Fixture, "call_never")
    name: "call_never",
    fixture: "Fixture",
    source: `
        local f: never = 5 :: never
        local x, y, z = f()
    `,
    expect: [
      { errors: 0 },
      { type: "x", equals: "never" },
      { type: "y", equals: "never" },
      { type: "z", equals: "never" },
    ],
  },
  {
    // TypeInfer.unknownnever.test.cpp:196 TEST_CASE_FIXTURE(Fixture, "assign_to_local_which_is_never")
    // CLI-117119 upstream: what assigning to `never` should do is undecided.
    name: "assign_to_local_which_is_never",
    fixture: "Fixture",
    source: `
        local t: never
        t = 3
    `,
    expect: [{ errors: 1 }],
  },
  {
    // TypeInfer.unknownnever.test.cpp:214 TEST_CASE_FIXTURE(Fixture, "assign_to_global_which_is_never")
    name: "assign_to_global_which_is_never",
    fixture: "Fixture",
    source: `
        --!nonstrict
        t = 5 :: never
        t = ""
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.unknownnever.test.cpp:225 TEST_CASE_FIXTURE(Fixture, "assign_to_prop_which_is_never")
    name: "assign_to_prop_which_is_never",
    fixture: "Fixture",
    source: `
        local function f(t: never)
            t.x = 5
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.unknownnever.test.cpp:236 TEST_CASE_FIXTURE(Fixture, "assign_to_subscript_which_is_never")
    name: "assign_to_subscript_which_is_never",
    fixture: "Fixture",
    source: `
        local function f(t: never)
            t[5] = 7
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.unknownnever.test.cpp:247 TEST_CASE_FIXTURE(Fixture, "for_loop_over_never")
    name: "for_loop_over_never",
    fixture: "Fixture",
    source: `
        for i, v in (5 :: never) do
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.unknownnever.test.cpp:257 TEST_CASE_FIXTURE(Fixture, "pick_never_from_variadic_type_pack")
    name: "pick_never_from_variadic_type_pack",
    fixture: "Fixture",
    source: `
        local function f(...: never)
            local x, y = (...)
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.unknownnever.test.cpp:268 TEST_CASE_FIXTURE(Fixture, "index_on_union_of_tables_for_properties_that_is_never")
    name: "index_on_union_of_tables_for_properties_that_is_never",
    fixture: "Fixture",
    skip: { newSolver: "upstream returns before checking on the new solver, which warns wrongly here (CLI-117116)" },
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        type Disjoint = {foo: never, bar: unknown, tag: "ok"} | {foo: never, baz: unknown, tag: "err"}

        function f(disjoint: Disjoint)
            return disjoint.foo
        end

        local foo = f({foo = 5 :: never, bar = true, tag = "ok"})
    `,
    expect: [],
  },
  {
    // TypeInfer.unknownnever.test.cpp:288 TEST_CASE_FIXTURE(Fixture, "index_on_union_of_tables_for_properties_that_is_sorta_never")
    name: "index_on_union_of_tables_for_properties_that_is_sorta_never",
    fixture: "Fixture",
    skip: { newSolver: "upstream returns before checking on the new solver, which warns wrongly here (CLI-117116)" },
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        type Disjoint = {foo: string, bar: unknown, tag: "ok"} | {foo: never, baz: unknown, tag: "err"}

        function f(disjoint: Disjoint)
            return disjoint.foo
        end

        local foo = f({foo = 5 :: never, bar = true, tag = "ok"})
    `,
    expect: [],
  },
  {
    // TypeInfer.unknownnever.test.cpp:308 TEST_CASE_FIXTURE(Fixture, "unary_minus_of_never")
    name: "unary_minus_of_never",
    fixture: "Fixture",
    source: `
        local x = -(5 :: never)
    `,
    expect: [{ errors: 0 }, { type: "x", equals: "never" }],
  },
  {
    // TypeInfer.unknownnever.test.cpp:319 TEST_CASE_FIXTURE(Fixture, "length_of_never")
    name: "length_of_never",
    fixture: "Fixture",
    source: `
        local x = #({} :: never)
    `,
    expect: [{ errors: 0 }, { type: "x", equals: "number" }],
  },
  {
    // TypeInfer.unknownnever.test.cpp:330 TEST_CASE_FIXTURE(Fixture, "dont_unify_operands_if_one_of_the_operand_is_never_in_any_ordering_operators")
    name: "dont_unify_operands_if_one_of_the_operand_is_never_in_any_ordering_operators",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        local function ord(x: nil, y)
            return x ~= nil and x > y
        end
    `,
    expect: [{ errors: 0 }, { type: "ord", equals: "(nil, nil & ~nil) -> boolean" }],
  },
  {
    // TypeInfer.unknownnever.test.cpp:347 TEST_CASE_FIXTURE(Fixture, "math_operators_and_never")
    name: "math_operators_and_never",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    unparsed: { defect: 880 }, // a -- comment after an arithmetic expression
    source: `
        local function mul(x: nil, y)
            return x ~= nil and x * y -- infers boolean | never, which is normalized into boolean
        end
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "ExplicitFunctionAnnotationRecommended" },
      { type: "mul", equals: "<T>(nil, T) -> false | mul<nil & ~nil, T>" },
    ],
  },
  {
    // TypeInfer.unknownnever.test.cpp:373 TEST_CASE_FIXTURE(Fixture, "compare_never")
    name: "compare_never",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        local function cmp(x: nil, y: number)
            return x ~= nil and x > y and x < y -- infers boolean | never, which is normalized into boolean
        end
    `,
    expect: [{ errors: 0 }, { type: "cmp", equals: "(nil, number) -> boolean" }],
  },
  {
    // TypeInfer.unknownnever.test.cpp:387 TEST_CASE_FIXTURE(Fixture, "lti_error_at_declaration_for_never_normalizations")
    name: "lti_error_at_declaration_for_never_normalizations",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        local function num(x: number) end
        local function str(x: string) end
        local function cond(): boolean return false end

        local function f(a)
            if cond() then
                num(a)
            else
                str(a)
            end
        end
    `,
    expect: [
      { errors: 3 },
      { error: 0, message: "Parameter 'a' has been reduced to never. This function is not callable with any possible value." },
      { error: 1, message: "Parameter 'a' is required to be a subtype of 'number' here." },
      { error: 2, message: "Parameter 'a' is required to be a subtype of 'string' here." },
    ],
  },
  {
    // TypeInfer.unknownnever.test.cpp:413 TEST_CASE_FIXTURE(Fixture, "lti_permit_explicit_never_annotation")
    name: "lti_permit_explicit_never_annotation",
    fixture: "Fixture",
    source: `
        local function num(x: number) end
        local function str(x: string) end
        local function cond(): boolean return false end

        local function f(a: never)
            if cond() then
                num(a)
            else
                str(a)
            end
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.unknownnever.test.cpp:434 TEST_CASE_FIXTURE(Fixture, "cast_from_never_does_not_error")
    name: "cast_from_never_does_not_error",
    fixture: "Fixture",
    source: `
        local function f(x: never): number
            return x :: number
        end
    `,
    expect: [{ errors: 0 }],
  },
]);
