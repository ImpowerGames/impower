import { portUpstreamFile } from "./portedCases";

portUpstreamFile("TypeInfer.unknownnever.test.cpp", [
  {
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
    name: "unknown_is_optional_because_it_too_encompasses_nil",
    fixture: "Fixture",
    source: `
        local t: {x: unknown} = {}
    `,
    expect: [],
  },
  {
    name: "table_with_prop_of_type_never_is_uninhabitable",
    fixture: "Fixture",
    source: `
        local t: {x: never} = {}
    `,
    expect: [{ errors: 1 }],
  },
  {
    name: "table_with_prop_of_type_never_is_also_reflexive",
    fixture: "Fixture",
    source: `
        local t: {x: never} = {x = 5 :: never}
    `,
    expect: [{ errors: 0 }],
  },
  {
    name: "array_like_table_of_never_is_inhabitable",
    fixture: "Fixture",
    source: `
        local t: {never} = {}
    `,
    expect: [{ errors: 0 }],
  },
  {
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
    name: "index_on_never",
    fixture: "Fixture",
    source: `
        local x: never = 5 :: never
        local z = x.y
    `,
    expect: [{ errors: 0 }, { type: "z", equals: "never" }],
  },
  {
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
    name: "assign_to_local_which_is_never",
    fixture: "Fixture",
    source: `
        local t: never
        t = 3
    `,
    expect: [{ errors: 1 }],
  },
  {
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
    name: "for_loop_over_never",
    fixture: "Fixture",
    source: `
        for i, v in (5 :: never) do
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
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
    name: "index_on_union_of_tables_for_properties_that_is_never",
    fixture: "Fixture",
    skip: { newSolver: "upstream returns before checking on the new solver, which warns wrongly here (CLI-117116)" },
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
    name: "index_on_union_of_tables_for_properties_that_is_sorta_never",
    fixture: "Fixture",
    skip: { newSolver: "upstream returns before checking on the new solver, which warns wrongly here (CLI-117116)" },
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
    name: "unary_minus_of_never",
    fixture: "Fixture",
    source: `
        local x = -(5 :: never)
    `,
    expect: [{ errors: 0 }, { type: "x", equals: "never" }],
  },
  {
    name: "length_of_never",
    fixture: "Fixture",
    source: `
        local x = #({} :: never)
    `,
    expect: [{ errors: 0 }, { type: "x", equals: "number" }],
  },
  {
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
    name: "math_operators_and_never",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
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
