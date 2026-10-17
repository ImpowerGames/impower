// Luau tests/TypeInfer.refinements.test.cpp at 7d5f73364fdbbaa984fa545071630eba73cfea98.
// Sources and expectations follow the new-solver CI branches at this pin.

import { portUpstreamFile, type PortedCase } from "./portedCases";

export const cases: PortedCase[] = [
  // TypeInfer.refinements.test.cpp:157 TEST_CASE_FIXTURE(Fixture, "is_truthy_constraint")
  {
    name: "is_truthy_constraint",
    fixture: "Fixture",
    checks: [
      {
        source: `
        function f(v: string?)
            if v then
                local s = v
            else
                local s = v
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 26],
            equals: "string",
          },
          {
            typeAt: [5, 26],
            equals: "nil",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:175 TEST_CASE_FIXTURE(Fixture, "invert_is_truthy_constraint")
  {
    name: "invert_is_truthy_constraint",
    fixture: "Fixture",
    checks: [
      {
        source: `
        function f(v: string?)
            if not v then
                local s = v
            else
                local s = v
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 26],
            equals: "nil",
          },
          {
            typeAt: [5, 26],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:193 TEST_CASE_FIXTURE(Fixture, "parenthesized_expressions_are_followed_through")
  {
    name: "parenthesized_expressions_are_followed_through",
    fixture: "Fixture",
    checks: [
      {
        source: `
        function f(v: string?)
            if (not v) then
                local s = v
            else
                local s = v
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 26],
            equals: "nil",
          },
          {
            typeAt: [5, 26],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:211 TEST_CASE_FIXTURE(Fixture, "and_constraint")
  {
    name: "and_constraint",
    fixture: "Fixture",
    checks: [
      {
        source: `
        function f(a: string?, b: number?)
            if a and b then
                local x = a
                local y = b
            else
                local x = a
                local y = b
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 26],
            equals: "string",
          },
          {
            typeAt: [4, 26],
            equals: "number",
          },
          {
            typeAt: [6, 26],
            equals: "string?",
          },
          {
            typeAt: [7, 26],
            equals: "number?",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:234 TEST_CASE_FIXTURE(Fixture, "not_and_constraint")
  {
    name: "not_and_constraint",
    fixture: "Fixture",
    checks: [
      {
        source: `
        function f(a: string?, b: number?)
            if not (a and b) then
                local x = a
                local y = b
            else
                local x = a
                local y = b
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 26],
            equals: "string?",
          },
          {
            typeAt: [4, 26],
            equals: "number?",
          },
          {
            typeAt: [6, 26],
            equals: "string",
          },
          {
            typeAt: [7, 26],
            equals: "number",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:257 TEST_CASE_FIXTURE(Fixture, "or_predicate_with_truthy_predicates")
  {
    name: "or_predicate_with_truthy_predicates",
    fixture: "Fixture",
    checks: [
      {
        source: `
        function f(a: string?, b: number?)
            if a or b then
                local x = a
                local y = b
            else
                local x = a
                local y = b
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 26],
            equals: "string?",
          },
          {
            typeAt: [4, 26],
            equals: "number?",
          },
          {
            typeAt: [6, 26],
            equals: "nil",
          },
          {
            typeAt: [7, 26],
            equals: "nil",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:280 TEST_CASE_FIXTURE(Fixture, "a_and_b_or_a_and_c")
  {
    name: "a_and_b_or_a_and_c",
    fixture: "Fixture",
    checks: [
      {
        source: `
        function f(a: string?, b: number?, c: boolean)
            if (a and b) or (a and c) then
                local foo = a
                local bar = b
                local baz = c
            else
                local foo = a
                local bar = b
                local baz = c
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 28],
            equals: "string",
          },
          {
            typeAt: [4, 28],
            equals: "number?",
          },
          {
            typeAt: [5, 28],
            equals: "boolean",
          },
          {
            typeAt: [7, 28],
            equals: "string?",
          },
          {
            typeAt: [8, 28],
            equals: "number?",
          },
          {
            typeAt: [9, 28],
            equals: "boolean",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:311 TEST_CASE_FIXTURE(Fixture, "type_assertion_expr_carry_its_constraints")
  {
    name: "type_assertion_expr_carry_its_constraints",
    fixture: "Fixture",
    checks: [
      {
        source: `
        function g(a: number?, b: string?)
            if (a :: any) and (b :: any) then
                local x = a
                local y = b
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 26],
            equals: "number?",
          },
          {
            typeAt: [4, 26],
            equals: "string?",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:337 TEST_CASE_FIXTURE(BuiltinsFixture, "typeguard_in_if_condition_position")
  {
    name: "typeguard_in_if_condition_position",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        function f(s: any, t: unknown)
            if type(s) == "number" then
                local n = s
            end
            if type(t) == "number" then
                local n = t
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 26],
            equals: "*error-type* | number",
          },
          {
            typeAt: [6, 26],
            equals: "number",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:360 TEST_CASE_FIXTURE(BuiltinsFixture, "typeguard_in_assert_position")
  {
    name: "typeguard_in_assert_position",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        function f(a)
            assert(type(a) == "number")
            local b = a
            return b
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "f",
            equals: "<T>(T) -> T & number",
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:380 TEST_CASE_FIXTURE(BuiltinsFixture, "refine_unknown_to_table_then_test_a_prop")
  {
    name: "refine_unknown_to_table_then_test_a_prop",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: unknown): string?
            if typeof(x) == "table" then
                if typeof(x.foo) == "string" then
                    return x.foo
                end
            end

            return nil
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:409 TEST_CASE_FIXTURE(BuiltinsFixture, "refine_unknown_to_table_then_test_a_nested_prop")
  {
    name: "refine_unknown_to_table_then_test_a_nested_prop",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: unknown): string?
            if typeof(x) == "table" then
                -- this should error, \`x.foo\` is an unknown property
                if typeof(x.foo.bar) == "string" then
                    return x.foo.bar
                end
            end

            return nil
        end
    `,
        expect: [
          {
            errors: 1,
          },
          {
            error: 0,
            code: "UnknownProperty",
            fields: {
              key: "bar",
            },
          },
          {
            error: 0,
            code: "UnknownProperty",
            fields: {
              table: "unknown",
            },
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:444 TEST_CASE_FIXTURE(BuiltinsFixture, "refine_unknown_to_table_then_test_a_tested_nested_prop")
  {
    name: "refine_unknown_to_table_then_test_a_tested_nested_prop",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: unknown): string?
            if typeof(x) == "table" then
                if typeof(x.foo) == "table" and typeof(x.foo.bar) == "string" then
                    return x.foo.bar
                end
            end

            return nil
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:473 TEST_CASE_FIXTURE(BuiltinsFixture, "call_to_undefined_method_is_not_a_refinement")
  {
    name: "call_to_undefined_method_is_not_a_refinement",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: unknown)
            if typeof(x) == "table" then
                if x.foo() then
                end
            end
            return (nil :: never)
        end
    `,
        expect: [
          {
            errors: 1,
          },
          {
            error: 0,
            code: "UnknownProperty",
          },
          {
            error: 0,
            code: "UnknownProperty",
            fields: {
              key: "foo",
            },
          },
          {
            error: 0,
            code: "UnknownProperty",
            fields: {
              table: "table",
            },
          },
          {
            error: 0,
            location: [3, 19, 3, 24],
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:502 TEST_CASE_FIXTURE(BuiltinsFixture, "call_an_incompatible_function_after_using_typeguard")
  {
    name: "call_an_incompatible_function_after_using_typeguard",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: number)
            return x
        end

        local function g(x: unknown)
            if type(x) == "string" then
                f(x)
            end
        end

        local function h(x: any)
            if type(x) == "string" then
                f(x)
            end
        end
    `,
        expect: [
          {
            errors: 1,
          },
          {
            error: 0,
            message: "Expected this to be 'number', but got 'string'",
          },
          {
            error: 0,
            location: [7, 18, 7, 19],
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:543 TEST_CASE_FIXTURE(BuiltinsFixture, "impossible_type_narrow_is_not_an_error")
  {
    name: "impossible_type_narrow_is_not_an_error",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local t: {string} = {"a", "b", "c"}
        local v = t[4]
        if not v then
            t[4] = "d"
        else
            print(v)
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:560 TEST_CASE_FIXTURE(Fixture, "truthy_constraint_on_properties")
  {
    name: "truthy_constraint_on_properties",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local t: {x: number?} = {x = 1}

        if t.x then
            local t2 = t
            local foo = t.x
        end

        local bar = t.x
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [4, 23],
            equals: "{ read x: number, write x: number? }",
          },
          {
            typeAt: [5, 26],
            equals: "number",
          },
          {
            type: "bar",
            equals: "number?",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:584 TEST_CASE_FIXTURE(BuiltinsFixture, "index_on_a_refined_property")
  {
    name: "index_on_a_refined_property",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local t: {x: {y: string}?} = {x = {y = "hello!"}}

        if t.x then
            print(t.x.y)
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:597 TEST_CASE_FIXTURE(BuiltinsFixture, "assert_non_binary_expressions_actually_resolve_constraints")
  {
    name: "assert_non_binary_expressions_actually_resolve_constraints",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local foo: string? = "hello"
        assert(foo)
        local bar: string = foo
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:608 TEST_CASE_FIXTURE(Fixture, "lvalue_is_equal_to_another_lvalue")
  {
    name: "lvalue_is_equal_to_another_lvalue",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local function f(a: (string | number)?, b: boolean?)
            if a == b then
                local foo, bar = a, b
            else
                local foo, bar = a, b
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 33],
            equals: "(number | string)?",
          },
          {
            typeAt: [3, 36],
            equals: "boolean?",
          },
          {
            typeAt: [5, 33],
            equals: "(number | string)?",
          },
          {
            typeAt: [5, 36],
            equals: "boolean?",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:629 TEST_CASE_FIXTURE(Fixture, "lvalue_is_equal_to_a_term")
  {
    name: "lvalue_is_equal_to_a_term",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local function f(a: (string | number)?)
            if a == 1 then
                local foo = a
            else
                local foo = a
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 28],
            equals: "(number | string)?",
          },
          {
            typeAt: [5, 28],
            equals: "(number | string)?",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:647 TEST_CASE_FIXTURE(Fixture, "term_is_equal_to_an_lvalue")
  {
    name: "term_is_equal_to_an_lvalue",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local function f(a: (string | number)?)
            if "hello" == a then
                local foo = a
            else
                local foo = a
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 28],
            equals: "\"hello\"",
          },
          {
            typeAt: [5, 28],
            equals: "((string & ~\"hello\") | number)?",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:673 TEST_CASE_FIXTURE(Fixture, "lvalue_is_not_nil")
  {
    name: "lvalue_is_not_nil",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local function f(a: (string | number)?)
            if a ~= nil then
                local foo = a
            else
                local foo = a
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 28],
            equals: "number | string",
          },
          {
            typeAt: [5, 28],
            equals: "nil",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:694 TEST_CASE_FIXTURE(Fixture, "free_type_is_equal_to_an_lvalue")
  {
    name: "free_type_is_equal_to_an_lvalue",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local function f(a, b: string?)
            if a == b then
                local foo, bar = a, b
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 33],
            equals: "unknown",
          },
          {
            typeAt: [3, 36],
            normalized: true,
            equals: "string?",
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:728 TEST_CASE_FIXTURE(Fixture, "unknown_lvalue_is_not_synonymous_with_other_on_not_equal")
  {
    name: "unknown_lvalue_is_not_synonymous_with_other_on_not_equal",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local function f(a: any, b: {x: number}?)
            if a ~= b then
                local foo, bar = a, b
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 33],
            equals: "any",
          },
          {
            typeAt: [3, 36],
            equals: "{ x: number }?",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:744 TEST_CASE_FIXTURE(Fixture, "string_not_equal_to_string_or_nil")
  {
    name: "string_not_equal_to_string_or_nil",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local t: {string} = {"hello"}

        local a: string = t[1]
        local b: string? = nil
        if a ~= b then
            local foo, bar = a, b
        else
            local foo, bar = a, b
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [6, 29],
            equals: "string",
          },
          {
            typeAt: [6, 32],
            equals: "string?",
          },
          {
            typeAt: [8, 29],
            equals: "string",
          },
          {
            typeAt: [8, 32],
            equals: "string?",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:767 TEST_CASE_FIXTURE(Fixture, "narrow_property_of_a_bounded_variable")
  {
    name: "narrow_property_of_a_bounded_variable",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local t
        local u: {x: number?} = {x = nil}
        t = u

        if t.x then
            local foo: number = t.x
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:782 TEST_CASE_FIXTURE(BuiltinsFixture, "type_narrow_to_vector")
  {
    name: "type_narrow_to_vector",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x)
            if type(x) == "vector" then
                local foo = x
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 28],
            equals: "unknown & vector",
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:802 TEST_CASE_FIXTURE(BuiltinsFixture, "nonoptional_type_can_narrow_to_nil_if_sense_is_true")
  {
    name: "nonoptional_type_can_narrow_to_nil_if_sense_is_true",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local t = {"hello"}
        local v = t[2]
        if type(v) == "nil" then
            local foo = v
        else
            local foo = v
        end

        if not (type(v) ~= "nil") then
            local foo = v
        else
            local foo = v
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [4, 24],
            equals: "nil & string",
          },
          {
            typeAt: [6, 24],
            equals: "string & ~nil",
          },
          {
            typeAt: [10, 24],
            equals: "nil",
          },
          {
            typeAt: [12, 24],
            equals: "string",
          }
        ],
      }
    ],
    flags: {
      DebugLuauAssertOnForcedConstraint: true,
      LuauRemovePrimitiveTypeConstraintAndSubtypingUnifier: true,
    },
  },
  // TypeInfer.refinements.test.cpp:842 TEST_CASE_FIXTURE(BuiltinsFixture, "typeguard_not_to_be_string")
  {
    name: "typeguard_not_to_be_string",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: string | number | boolean)
            if type(x) ~= "string" then
                local foo = x
            else
                local foo = x
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 28],
            equals: "boolean | number",
          },
          {
            typeAt: [5, 28],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:860 TEST_CASE_FIXTURE(BuiltinsFixture, "typeguard_narrows_for_table")
  {
    name: "typeguard_narrows_for_table",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: string | {x: number} | {y: boolean})
            if type(x) == "table" then
                local foo = x
            else
                local foo = x
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 28],
            equals: "{ x: number } | { y: boolean }",
          },
          {
            typeAt: [5, 28],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:878 TEST_CASE_FIXTURE(BuiltinsFixture, "typeguard_narrows_for_functions")
  {
    name: "typeguard_narrows_for_functions",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function weird(x: string | ((number) -> string))
            if type(x) == "function" then
                local foo = x
            else
                local foo = x
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 28],
            equals: "(number) -> string",
          },
          {
            typeAt: [5, 28],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:896 TEST_CASE_FIXTURE(BuiltinsFixture, "type_guard_can_filter_for_intersection_of_tables")
  {
    name: "type_guard_can_filter_for_intersection_of_tables",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        type XYCoord = {x: number} & {y: number}
        local function f(t: XYCoord?)
            if type(t) == "table" then
                local foo = t
            else
                local foo = t
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [4, 28],
            options: {
              exhaustive: true,
            },
            equals: "{ x: number } & { y: number }",
          },
          {
            typeAt: [6, 28],
            equals: "nil",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:917 TEST_CASE_FIXTURE(BuiltinsFixture, "type_guard_can_filter_for_overloaded_function")
  {
    name: "type_guard_can_filter_for_overloaded_function",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        type SomeOverloadedFunction = ((number) -> string) & ((string) -> number)
        local function f(g: SomeOverloadedFunction?)
            if type(g) == "function" then
                local foo = g
            else
                local foo = g
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [4, 28],
            equals: "((number) -> string) & ((string) -> number)",
          },
          {
            typeAt: [6, 28],
            equals: "nil",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:936 TEST_CASE_FIXTURE(BuiltinsFixture, "type_guard_narrowed_into_nothingness")
  {
    name: "type_guard_narrowed_into_nothingness",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(t: {x: number})
            if type(t) ~= "table" then
                local foo = t
                error(("Expected a table, got %s"):format(type(t)))
            end

            return t.x + 1
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 28],
            equals: "{ x: number } & ~table",
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:962 TEST_CASE_FIXTURE(Fixture, "not_a_or_not_b")
  {
    name: "not_a_or_not_b",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local function f(a: number?, b: number?)
            if (not a) or (not b) then
                local foo = a
                local bar = b
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 28],
            equals: "number?",
          },
          {
            typeAt: [4, 28],
            equals: "number?",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:979 TEST_CASE_FIXTURE(Fixture, "not_a_or_not_b2")
  {
    name: "not_a_or_not_b2",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local function f(a: number?, b: number?)
            if not (a and b) then
                local foo = a
                local bar = b
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 28],
            equals: "number?",
          },
          {
            typeAt: [4, 28],
            equals: "number?",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:996 TEST_CASE_FIXTURE(Fixture, "not_a_and_not_b")
  {
    name: "not_a_and_not_b",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local function f(a: number?, b: number?)
            if (not a) and (not b) then
                local foo = a
                local bar = b
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 28],
            equals: "nil",
          },
          {
            typeAt: [4, 28],
            equals: "nil",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1013 TEST_CASE_FIXTURE(Fixture, "not_a_and_not_b2")
  {
    name: "not_a_and_not_b2",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local function f(a: number?, b: number?)
            if not (a or b) then
                local foo = a
                local bar = b
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 28],
            equals: "nil",
          },
          {
            typeAt: [4, 28],
            equals: "nil",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1030 TEST_CASE_FIXTURE(BuiltinsFixture, "either_number_or_string")
  {
    name: "either_number_or_string",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: any, y: unknown)
            if type(x) == "number" or type(x) == "string" then
                local foo = x
            end
            if type(y) == "number" or type(y) == "string" then
                local foo = y
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 28],
            equals: "*error-type* | number | string",
          },
          {
            typeAt: [6, 28],
            equals: "number | string",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1052 TEST_CASE_FIXTURE(Fixture, "not_t_or_some_prop_of_t")
  {
    name: "not_t_or_some_prop_of_t",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local function f(t: {x: boolean}?)
            if not t or t.x then
                local foo = t
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 28],
            equals: "({ read x: ~(false?) } & { x: boolean })?",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1079 TEST_CASE_FIXTURE(BuiltinsFixture, "assert_a_to_be_truthy_then_assert_a_to_be_number")
  {
    name: "assert_a_to_be_truthy_then_assert_a_to_be_number",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local a: (number | string)?
        assert(a)
        local b = a
        assert(type(a) == "number")
        local c = a
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 18],
            equals: "number | string",
          },
          {
            typeAt: [5, 18],
            equals: "number",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1095 TEST_CASE_FIXTURE(BuiltinsFixture, "merge_should_be_fully_agnostic_of_hashmap_ordering")
  {
    name: "merge_should_be_fully_agnostic_of_hashmap_ordering",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(b: string | { x: string }, a)
            assert(type(a) == "string")
            assert(type(b) == "string" or type(b) == "table")

            if type(b) == "string" then
                local foo = b
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [6, 28],
            equals: "string",
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1116 TEST_CASE_FIXTURE(BuiltinsFixture, "refine_the_correct_types_opposite_of_when_a_is_not_number_or_string")
  {
    name: "refine_the_correct_types_opposite_of_when_a_is_not_number_or_string",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(a: string | number | boolean)
            if type(a) ~= "number" and type(a) ~= "string" then
                local foo = a
            else
                local foo = a
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 28],
            equals: "boolean",
          },
          {
            typeAt: [5, 28],
            equals: "number | string",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1134 TEST_CASE_FIXTURE(BuiltinsFixture, "is_truthy_constraint_ifelse_expression")
  {
    name: "is_truthy_constraint_ifelse_expression",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        function f(v:string?)
            return if v then v else tostring(v)
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [2, 29],
            equals: "string",
          },
          {
            typeAt: [2, 45],
            equals: "nil",
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1150 TEST_CASE_FIXTURE(BuiltinsFixture, "invert_is_truthy_constraint_ifelse_expression")
  {
    name: "invert_is_truthy_constraint_ifelse_expression",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        function f(v:string?)
            return if not v then tostring(v) else v
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [2, 42],
            equals: "nil",
          },
          {
            typeAt: [2, 50],
            equals: "string",
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1166 TEST_CASE_FIXTURE(BuiltinsFixture, "type_comparison_ifelse_expression")
  {
    name: "type_comparison_ifelse_expression",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        function returnOne(x)
            return 1
        end

        function f(v:any)
            return if typeof(v) == "number" then v else returnOne(v)
        end

        function g(v:unknown)
            return if typeof(v) == "number" then v else returnOne(v)
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [6, 49],
            equals: "*error-type* | number",
          },
          {
            typeAt: [6, 66],
            equals: "*error-type* | ~number",
          },
          {
            typeAt: [10, 49],
            equals: "number",
          },
          {
            typeAt: [10, 66],
            equals: "~number",
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1205 TEST_CASE_FIXTURE(BuiltinsFixture, "is_truthy_constraint_while_expression")
  {
    name: "is_truthy_constraint_while_expression",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        function f(v:string?)
            while v do
                local foo = v
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 28],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1220 TEST_CASE_FIXTURE(BuiltinsFixture, "invert_is_truthy_constraint_while_expression")
  {
    name: "invert_is_truthy_constraint_while_expression",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        function f(v:string?)
            while not v do
                local foo = v
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 28],
            equals: "nil",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1235 TEST_CASE_FIXTURE(BuiltinsFixture, "refine_the_correct_types_opposite_of_while_a_is_not_number_or_string")
  {
    name: "refine_the_correct_types_opposite_of_while_a_is_not_number_or_string",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(a: string | number | boolean)
            while type(a) ~= "number" and type(a) ~= "string" do
                local foo = a
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 28],
            equals: "boolean",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1250 TEST_CASE_FIXTURE(BuiltinsFixture, "correctly_lookup_a_shadowed_local_that_which_was_previously_refined")
  {
    name: "correctly_lookup_a_shadowed_local_that_which_was_previously_refined",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local foo: string? = "hi"
        assert(foo)
        local foo: number = 5
        print(foo:sub(1, 1))
    `,
        expect: [
          {
            errors: 1,
          },
          {
            error: 0,
            message: "Type 'number' does not have key 'sub'",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1264 TEST_CASE_FIXTURE(BuiltinsFixture, "correctly_lookup_property_whose_base_was_previously_refined")
  {
    name: "correctly_lookup_property_whose_base_was_previously_refined",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        type T = {x: string | number}
        local t: T? = {x = "hi"}
        if t then
            if type(t.x) == "string" then
                local foo = t.x
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [5, 30],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1281 TEST_CASE_FIXTURE(Fixture, "correctly_lookup_property_whose_base_was_previously_refined2")
  {
    name: "correctly_lookup_property_whose_base_was_previously_refined2",
    fixture: "Fixture",
    checks: [
      {
        source: `
        type T = { x: { y: number }? }

        local function f(t: T?)
            if t and t.x then
                local foo = t.x.y
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [5, 32],
            equals: "number",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1298 TEST_CASE_FIXTURE(Fixture, "apply_refinements_on_astexprindexexpr_whose_subscript_expr_is_constant_string")
  {
    name: "apply_refinements_on_astexprindexexpr_whose_subscript_expr_is_constant_string",
    fixture: "Fixture",
    checks: [
      {
        source: `
        type T = { [string]: { prop: number }? }
        local t: T = {}

        if t["hello"] then
            local foo = t["hello"].prop
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1312 TEST_CASE_FIXTURE(Fixture, "discriminate_from_truthiness_of_x")
  {
    name: "discriminate_from_truthiness_of_x",
    fixture: "Fixture",
    checks: [
      {
        source: `
        type T = {tag: "missing", x: nil} | {tag: "exists", x: string}

        local function f(t: T)
            if t.x then
                local foo = t
            else
                local bar = t
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [5, 28],
            equals: "{ tag: \"exists\", x: string }",
          },
          {
            typeAt: [7, 28],
            equals: "{ tag: \"missing\", x: nil }",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1340 TEST_CASE_FIXTURE(Fixture, "discriminate_tag")
  {
    name: "discriminate_tag",
    fixture: "Fixture",
    checks: [
      {
        source: `
        type Cat = {tag: "Cat", name: string, catfood: string}
        type Dog = {tag: "Dog", name: string, dogfood: string}
        type Animal = Cat | Dog

        local function f(animal: Animal)
            if animal.tag == "Cat" then
                local cat = animal
            elseif animal.tag == "Dog" then
                local dog = animal
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [7, 33],
            equals: "Cat",
          },
          {
            typeAt: [9, 33],
            equals: "Dog",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1362 TEST_CASE_FIXTURE(Fixture, "discriminate_tag_with_implicit_else")
  {
    name: "discriminate_tag_with_implicit_else",
    fixture: "Fixture",
    checks: [
      {
        source: `
        type Cat = {tag: "Cat", name: string, catfood: string}
        type Dog = {tag: "Dog", name: string, dogfood: string}
        type Animal = Cat | Dog

        local function f(animal: Animal)
            if animal.tag == "Cat" then
                local cat = animal
            else
                local dog = animal
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [7, 33],
            equals: "Cat",
          },
          {
            typeAt: [9, 33],
            equals: "Dog",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1384 TEST_CASE_FIXTURE(Fixture, "and_or_peephole_refinement")
  {
    name: "and_or_peephole_refinement",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local function len(a: {any})
            return a and #a or nil
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1397 TEST_CASE_FIXTURE(Fixture, "narrow_boolean_to_true_or_false")
  {
    name: "narrow_boolean_to_true_or_false",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local function f(x: boolean)
            if x then
                local foo = x
            else
                local foo = x
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 28],
            equals: "true",
          },
          {
            typeAt: [5, 28],
            equals: "false",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1415 TEST_CASE_FIXTURE(Fixture, "discriminate_on_properties_of_disjoint_tables_where_that_property_is_true_or_false")
  {
    name: "discriminate_on_properties_of_disjoint_tables_where_that_property_is_true_or_false",
    fixture: "Fixture",
    checks: [
      {
        source: `
        type Ok<T> = { ok: true, value: T }
        type Err<E> = { ok: false, error: E }
        type Result<T, E> = Ok<T> | Err<E>

        local function apply<T, E>(t: Result<T, E>, f: (T) -> (), g: (E) -> ())
            if t.ok then
                f(t.value)
            else
                g(t.error)
            end
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1434 TEST_CASE_FIXTURE(Fixture, "refine_a_property_not_to_be_nil_through_an_intersection_table")
  {
    name: "refine_a_property_not_to_be_nil_through_an_intersection_table",
    fixture: "Fixture",
    checks: [
      {
        source: `
        type T = {} & {f: ((string) -> string)?}
        local function f(t: T, x)
            if t.f then
                t.f(x)
            end
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1450 TEST_CASE_FIXTURE(RefinementExternTypeFixture, "discriminate_from_isa_of_x")
  {
    name: "discriminate_from_isa_of_x",
    fixture: "RefinementExternTypeFixture",
    checks: [
      {
        source: `
        type T = {tag: "Part", x: Part} | {tag: "Folder", x: Folder}

        local function f(t: T)
            if t.x:IsA("Part") then
                local foo = t
            else
                local bar = t
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [5, 28],
            equals: "{ tag: \"Part\", x: Part }",
          },
          {
            typeAt: [7, 28],
            equals: "{ tag: \"Folder\", x: Folder }",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1471 TEST_CASE_FIXTURE(RefinementExternTypeFixture, "typeguard_cast_free_table_to_vector")
  {
    name: "typeguard_cast_free_table_to_vector",
    fixture: "RefinementExternTypeFixture",
    checks: [
      {
        source: `
        local function f(vec)
            local X, Y, Z = vec.X, vec.Y, vec.Z

            if type(vec) == "vector" then
                local foo = vec
            elseif typeof(vec) == "Instance" then
                local foo = vec
            else
                local foo = vec
            end
        end
    `,
        expect: [],
      }
    ],
    skip: {
      newSolver: "does not pass on Luau's new solver upstream",
    },
  },
  // TypeInfer.refinements.test.cpp:1499 TEST_CASE_FIXTURE(RefinementExternTypeFixture, "typeguard_cast_instance_or_vector3_to_vector")
  {
    name: "typeguard_cast_instance_or_vector3_to_vector",
    fixture: "RefinementExternTypeFixture",
    checks: [
      {
        source: `
        local function f(x: Instance | Vector3)
            if typeof(x) == "Vector3" then
                local foo = x
            else
                local foo = x
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 28],
            equals: "Vector3",
          },
          {
            typeAt: [5, 28],
            equals: "Instance",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1517 TEST_CASE_FIXTURE(RefinementExternTypeFixture, "type_narrow_for_all_the_userdata")
  {
    name: "type_narrow_for_all_the_userdata",
    fixture: "RefinementExternTypeFixture",
    checks: [
      {
        source: `
        local function f(x: string | number | Instance | Vector3)
            if type(x) == "userdata" then
                local foo = x
            else
                local foo = x
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 28],
            equals: "Instance | Vector3",
          },
          {
            typeAt: [5, 28],
            equals: "number | string",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1535 TEST_CASE_FIXTURE(RefinementExternTypeFixture, "type_narrow_but_the_discriminant_type_isnt_a_class")
  {
    name: "type_narrow_but_the_discriminant_type_isnt_a_class",
    fixture: "RefinementExternTypeFixture",
    checks: [
      {
        source: `
        local function f(x: string | number | Instance | Vector3)
            if type(x) == "any" then
                local foo = x
            else
                local foo = x
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 28],
            equals: "never",
          },
          {
            typeAt: [5, 28],
            equals: "Instance | Vector3 | number | string",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1561 TEST_CASE_FIXTURE(RefinementExternTypeFixture, "eliminate_subclasses_of_instance")
  {
    name: "eliminate_subclasses_of_instance",
    fixture: "RefinementExternTypeFixture",
    checks: [
      {
        source: `
        local function f(x: Part | Folder | string)
            if typeof(x) == "Instance" then
                local foo = x
            else
                local foo = x
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 28],
            equals: "Folder | Part",
          },
          {
            typeAt: [5, 28],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1579 TEST_CASE_FIXTURE(RefinementExternTypeFixture, "narrow_from_subclasses_of_instance_or_string_or_vector3")
  {
    name: "narrow_from_subclasses_of_instance_or_string_or_vector3",
    fixture: "RefinementExternTypeFixture",
    checks: [
      {
        source: `
        local function f(x: Part | Folder | string | Vector3)
            if typeof(x) == "Instance" then
                local foo = x
            else
                local foo = x
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 28],
            equals: "Folder | Part",
          },
          {
            typeAt: [5, 28],
            equals: "Vector3 | string",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1597 TEST_CASE_FIXTURE(RefinementExternTypeFixture, "x_as_any_if_x_is_instance_elseif_x_is_table")
  {
    name: "x_as_any_if_x_is_instance_elseif_x_is_table",
    fixture: "RefinementExternTypeFixture",
    checks: [
      {
        source: `
        --!nonstrict

        local function f(x)
            if typeof(x) == "Instance" and x:IsA("Folder") then
                local foo = x
            elseif typeof(x) == "table" then
                local foo = x
            end
        end
    `,
        expect: [],
      }
    ],
    skip: {
      newSolver: "upstream returns before checking: CLI-117136 blocked types prevent constraint solving",
    },
  },
  // TypeInfer.refinements.test.cpp:1628 TEST_CASE_FIXTURE(RefinementExternTypeFixture, "refine_param_of_type_instance_without_using_typeof")
  {
    name: "refine_param_of_type_instance_without_using_typeof",
    fixture: "RefinementExternTypeFixture",
    checks: [
      {
        source: `
        local function f(x: Instance)
            if x:IsA("Folder") then
                local foo = x
            elseif typeof(x) == "table" then
                local foo = x
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 28],
            equals: "Folder",
          },
          {
            typeAt: [5, 28],
            equals: "never",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1646 TEST_CASE_FIXTURE(RefinementExternTypeFixture, "refine_param_of_type_folder_or_part_without_using_typeof")
  {
    name: "refine_param_of_type_folder_or_part_without_using_typeof",
    fixture: "RefinementExternTypeFixture",
    checks: [
      {
        source: `
        local function f(x: Part | Folder)
            if x:IsA("Folder") then
                local foo = x
            else
                local foo = x
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 28],
            equals: "Folder",
          },
          {
            typeAt: [5, 28],
            equals: "Part",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1664 TEST_CASE_FIXTURE(RefinementExternTypeFixture, "isa_type_refinement_must_be_known_ahead_of_time")
  {
    name: "isa_type_refinement_must_be_known_ahead_of_time",
    fixture: "RefinementExternTypeFixture",
    checks: [
      {
        source: `
        local function f(x): Instance
            if x:IsA("Folder") then
                local foo = x
            else
                local foo = x
            end

            return x
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 28],
            equals: "t1 where t1 = Instance & { read IsA: (t1, string) -> (T, U...) }",
          },
          {
            typeAt: [5, 28],
            equals: "t1 where t1 = Instance & { read IsA: (t1, string) -> (T, U...) }",
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
    flags: {
      LuauIterativeTypeSearcher: true,
    },
  },
  // TypeInfer.refinements.test.cpp:1696 TEST_CASE_FIXTURE(RefinementExternTypeFixture, "asserting_optional_properties_should_not_refine_extern_types_to_never")
  {
    name: "asserting_optional_properties_should_not_refine_extern_types_to_never",
    fixture: "RefinementExternTypeFixture",
    checks: [
      {
        source: `
        local weld: WeldConstraint = nil :: any
        assert(weld.Part1)
        print(weld) -- hover type incorrectly becomes \`never\`
        assert(weld.Part1.Name == "RootPart")
        local part1 = assert(weld.Part1)
        local pos = part1.Position
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 15],
            equals: "WeldConstraint & { read Part1: ~(false?) }",
          },
          {
            typeAt: [6, 29],
            equals: "Vector3",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1717 TEST_CASE_FIXTURE(RefinementExternTypeFixture, "asserting_non_existent_properties_should_not_refine_extern_types_to_never")
  {
    name: "asserting_non_existent_properties_should_not_refine_extern_types_to_never",
    fixture: "RefinementExternTypeFixture",
    checks: [
      {
        source: `
        local weld: WeldConstraint = nil :: any
        assert(weld.Part8)
        print(weld)
        assert(weld.Part8.Name == "RootPart")
        local part8 = assert(weld.Part8)
        local pos = part8.Position
    `,
        expect: [
          {
            errors: "some",
          },
          {
            error: 0,
            message: "Key 'Part8' not found in external type 'WeldConstraint'",
          },
          {
            typeAt: [3, 15],
            equals: "WeldConstraint",
          },
          {
            typeAt: [6, 29],
            equals: "*error-type*",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1735 TEST_CASE_FIXTURE(RefinementExternTypeFixture, "x_is_not_instance_or_else_not_part")
  {
    name: "x_is_not_instance_or_else_not_part",
    fixture: "RefinementExternTypeFixture",
    checks: [
      {
        source: `
        local function f(x: Part | Folder | string)
            if typeof(x) ~= "Instance" or not x:IsA("Part") then
                local foo = x
            else
                local foo = x
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 28],
            equals: "Folder | string",
          },
          {
            typeAt: [5, 28],
            equals: "Part",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1753 TEST_CASE_FIXTURE(BuiltinsFixture, "typeguard_doesnt_leak_to_elseif")
  {
    name: "typeguard_doesnt_leak_to_elseif",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        function f(a)
           if type(a) == "boolean" then
                local a1 = a
            elseif a.fn() then
                local a2 = a
            else
                local a3 = a
            end
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1772 TEST_CASE_FIXTURE(BuiltinsFixture, "refine_unknowns")
  {
    name: "refine_unknowns",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: unknown)
            if type(x) == "string" then
                local foo = x
            else
                local bar = x
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 28],
            equals: "string",
          },
          {
            typeAt: [5, 28],
            equals: "~string",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1798 TEST_CASE_FIXTURE(BuiltinsFixture, "refine_boolean")
  {
    name: "refine_boolean",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: number | boolean)
            if typeof(x) == "boolean" then
                local foo = x
            else
                local foo = x
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 28],
            equals: "boolean",
          },
          {
            typeAt: [5, 28],
            equals: "number",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1815 TEST_CASE_FIXTURE(BuiltinsFixture, "refine_thread")
  {
    name: "refine_thread",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: number | thread)
            if typeof(x) == "thread" then
                local foo = x
            else
                local foo = x
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 28],
            equals: "thread",
          },
          {
            typeAt: [5, 28],
            equals: "number",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1832 TEST_CASE_FIXTURE(BuiltinsFixture, "refine_buffer")
  {
    name: "refine_buffer",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: number | buffer)
            if typeof(x) == "buffer" then
                local foo = x
            else
                local foo = x
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 28],
            equals: "buffer",
          },
          {
            typeAt: [5, 28],
            equals: "number",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1849 TEST_CASE_FIXTURE(BuiltinsFixture, "falsiness_of_TruthyPredicate_narrows_into_nil")
  {
    name: "falsiness_of_TruthyPredicate_narrows_into_nil",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(t: {number})
            local x = t[1]
            if not x then
                local foo = x
            else
                local bar = x
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [4, 28],
            equals: "nil",
          },
          {
            typeAt: [6, 28],
            equals: "number",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1868 TEST_CASE_FIXTURE(BuiltinsFixture, "what_nonsensical_condition")
  {
    name: "what_nonsensical_condition",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x)
            if type(x) == "string" and type(x) == "number" then
                local foo = x
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 28],
            equals: "never",
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1885 TEST_CASE_FIXTURE(Fixture, "else_with_no_explicit_expression_should_also_refine_the_tagged_union")
  {
    name: "else_with_no_explicit_expression_should_also_refine_the_tagged_union",
    fixture: "Fixture",
    checks: [
      {
        source: `
        type Ok<T> = { tag: "ok", value: T }
        type Err<E> = { tag: "err", err: E }
        type Result<T, E> = Ok<T> | Err<E>

        function and_then<T, U, E>(r: Result<T, E>, f: (T) -> U): Result<U, E>
            if r.tag == "ok" then
                return { tag = "ok", value = f(r.value) }
            else
                return r
            end
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1904 TEST_CASE_FIXTURE(Fixture, "fuzz_filtered_refined_types_are_followed")
  {
    name: "fuzz_filtered_refined_types_are_followed",
    fixture: "Fixture",
    checks: [
      {
        source: `
local _
do
local _ = _ ~= _ or _ or _
end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1916 TEST_CASE_FIXTURE(BuiltinsFixture, "refine_unknown_to_table_then_take_the_length")
  {
    name: "refine_unknown_to_table_then_take_the_length",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: unknown)
            if typeof(x) == "table" then
                local len = #x
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 29],
            equals: "table",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1938 TEST_CASE_FIXTURE(BuiltinsFixture, "refine_unknown_to_table_then_clone_it")
  {
    name: "refine_unknown_to_table_then_clone_it",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(x: unknown)
            if typeof(x) == "table" then
                local cloned: {} = table.clone(x)
            end
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1958 TEST_CASE_FIXTURE(RefinementExternTypeFixture, "refine_a_param_that_got_resolved_during_constraint_solving_stage")
  {
    name: "refine_a_param_that_got_resolved_during_constraint_solving_stage",
    fixture: "RefinementExternTypeFixture",
    checks: [
      {
        source: `
        type Id<T> = T

        local function f(x: Id<Id<Part | Folder> | Id<string>>)
            if typeof(x) ~= "string" and x:IsA("Part") then
                local foo = x
            else
                local foo = x
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [5, 28],
            equals: "Part",
          },
          {
            typeAt: [7, 28],
            equals: "Folder | string",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1977 TEST_CASE_FIXTURE(RefinementExternTypeFixture, "refine_a_param_that_got_resolved_during_constraint_solving_stage_2")
  {
    name: "refine_a_param_that_got_resolved_during_constraint_solving_stage_2",
    fixture: "RefinementExternTypeFixture",
    checks: [
      {
        source: `
        local function hof(f: (Instance) -> ()) end

        hof(function(inst)
            if inst:IsA("Part") then
                local foo = inst
            else
                local foo = inst
            end
        end)
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [5, 28],
            equals: "Part",
          },
          {
            typeAt: [7, 28],
            equals: "Instance & ~Part",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:1999 TEST_CASE_FIXTURE(Fixture, "refine_a_property_of_some_global")
  {
    name: "refine_a_property_of_some_global",
    fixture: "Fixture",
    checks: [
      {
        source: `
        foo = { bar = 5 :: number? }

        if foo.bar then
            local bar = foo.bar
        end
    `,
        expect: [
          {
            errors: 1,
          },
          {
            typeAt: [4, 30],
            equals: "number",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2016 TEST_CASE_FIXTURE(BuiltinsFixture, "dataflow_analysis_can_tell_refinements_when_its_appropriate_to_refine_into_nil_or_never")
  {
    name: "dataflow_analysis_can_tell_refinements_when_its_appropriate_to_refine_into_nil_or_never",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(t: {string}, s: string)
            local v1 = t[5]
            local v2 = v1

            if typeof(v1) == "nil" then
                local foo = v1
            else
                local foo = v1
            end

            if typeof(v2) == "nil" then
                local foo = v2
            else
                local foo = v2
            end

            if typeof(s) == "nil" then
                local foo = s -- line 18
            else
                local foo = s -- line 20
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [6, 28],
            equals: "nil",
          },
          {
            typeAt: [8, 28],
            equals: "string",
          },
          {
            typeAt: [12, 28],
            equals: "nil",
          },
          {
            typeAt: [14, 28],
            equals: "string",
          },
          {
            typeAt: [18, 28],
            equals: "nil & string",
          },
          {
            typeAt: [20, 28],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2064 TEST_CASE_FIXTURE(Fixture, "cat_or_dog_through_a_local")
  {
    name: "cat_or_dog_through_a_local",
    fixture: "Fixture",
    checks: [
      {
        source: `
        type Cat = { tag: "cat", catfood: string }
        type Dog = { tag: "dog", dogfood: string }
        type Animal = Cat | Dog

        local function f(animal: Animal)
            local tag = animal.tag
            if tag == "dog" then
                local dog = animal
            elseif tag == "cat" then
                local cat = animal
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [8, 28],
            equals: "Cat | Dog",
          },
          {
            typeAt: [10, 28],
            equals: "Cat | Dog",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2087 TEST_CASE_FIXTURE(Fixture, "prove_that_dataflow_analysis_isnt_doing_alias_tracking_yet")
  {
    name: "prove_that_dataflow_analysis_isnt_doing_alias_tracking_yet",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local function f(tag: "cat" | "dog")
            local tag2 = tag

            if tag2 == "cat" then
                local foo = tag
            else
                local foo = tag
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [5, 28],
            equals: "\"cat\" | \"dog\"",
          },
          {
            typeAt: [7, 28],
            equals: "\"cat\" | \"dog\"",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2107 TEST_CASE_FIXTURE(Fixture, "fail_to_refine_a_property_of_subscript_expression")
  {
    name: "fail_to_refine_a_property_of_subscript_expression",
    fixture: "Fixture",
    checks: [
      {
        source: `
        type Foo = { foo: number? }
        local function f(t: {Foo})
            if t[1].foo then
                local foo = t[1].foo
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [4, 34],
            equals: "number?",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2122 TEST_CASE_FIXTURE(BuiltinsFixture, "type_annotations_arent_relevant_when_doing_dataflow_analysis")
  {
    name: "type_annotations_arent_relevant_when_doing_dataflow_analysis",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function s() return "hello" end

        local function f(t: {string})
            local s1: string = t[5]
            local s2: string = s()

            if typeof(s1) == "nil" and typeof(s2) == "nil" then
                local foo = s1
                local bar = s2
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [8, 28],
            equals: "nil",
          },
          {
            typeAt: [9, 28],
            equals: "nil",
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2148 TEST_CASE_FIXTURE(BuiltinsFixture, "function_call_with_colon_after_refining_not_to_be_nil")
  {
    name: "function_call_with_colon_after_refining_not_to_be_nil",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        --!strict
        export type Observer<T> = {
            read complete: ((self: Observer<T>) -> ())?,
        }

        local function _f(handler: Observer<any>)
            assert(handler.complete ~= nil)
            handler:complete() -- incorrectly gives Value of type '((Observer<any>) -> ())?' could be nil
            handler.complete(handler) -- works fine, both forms should avoid the error
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2168 TEST_CASE_FIXTURE(Fixture, "refinements_should_not_affect_assignment")
  {
    name: "refinements_should_not_affect_assignment",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local a: unknown = true
        if a == true then
            a = 'not even remotely similar to a boolean'
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2180 TEST_CASE_FIXTURE(BuiltinsFixture, "refinements_should_preserve_error_suppression")
  {
    name: "refinements_should_preserve_error_suppression",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local a: any = {}
        local b
        if typeof(a) == "table" then
           b = a.field
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2193 TEST_CASE_FIXTURE(BuiltinsFixture, "many_refinements_on_val")
  {
    name: "many_refinements_on_val",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function is_nan(val: any): boolean
            return type(val) == "number" and val ~= val
        end

        local function is_js_boolean(val: any): boolean
            return not not val and val ~= 0 and val ~= "" and not is_nan(val)
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "is_nan",
            equals: "(any) -> boolean",
          },
          {
            type: "is_js_boolean",
            equals: "(any) -> boolean",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2211 TEST_CASE_FIXTURE(BuiltinsFixture, "refine_unknown_to_table")
  {
    name: "refine_unknown_to_table",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(a: unknown)
            if typeof(a) == "table" then
                for i, v in a do
                    return i, v
                end
            end

            error("")
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "f",
            equals: "(unknown) -> (~nil, unknown)",
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2235 TEST_CASE_FIXTURE(BuiltinsFixture, "conditional_refinement_should_stay_error_suppressing")
  {
    name: "conditional_refinement_should_stay_error_suppressing",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function test(element: any?)
            if element then
                local owner = element._owner
            end
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2250 TEST_CASE_FIXTURE(BuiltinsFixture, "globals_can_be_narrowed_too")
  {
    name: "globals_can_be_narrowed_too",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        if typeof(string) == 'string' then
            local foo = string
        end
    `,
        expect: [
          {
            typeAt: [2, 24],
            equals: "string & typeof(string)",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2267 TEST_CASE_FIXTURE(BuiltinsFixture, "luau_polyfill_isindexkey_refine_conjunction")
  {
    name: "luau_polyfill_isindexkey_refine_conjunction",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function isIndexKey(k, contiguousLength)
            return type(k) == "number"
                and k <= contiguousLength -- nothing out of bounds
                and 1 <= k -- nothing illegal for array indices
                and math.floor(k) == k -- no float keys
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2287 TEST_CASE_FIXTURE(BuiltinsFixture, "check_refinement_to_primitive_and_compare")
  {
    name: "check_refinement_to_primitive_and_compare",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function comesAfterLuau(word)
            return type(word) == "string" and word > "luau"
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "comesAfterLuau",
            equals: "(unknown) -> boolean",
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2305 TEST_CASE_FIXTURE(BuiltinsFixture, "luau_polyfill_isindexkey_refine_conjunction_variant")
  {
    name: "luau_polyfill_isindexkey_refine_conjunction_variant",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function isIndexKey(k, contiguousLength: number)
            return type(k) == "number"
                and k <= contiguousLength -- nothing out of bounds
                and 1 <= k -- nothing illegal for array indices
                and math.floor(k) == k -- no float keys
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2323 TEST_CASE_FIXTURE(BuiltinsFixture, "ex")
  {
    name: "ex",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
local function f(x: string | number)
    if typeof((x)) == "string" then
        local y = x
    end
end
`,
        expect: [
          {
            typeAt: [3, 18],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2336 TEST_CASE_FIXTURE(RefinementExternTypeFixture, "mutate_prop_of_some_refined_symbol")
  {
    name: "mutate_prop_of_some_refined_symbol",
    fixture: "RefinementExternTypeFixture",
    checks: [
      {
        source: `
        local function instances(): {Instance} error("") end
        local function vec3(x, y, z): Vector3 error("") end

        for _, object in ipairs(instances()) do
            if object:IsA("Part") then
                object.Position = vec3(1, 2, 3)
            end
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2354 TEST_CASE_FIXTURE(RefinementExternTypeFixture, "mutate_prop_of_some_refined_symbol_2")
  {
    name: "mutate_prop_of_some_refined_symbol_2",
    fixture: "RefinementExternTypeFixture",
    checks: [
      {
        source: `
        type Result<T, E> = never
            | { tag: "ok", value: T }
            | { tag: "err", error: E }

        local function results(): {Result<number, string>} error("") end

        for _, res in ipairs(results()) do
            if res.tag == "ok" then
                res.value = 7
            end
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
        unparsed: {
          defect: 1370,
        },
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2373 TEST_CASE_FIXTURE(BuiltinsFixture, "ensure_t_after_return_references_all_reachable_points")
  {
    name: "ensure_t_after_return_references_all_reachable_points",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local t = {}

        local function f(k: string)
            if t[k] ~= nil then
                return
            end

            t[k] = 5
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [8, 12],
            options: {
              exhaustive: true,
            },
            equals: "{ [string]: number }",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2395 TEST_CASE_FIXTURE(Fixture, "long_disjunction_of_refinements_should_not_trip_recursion_counter")
  // Upstream asserts checking does not throw.
  {
    name: "long_disjunction_of_refinements_should_not_trip_recursion_counter",
    fixture: "Fixture",
    checks: [
      {
        source: `
function(obj)
    if script.Parent.SeatNumber.Value == "1D" or
    script.Parent.SeatNumber.Value == "2D" or
    script.Parent.SeatNumber.Value == "3D" or
    script.Parent.SeatNumber.Value == "4D" or
    script.Parent.SeatNumber.Value == "5D" or
    script.Parent.SeatNumber.Value == "6D" or
    script.Parent.SeatNumber.Value == "7D" or
    script.Parent.SeatNumber.Value == "8D" or
    script.Parent.SeatNumber.Value == "9D" or
    script.Parent.SeatNumber.Value == "10D" or
    script.Parent.SeatNumber.Value == "11D" or
    script.Parent.SeatNumber.Value == "12D" or
    script.Parent.SeatNumber.Value == "13D" or
    script.Parent.SeatNumber.Value == "14D" or
    script.Parent.SeatNumber.Value == "15D" or
    script.Parent.SeatNumber.Value == "16D" or
    script.Parent.SeatNumber.Value == "1C" or
    script.Parent.SeatNumber.Value == "2C" or
    script.Parent.SeatNumber.Value == "3C" or
    script.Parent.SeatNumber.Value == "4C" or
    script.Parent.SeatNumber.Value == "5C" or
    script.Parent.SeatNumber.Value == "6C" or
    script.Parent.SeatNumber.Value == "7C" or
    script.Parent.SeatNumber.Value == "8C" or
    script.Parent.SeatNumber.Value == "9C" or
    script.Parent.SeatNumber.Value == "10C" or
    script.Parent.SeatNumber.Value == "11C" or
    script.Parent.SeatNumber.Value == "12C" or
    script.Parent.SeatNumber.Value == "13C" or
    script.Parent.SeatNumber.Value == "14C" or
    script.Parent.SeatNumber.Value == "15C" or
    script.Parent.SeatNumber.Value == "16C" then
end
`,
        expect: [],
        malformed: "a standalone function declaration has no name and no closing end",
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2435 TEST_CASE_FIXTURE(Fixture, "more_complex_long_disjunction_of_refinements_shouldnt_trip_ice")
  // Upstream asserts checking does not throw.
  {
    name: "more_complex_long_disjunction_of_refinements_shouldnt_trip_ice",
    fixture: "Fixture",
    checks: [
      {
        source: `
script:connect(function(obj)
\tif script.Parent.SeatNumber.Value == "1D" or
    script.Parent.SeatNumber.Value == "2D" or
    script.Parent.SeatNumber.Value == "3D" or
    script.Parent.SeatNumber.Value == "4D" or
    script.Parent.SeatNumber.Value == "5D" or
    script.Parent.SeatNumber.Value == "6D" or
    script.Parent.SeatNumber.Value == "7D" or
    script.Parent.SeatNumber.Value == "8D" or
    script.Parent.SeatNumber.Value == "9D" or
    script.Parent.SeatNumber.Value == "10D" or
    script.Parent.SeatNumber.Value == "11D" or
    script.Parent.SeatNumber.Value == "12D" or
    script.Parent.SeatNumber.Value == "13D" or
    script.Parent.SeatNumber.Value == "14D" or
    script.Parent.SeatNumber.Value == "15D" or
    script.Parent.SeatNumber.Value == "16D" or
    script.Parent.SeatNumber.Value == "1C" or
    script.Parent.SeatNumber.Value == "2C" or
    script.Parent.SeatNumber.Value == "3C" or
    script.Parent.SeatNumber.Value == "4C" or
    script.Parent.SeatNumber.Value == "5C" or
    script.Parent.SeatNumber.Value == "6C" or
    script.Parent.SeatNumber.Value == "7C" or
    script.Parent.SeatNumber.Value == "8C" or
    script.Parent.SeatNumber.Value == "9C" or
    script.Parent.SeatNumber.Value == "10C" or
    script.Parent.SeatNumber.Value == "11C" or
    script.Parent.SeatNumber.Value == "12C" or
    script.Parent.SeatNumber.Value == "13C" or
    script.Parent.SeatNumber.Value == "14C" or
    script.Parent.SeatNumber.Value == "15C" or
    script.Parent.SeatNumber.Value == "16C" then
    end)
`,
        expect: [],
        malformed: "the anonymous function is missing its closing end before the call closing parenthesis",
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2475 TEST_CASE_FIXTURE(Fixture, "refinements_should_avoid_building_up_big_intersect_families")
  // Upstream asserts checking does not throw.
  {
    name: "refinements_should_avoid_building_up_big_intersect_families",
    fixture: "Fixture",
    checks: [
      {
        source: `
script:connect(function(obj)
\tif script.Parent.SeatNumber.Value == "1D" or script.Parent.SeatNumber.Value == "2D" or script.Parent.SeatNumber.Value == "3D" or script.Parent.SeatNumber.Value == "4D" or script.Parent.SeatNumber.Value == "5D" or script.Parent.SeatNumber.Value == "6D" or script.Parent.SeatNumber.Value == "7D" or script.Parent.SeatNumber.Value == "8D" or script.Parent.SeatNumber.Value == "9D" or script.Parent.SeatNumber.Value == "10D" or script.Parent.SeatNumber.Value == "11D" or script.Parent.SeatNumber.Value == "12D" or script.Parent.SeatNumber.Value == "13D" or script.Parent.SeatNumber.Value == "14D" or script.Parent.SeatNumber.Value == "15D" or script.Parent.SeatNumber.Value == "16D" or script.Parent.SeatNumber.Value == "1C" or script.Parent.SeatNumber.Value == "2C" or script.Parent.SeatNumber.Value == "3C" or script.Parent.SeatNumber.Value == "4C" or script.Parent.SeatNumber.Value == "5C" or script.Parent.SeatNumber.Value == "6C" or script.Parent.SeatNumber.Value == "7C" or script.Parent.SeatNumber.Value == "8C" or script.Parent.SeatNumber.Value == "9C" or script.Parent.SeatNumber.Value == "10C" or script.Parent.SeatNumber.Value == "11C" or script.Parent.SeatNumber.Value == "12C" or script.Parent.SeatNumber.Value == "13C" or script.Parent.SeatNumber.Value == "14C" or script.Parent.SeatNumber.Value == "15C" or script.Parent.SeatNumber.Value == "16C" then
\t\tif p.Name == script.Parent.Parent.Parent.Parent.Parent.Parent.MainParts.CD.SurfaceGui[script.Parent.SeatNumber.Value].Player.Value or script.Parent.Parent.Parent.Parent.Parent.Parent.MainParts.CD.SurfaceGui[script.Parent.SeatNumber.Value].Player.Value == "" then
\t\telse
\t\t\tif script.Parent:FindFirstChild("SeatWeld") then
\t\t\tend
\t\tend
\telse
\t\tif p.Name == script.Parent.Parent.Parent.Parent.Parent.Parent.MainParts.AB.SurfaceGui[script.Parent.SeatNumber.Value].Player.Value or script.Parent.Parent.Parent.Parent.Parent.Parent.MainParts.AB.SurfaceGui[script.Parent.SeatNumber.Value].Player.Value == "" then
\t\t\tprint("Allowed")
\t\telse
\t\t\tif script.Parent:FindFirstChild("SeatWeld") then
\t\t\tend
\t\tend
\tend
end)
`,
        expect: [],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2497 TEST_CASE_FIXTURE(Fixture, "refinements_table_intersection_limits" * doctest::timeout(LUAU_TIMEOUT))
  {
    name: "refinements_table_intersection_limits",
    fixture: "Fixture",
    checks: [
      {
        source: `
--!strict
type Dir = {
    a: number?, b: number?, c: number?, d: number?, e: number?, f: number?,
    g: number?, h: number?, i: number?, j: number?, k: number?, l: number?,
    m: number?, n: number?, o: number?, p: number?, q: number?, r: number?,
}

local function test(dirs: {Dir})
    for k, dir in dirs
        local success, message = pcall(function()
            assert(dir.a == nil or type(dir.a) == "number")
            assert(dir.b == nil or type(dir.b) == "number")
            assert(dir.c == nil or type(dir.c) == "number")
            assert(dir.d == nil or type(dir.d) == "number")
            assert(dir.e == nil or type(dir.e) == "number")
            assert(dir.f == nil or type(dir.f) == "number")
            assert(dir.g == nil or type(dir.g) == "number")
            assert(dir.h == nil or type(dir.h) == "number")
            assert(dir.i == nil or type(dir.i) == "number")
            assert(dir.j == nil or type(dir.j) == "number")
            assert(dir.k == nil or type(dir.k) == "number")
            assert(dir.l == nil or type(dir.l) == "number")
            assert(dir.m == nil or type(dir.m) == "number")
            assert(dir.n == nil or type(dir.n) == "number")
            assert(dir.o == nil or type(dir.o) == "number")
            assert(dir.p == nil or type(dir.p) == "number")
            assert(dir.q == nil or type(dir.q) == "number")
            assert(dir.r == nil or type(dir.r) == "number")
            assert(dir.t == nil or type(dir.t) == "number")
            assert(dir.u == nil or type(dir.u) == "number")
            assert(dir.v == nil or type(dir.v) == "number")
            local checkpoint = dir

            checkpoint.w = 1
        end)
        assert(success)
    end
end
    `,
        expect: [],
        malformed: "the generic for loop is missing do before its body",
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2541 TEST_CASE_FIXTURE(RefinementExternTypeFixture, "typeof_instance_refinement")
  {
    name: "typeof_instance_refinement",
    fixture: "RefinementExternTypeFixture",
    checks: [
      {
        source: `
        local function f(x: Instance | Vector3)
            if typeof(x) == "Instance" then
                local foo = x
            else
                local foo = x
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 28],
            equals: "Instance",
          },
          {
            typeAt: [5, 28],
            equals: "Vector3",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2559 TEST_CASE_FIXTURE(RefinementExternTypeFixture, "typeof_instance_error")
  {
    name: "typeof_instance_error",
    fixture: "RefinementExternTypeFixture",
    checks: [
      {
        source: `
        local function f(x: Part)
            if typeof(x) == "Instance" then
                local foo : Folder = x
            end
        end
    `,
        expect: [
          {
            errors: 1,
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2572 TEST_CASE_FIXTURE(RefinementExternTypeFixture, "typeof_instance_isa_refinement")
  {
    name: "typeof_instance_isa_refinement",
    fixture: "RefinementExternTypeFixture",
    checks: [
      {
        source: `
        local function f(x: Part | Folder | string)
            if typeof(x) == "Instance" then
                local foo = x
                if foo:IsA("Folder") then
                    local bar = foo
                end
            else
                local foo = x
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 28],
            equals: "Folder | Part",
          },
          {
            typeAt: [5, 32],
            equals: "Folder",
          },
          {
            typeAt: [8, 28],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2594 TEST_CASE_FIXTURE(BuiltinsFixture, "nonnil_refinement_on_generic")
  {
    name: "nonnil_refinement_on_generic",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function printOptional<T>(item: T?, printer: (T) -> string): string
            if item ~= nil then
                return printer(item)
            else
                return ""
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 31],
            equals: "T & ~nil",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2613 TEST_CASE_FIXTURE(BuiltinsFixture, "truthy_refinement_on_generic")
  {
    name: "truthy_refinement_on_generic",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function printOptional<T>(item: T?, printer: (T) -> string): string
            if item then
                return printer(item)
            else
                return ""
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 31],
            equals: "T & ~(false?)",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2632 TEST_CASE_FIXTURE(Fixture, "truthy_call_of_function_with_table_value_as_argument_should_not_refine_value_as_never")
  {
    name: "truthy_call_of_function_with_table_value_as_argument_should_not_refine_value_as_never",
    fixture: "Fixture",
    checks: [
      {
        source: `
        type Item = {}

        local function predicate(value: Item): boolean
            return true
        end

        local function checkValue(value: Item)
            if predicate(value) then
                local _ = value
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [8, 27],
            equals: "Item",
          },
          {
            typeAt: [9, 28],
            equals: "Item",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2653 TEST_CASE_FIXTURE(BuiltinsFixture, "function_calls_are_not_nillable")
  {
    name: "function_calls_are_not_nillable",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local BEFORE_SLASH_PATTERN = "^(.*)[\\\\/]"
        function operateOnPath(path: string): string?
            local fileName = string.gsub(path, BEFORE_SLASH_PATTERN, "")
            if string.match(fileName, "^init%.") then
                return "path=" .. fileName
            end
            return nil
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2667 TEST_CASE_FIXTURE(BuiltinsFixture, "oss_1528_method_calls_are_not_nillable")
  {
    name: "oss_1528_method_calls_are_not_nillable",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        type RunService = {
            IsRunning: (RunService) -> boolean
        }
        type Game = {
            GetRunService: (Game) -> RunService
        }
        local function getServices(g: Game): RunService
            local service = g:GetRunService()
            if service:IsRunning() then
                return service
            end
            error("Oh no! The service isn't running!")
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2686 TEST_CASE_FIXTURE(Fixture, "oss_1687_equality_shouldnt_leak_nil")
  {
    name: "oss_1687_equality_shouldnt_leak_nil",
    fixture: "Fixture",
    checks: [
      {
        source: `
        --!strict
        function returns_two(): number
            return 2
        end

        function is_two(num: number): boolean
            return num==2
        end

        local my_number = returns_two()

        if my_number == 2 then
            is_two(my_number) --type error, my_number: number?
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2706 TEST_CASE_FIXTURE(BuiltinsFixture, "oss_1451")
  {
    name: "oss_1451",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        type Part = {
            HasTag: (Part, string) -> boolean,
            Name: string,
        }
        local myList = {} :: {Part}
        local nextPart = (table.remove(myList)) :: Part

        if nextPart:HasTag("foo") then
          return
        end

        print(nextPart.Name)

    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2727 TEST_CASE_FIXTURE(RefinementExternTypeFixture, "cannot_call_a_function_single")
  {
    name: "cannot_call_a_function_single",
    fixture: "RefinementExternTypeFixture",
    checks: [
      {
        source: `
        local function invokeDisconnect(d: unknown)
            if type(d) == "function" then
                d()
            end
        end
    `,
        expect: [
          {
            errors: 1,
          },
          {
            error: 0,
            message: "The type function is not precise enough for us to determine the appropriate result type of this call.",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2743 TEST_CASE_FIXTURE(RefinementExternTypeFixture, "cli_140033_refine_union_of_extern_types")
  {
    name: "cli_140033_refine_union_of_extern_types",
    fixture: "RefinementExternTypeFixture",
    checks: [
      {
        source: `
        --!strict
        local function getImageLabel(vars: { Instance }): Folder | Part | nil
            for _, item in vars do
                if item:IsA("Folder") or item:IsA("Part") then
                    return item
                end
            end
            return nil
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [5, 28],
            equals: "Folder | Part",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2760 TEST_CASE_FIXTURE(RefinementExternTypeFixture, "cannot_call_a_function_union")
  {
    name: "cannot_call_a_function_union",
    fixture: "RefinementExternTypeFixture",
    checks: [
      {
        source: `
        type Disconnectable = {
            Disconnect: (self: Disconnectable) -> (...any);
        } | {
            disconnect: (self: Disconnectable) -> (...any)
        } | ExternScriptConnection

        local x: Disconnectable = workspace.ChildAdded:Connect(function()
            print("child added")
        end)

        if type(x.Disconnect) == "function" then
            x:Disconnect()
        end
    `,
        expect: [
          {
            errors: 2,
          },
          {
            error: 1,
            message: `Cannot call a value of type function in union:
  ((ExternScriptConnection) -> ()) | function | t2 where t1 = ExternScriptConnection | { Disconnect: t2 } | { disconnect: (t1) -> (...any) } ; t2 = (t1) -> (...any)`,
          }
        ],
        unparsed: {
          defect: 876,
        },
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2792 TEST_CASE_FIXTURE(BuiltinsFixture, "oss_1835")
  {
    name: "oss_1835",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        --!strict
        local t: {name: string}? = nil

        function f()
            local name = if t then t.name else "name"
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      },
      {
        source: `
        --!strict
        local t: {name: string}? = nil

        function f()
            if t then end
            local name = if t then t.name else "name"
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      },
      {
        source: `
        local t: {name: string}? = nil
        if t then end
        print(t.name)
        local name = if t then t.name else "name"
    `,
        expect: [
          {
            errors: 1,
          },
          {
            error: 0,
            code: "OptionalValueAccess",
          }
        ],
      }
    ],
    shareFixture: true,
  },
  // TypeInfer.refinements.test.cpp:2823 TEST_CASE_FIXTURE(Fixture, "limit_complexity_of_arithmetic_type_functions" * doctest::timeout(LUAU_TIMEOUT))
  {
    name: "limit_complexity_of_arithmetic_type_functions",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local Hermite = {}

        function Hermite:__init(p0, p1, m0, m1)
            self[1] = {
                p0.x;
                p0.y;
                p0.z;
            }
            self[2] = {
                m0.x;
                m0.y;
                m0.z;
            }
            self[3] = {
                3*(p1.x - p0.x) - 2*m0.x - m1.x;
                3*(p1.y - p0.y) - 2*m0.y - m1.y;
                3*(p1.z - p0.z) - 2*m0.z - m1.z;
            }
        end

        return Hermite
    `,
        expect: [
          {
            errors: "some",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2856 TEST_CASE_FIXTURE(BuiltinsFixture, "refine_by_no_refine_should_always_reduce")
  {
    name: "refine_by_no_refine_should_always_reduce",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        function foo(t): boolean return true end

        function select<K, V>(t: { [K]: V }, columns: { K }): { [K]: V }
            local result = {}
            if foo(t) then
                for k, v in t do
                    if table.find(columns, k) then
                        result[k] = v -- was TypeError: Type function instance refine<intersect<K, ~nil>, *no-refine*> is uninhabited
                    end
                end
            else
                for k, v in pairs(t) do
                    if table.find(columns, k) then
                        result[k] = v
                    end
                end
            end
            return result
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2891 TEST_CASE_FIXTURE(Fixture, "table_name_index_without_prior_assignment_from_branch")
  {
    name: "table_name_index_without_prior_assignment_from_branch",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local GetDictionary : (unknown, boolean) -> { Player: {} }? = nil :: any

        local CharEntry = GetDictionary(nil, false)
        if not CharEntry then
            CharEntry = GetDictionary(nil, true)
        end

        local x = CharEntry.Player
    `,
        expect: [
          {
            errors: 1,
          },
          {
            error: 0,
            code: "OptionalValueAccess",
          },
          {
            type: "x",
            equals: "{  }",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2914 TEST_CASE_FIXTURE(Fixture, "cli_120460_table_access_on_phi_node")
  {
    name: "cli_120460_table_access_on_phi_node",
    fixture: "Fixture",
    checks: [
      {
        source: `
        --!strict
        local function foo(bar: string): string
            local baz: boolean = true
            if baz then
                local _ = (bar:sub(1))
            else
                local _ = (bar:sub(1))
            end
            return bar:sub(2) -- previously this would be \`...never\`
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2930 TEST_CASE_FIXTURE(BuiltinsFixture, "refinements_from_and_should_not_refine_to_never")
  {
    name: "refinements_from_and_should_not_refine_to_never",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local config: Config
        local function serialize()
            if config.KeyboardEnabled and config.MouseEnabled then
                return 0
            else
                print(config)
                return 1
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [6, 24],
            equals: "(Config & { read KeyboardEnabled: false? }) | (Config & { read MouseEnabled: false? })",
          }
        ],
        ignoreMissingAnnotations: true,
        definitions: [`
        declare extern type Config with
            KeyboardEnabled: boolean
            MouseEnabled: boolean
        end
    `],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:2962 TEST_CASE_FIXTURE(Fixture, "force_simplify_constraint_doesnt_drop_blocked_type")
  {
    name: "force_simplify_constraint_doesnt_drop_blocked_type",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local function track(instance): boolean
            local isBasePart = instance:IsA("BasePart")
            local isCharacter = false
            if not isBasePart then
                isCharacter = instance:FindFirstChildOfClass("Humanoid") and instance:FindFirstChild("HumanoidRootPart")
            end
            return isCharacter
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
    flags: {
      LuauIterativeTypeSearcher: true,
    },
  },
  // TypeInfer.refinements.test.cpp:2991 TEST_CASE_FIXTURE(Fixture, "len_operator_in_if_is_just_a_proposition")
  {
    name: "len_operator_in_if_is_just_a_proposition",
    fixture: "Fixture",
    checks: [
      {
        source: `
type Pool = { x : number }
local pool = p :: Pool
if #pool then
    local y = pool
end
`,
        expect: [
          {
            typeAt: [4, 14],
            notEquals: "never",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:3008 TEST_CASE_FIXTURE(Fixture, "unm_operator_is_just_a_proposition")
  {
    name: "unm_operator_is_just_a_proposition",
    fixture: "Fixture",
    checks: [
      {
        source: `
type Pool = { x : number }
local pool = p :: Pool
if -pool then
    local y = pool
end
`,
        expect: [
          {
            typeAt: [4, 14],
            notEquals: "never",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:3025 TEST_CASE_FIXTURE(BuiltinsFixture, "inline_if_conditional_context")
  {
    name: "inline_if_conditional_context",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        --!strict

        type Value<T> = {
            kind: "value",
            value: T
        }

        local function peek<T>(state: Value<T> | T): T
            return if typeof(state) == "table" and state.kind == "value"
                then (state :: Value<T>).value :: T
                else state :: T
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:3043 TEST_CASE_FIXTURE(Fixture, "oss_1517_equality_doesnt_add_nil")
  {
    name: "oss_1517_equality_doesnt_add_nil",
    fixture: "Fixture",
    checks: [
      {
        source: `
        type MyType = {
            data: any
        }

        local function createMyType(): MyType
            local obj = { data = {} }
            return obj
        end

        local function testTypeInference()
            local a: MyType = createMyType()
            local b: MyType = createMyType()

            if a == b then
                local c: MyType = b
                local value = b.data
            end
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:3067 TEST_CASE_FIXTURE(BuiltinsFixture, "typeof_refinement_context")
  {
    name: "typeof_refinement_context",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        --!strict

        local x = {} :: unknown

        if typeof(x) == "table" then
            if typeof(x.transform) == "function" then
            \tlocal y = x.transform
            end
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:3084 TEST_CASE_FIXTURE(BuiltinsFixture, "assert_and_typeof_refinement_context")
  {
    name: "assert_and_typeof_refinement_context",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        --!strict

        local x = {} :: unknown

        if typeof(x) == "table" then
            assert(typeof(x.transform) == "function")
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:3099 TEST_CASE_FIXTURE(BuiltinsFixture, "foo_call_should_not_refine")
  {
    name: "foo_call_should_not_refine",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        --!strict

        local x = {} :: unknown
        local function foo(_: boolean) end

        if typeof(x) == "table" then
            foo(typeof(x.transform) == "function")
        end
    `,
        expect: [
          {
            errors: 1,
          },
          {
            error: 0,
            message: "Type 'table' does not have key 'transform'",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:3118 TEST_CASE_FIXTURE(BuiltinsFixture, "assert_call_should_not_refine_despite_typeof")
  {
    name: "assert_call_should_not_refine_despite_typeof",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        --!strict
        local function foo(_: any)
            return true
        end

        local function f(x: unknown)
            if typeof(x) == "table" then
                assert(foo(typeof(x.bar)))
            end
        end
    `,
        expect: [
          {
            errors: 1,
          },
          {
            error: 0,
            message: "Type 'table' does not have key 'bar'",
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:3141 TEST_CASE_FIXTURE(BuiltinsFixture, "non_conditional_context_in_if_should_not_refine")
  {
    name: "non_conditional_context_in_if_should_not_refine",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function bing(_: any) end
        local function foobar(x: unknown)
            assert(typeof(x) == "table")
            if bing(x.foo) then
            end
        end
    `,
        expect: [
          {
            errors: 1,
          },
          {
            error: 0,
            message: "Type 'table' does not have key 'foo'",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:3158 TEST_CASE_FIXTURE(Fixture, "type_function_reduction_with_union_type_application" * doctest::timeout(LUAU_TIMEOUT))
  {
    name: "type_function_reduction_with_union_type_application",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local lastTick = 0
        local jumpAnimTime = 0
        local toolAnimTime = 0

        function move(time, tool, animStringValueObject)
            local deltaTime = time - lastTick
            lastTick = time

            if jumpAnimTime > 0 then
                jumpAnimTime = jumpAnimTime - deltaTime
            end

            if animStringValueObject then
                toolAnimTime = time + .3
            end

            if time > toolAnimTime then
            end
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
    flags: {
      DebugLuauAssertOnForcedConstraint: true,
    },
  },
  // TypeInfer.refinements.test.cpp:3190 TEST_CASE_FIXTURE(BuiltinsFixture, "refine_any_and_unknown_should_still_be_any")
  {
    name: "refine_any_and_unknown_should_still_be_any",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local REACT_FRAGMENT_TYPE = (nil :: any)
        local function typeOf(object: any)
            local __type = object.type

            if __type == REACT_FRAGMENT_TYPE then
                return __type
            else
                return __type
                    and typeof(__type) == "table"
                    and __type["$$typeof"]
            end
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:3210 TEST_CASE_FIXTURE(BuiltinsFixture, "cli_181100_fast_track_refinement_against_unknown")
  {
    name: "cli_181100_fast_track_refinement_against_unknown",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        --!strict

        local Class = {}
        Class.__index = Class

        type Class = setmetatable<{ A: number }, typeof(Class)>

        function Class.Foo(x: Class, y: Class, z: Class)
            if y == z then
                return
            end
            local bar = y.A
            print(bar)
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [13, 19],
            equals: "number",
          }
        ],
      }
    ],
    flags: {
      DebugLuauAssertOnForcedConstraint: true,
    },
  },
  // TypeInfer.refinements.test.cpp:3237 TEST_CASE_FIXTURE(BuiltinsFixture, "cli_181549_refined_string_should_be_subtype_of_string")
  {
    name: "cli_181549_refined_string_should_be_subtype_of_string",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
      local hello : string = "world"

      if hello == "" then
          return
      end

      string.find(hello, "bye")
    `,
        expect: [
          {
            errors: 0,
          }
        ],
        mode: "nonstrict",
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:3252 TEST_CASE_FIXTURE(Fixture, "cli_184413_refinement_of_union_of_read_types_is_read_type")
  {
    name: "cli_184413_refinement_of_union_of_read_types_is_read_type",
    fixture: "Fixture",
    checks: [
      {
        source: `
        export type States = "Closed" | "Closing" | "Opening" | "Open"
        export type MyType<A = any> = {
            State: States,
            IsOpen: boolean,
            Open: (self: MyType<A>) -> (),
        }

        local value = {} :: MyType

        function value:Open()
            if self.IsOpen == true then
            elseif self.State == "Closing" or self.State == "Opening" then
                -- Prior, this line errored as we were erroneously refining
                -- \`self\` with \`{ State: "Closing" | "Opening" }\` rather
                -- than \`{ read State: "Closing" | "Opening" }
                self:Open()
            end
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:3276 TEST_CASE_FIXTURE(BuiltinsFixture, "type_vector_refine")
  {
    name: "type_vector_refine",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        function foo(x: unknown)
            if type(x) == "vector" then
                local y = x.y
                local z = y.bad
            end
        end
    `,
        expect: [
          {
            errors: 1,
          },
          {
            error: 0,
            code: "UnknownProperty",
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:3293 TEST_CASE_FIXTURE(BuiltinsFixture, "indexing_into_error_gives_error")
  {
    name: "indexing_into_error_gives_error",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function keyExtractor(item: any, index: number): string
            if typeof(item) == "table" and item.key ~= nil then
                return item.key
            end
            if typeof(item) == "table" and item.id ~= nil then
                return item.id
            end
            return tostring(index)
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
  },
  // TypeInfer.refinements.test.cpp:3308 TEST_CASE_FIXTURE(Fixture, "cli_181894_refinement_cancelled_by_for_loop")
  {
    name: "cli_181894_refinement_cancelled_by_for_loop",
    fixture: "Fixture",
    checks: [
      {
        source: `
        --!strict
        type LightingChanger = { [string]: number, Instances: LightingChanger }

        local lightingChangers: { LightingChanger } = nil :: any

        local closestChanger: LightingChanger?
        if #lightingChangers == 1 then
            closestChanger = lightingChangers[1]
        end
        if closestChanger == nil then
            return
        end

        for _, _ in closestChanger do
        end

        local _ = closestChanger.Instances
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
    flags: {
      LuauAvoidTrivialPhis: true,
    },
  },
  // TypeInfer.refinements.test.cpp:3333 TEST_CASE_FIXTURE(BuiltinsFixture, "unification_with_refinements_doesnt_impact_freevars")
  {
    name: "unification_with_refinements_doesnt_impact_freevars",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local keys: { unknown } = {}

        local function sorter(a, b): boolean
            if type(a) == "number" and type(b) == "number" then
                return a < b
            end

            return tostring(a) < tostring(b)
        end

        table.sort(keys, sorter)
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "sorter",
            equals: "(unknown, unknown) -> boolean",
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
    flags: {
      DebugLuauAssertOnForcedConstraint: true,
      LuauRemovePrimitiveTypeConstraintAndSubtypingUnifier: true,
    },
  },
  // TypeInfer.refinements.test.cpp:3361 TEST_CASE_FIXTURE(BuiltinsFixture, "if_local_narrows_to_truthy")
  {
    name: "if_local_narrows_to_truthy",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(v: string?)
            if local x = v then
                local s = x
            end
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
    flags: {
      DebugLuauIfLocalSyntax: true,
      DebugLuauIfLocalAnalysis: true,
    },
  },
  // TypeInfer.refinements.test.cpp:3379 TEST_CASE_FIXTURE(BuiltinsFixture, "if_local_basic_typecheck")
  {
    name: "if_local_basic_typecheck",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(v: number?)
            if local x = v then
                local y = x + 1
            end
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
    flags: {
      DebugLuauIfLocalSyntax: true,
      DebugLuauIfLocalAnalysis: true,
    },
  },
  // TypeInfer.refinements.test.cpp:3397 TEST_CASE_FIXTURE(BuiltinsFixture, "if_local_binding_not_visible_after_block")
  {
    name: "if_local_binding_not_visible_after_block",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        if local x = math.random() then
            print(x)
        end
        print(x)
    `,
        expect: [
          {
            errors: 1,
          },
          {
            error: 0,
            message: "Unknown global 'x'; consider assigning to it first",
          }
        ],
      }
    ],
    flags: {
      DebugLuauIfLocalSyntax: true,
      DebugLuauIfLocalAnalysis: true,
    },
  },
  // TypeInfer.refinements.test.cpp:3415 TEST_CASE_FIXTURE(BuiltinsFixture, "if_local_refines_unannotated_to_truthy")
  {
    name: "if_local_refines_unannotated_to_truthy",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(v: number?)
            if local x = v then
                local s = x
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 26],
            equals: "number",
          }
        ],
      }
    ],
    flags: {
      DebugLuauIfLocalSyntax: true,
      DebugLuauIfLocalAnalysis: true,
    },
  },
  // TypeInfer.refinements.test.cpp:3435 TEST_CASE_FIXTURE(BuiltinsFixture, "if_local_refines_annotated_type")
  {
    name: "if_local_refines_annotated_type",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(v: number?)
            if local x: number? = v then
                local s = x
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 26],
            equals: "number",
          }
        ],
      }
    ],
    flags: {
      DebugLuauIfLocalSyntax: true,
      DebugLuauIfLocalAnalysis: true,
    },
  },
  // TypeInfer.refinements.test.cpp:3456 TEST_CASE_FIXTURE(BuiltinsFixture, "if_const_narrows_to_truthy")
  {
    name: "if_const_narrows_to_truthy",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(v: number?)
            if const x = v then
                local s = x
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 26],
            equals: "number",
          }
        ],
      }
    ],
    flags: {
      DebugLuauIfLocalSyntax: true,
      DebugLuauIfLocalAnalysis: true,
    },
  },
  // TypeInfer.refinements.test.cpp:3475 TEST_CASE_FIXTURE(BuiltinsFixture, "if_local_binding_not_visible_in_else")
  {
    name: "if_local_binding_not_visible_in_else",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        if local x = math.random() then
            print(x)
        else
            print(x)
        end
    `,
        expect: [
          {
            errors: 1,
          },
          {
            error: 0,
            message: "Unknown global 'x'; consider assigning to it first",
          }
        ],
      }
    ],
    flags: {
      DebugLuauIfLocalSyntax: true,
      DebugLuauIfLocalAnalysis: true,
    },
  },
  // TypeInfer.refinements.test.cpp:3494 TEST_CASE_FIXTURE(BuiltinsFixture, "if_local_binding_not_visible_in_elseif_condition")
  {
    name: "if_local_binding_not_visible_in_elseif_condition",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        if local x = math.random() then
            print(x)
        elseif x then
            print("no x here")
        end
    `,
        expect: [
          {
            errors: 1,
          },
          {
            error: 0,
            message: "Unknown global 'x'; consider assigning to it first",
          }
        ],
      }
    ],
    flags: {
      DebugLuauIfLocalSyntax: true,
      DebugLuauIfLocalAnalysis: true,
    },
  },
  // TypeInfer.refinements.test.cpp:3513 TEST_CASE_FIXTURE(BuiltinsFixture, "if_local_elseif_independent_bindings_are_narrowed")
  {
    name: "if_local_elseif_independent_bindings_are_narrowed",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(a: number?, b: string?)
            if local x = a then
                local s = x
            elseif local y = b then
                local t = y
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 26],
            equals: "number",
          },
          {
            typeAt: [5, 26],
            equals: "string",
          }
        ],
      }
    ],
    flags: {
      DebugLuauIfLocalSyntax: true,
      DebugLuauIfLocalAnalysis: true,
    },
  },
  // TypeInfer.refinements.test.cpp:3535 TEST_CASE_FIXTURE(BuiltinsFixture, "if_local_narrows_nested_table_field")
  {
    name: "if_local_narrows_nested_table_field",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(user: { name: string? })
            if local n = user.name then
                local s: string = n
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 34],
            equals: "string",
          }
        ],
      }
    ],
    flags: {
      DebugLuauIfLocalSyntax: true,
      DebugLuauIfLocalAnalysis: true,
    },
  },
  // TypeInfer.refinements.test.cpp:3554 TEST_CASE_FIXTURE(BuiltinsFixture, "if_local_uses_annotated_type")
  {
    name: "if_local_uses_annotated_type",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(v: number?)
            if local x: string = v then
                print(x)
            end
        end
    `,
        expect: [
          {
            anyError: "TypeMismatch",
          },
          {
            error: 0,
            code: "TypeMismatch",
            fields: {
              wantedType: "string",
            },
          },
          {
            error: 0,
            code: "TypeMismatch",
            fields: {
              givenType: "number?",
            },
          }
        ],
      }
    ],
    flags: {
      DebugLuauIfLocalSyntax: true,
      DebugLuauIfLocalAnalysis: true,
    },
  },
  // TypeInfer.refinements.test.cpp:3575 TEST_CASE_FIXTURE(BuiltinsFixture, "if_local_table_annotation_mismatch")
  {
    name: "if_local_table_annotation_mismatch",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(v: { x: number })
            if local y: { x: string } = v then
                print(y)
            end
        end
    `,
        expect: [
          {
            anyError: "TypeMismatch",
          },
          {
            error: 0,
            code: "TypeMismatch",
            fields: {
              wantedType: "{ x: string }",
            },
          },
          {
            error: 0,
            code: "TypeMismatch",
            fields: {
              givenType: "{ x: number }",
            },
          }
        ],
      }
    ],
    flags: {
      DebugLuauIfLocalSyntax: true,
      DebugLuauIfLocalAnalysis: true,
    },
  },
  // TypeInfer.refinements.test.cpp:3596 TEST_CASE_FIXTURE(BuiltinsFixture, "if_local_visits_malformed_annotation")
  {
    name: "if_local_visits_malformed_annotation",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f(v: number?)
            if local y: IDoNotExist = v then
                print(y)
            end
        end
    `,
        expect: [
          {
            anyError: "UnknownSymbol",
          },
          {
            error: 0,
            code: "UnknownSymbol",
            fields: {
              name: "IDoNotExist",
            },
          },
          {
            error: 0,
            code: "UnknownSymbol",
            fields: {
              context: "Type",
            },
          }
        ],
      }
    ],
    flags: {
      DebugLuauIfLocalSyntax: true,
      DebugLuauIfLocalAnalysis: true,
    },
  },
  // TypeInfer.refinements.test.cpp:3617 TEST_CASE_FIXTURE(BuiltinsFixture, "if_local_visits_malformed_annotation_qualified")
  {
    name: "if_local_visits_malformed_annotation_qualified",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local Foo = require(game.Foo)
        local function f(v: number?)
            if local y: Foo.Bar = v then
                print(y)
            end
        end
    `,
        module: "game/Main",
        moduleSources: {
          "game/Foo": `
        export type Baz = number
        return {}
    `,
        },
        expect: [
          {
            errors: 1,
          },
          {
            error: 0,
            code: "UnknownSymbol",
          }
        ],
      }
    ],
    flags: {
      DebugLuauIfLocalSyntax: true,
      DebugLuauIfLocalAnalysis: true,
    },
  },
  // TypeInfer.refinements.test.cpp:3644 TEST_CASE_FIXTURE(BuiltinsFixture, "if_local_bidirectional_table_annotation")
  {
    name: "if_local_bidirectional_table_annotation",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        if local y: { x: number? } = { x = 42 } then
            print(y)
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
    flags: {
      DebugLuauIfLocalSyntax: true,
      DebugLuauIfLocalAnalysis: true,
    },
  },
  // TypeInfer.refinements.test.cpp:3660 TEST_CASE_FIXTURE(BuiltinsFixture, "if_local_bidirectional_table_annotation_mismatch")
  {
    name: "if_local_bidirectional_table_annotation_mismatch",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        if local y: { x: number? } = { x = true } then
            print(y)
        end
    `,
        expect: [
          {
            anyError: "TypeMismatch",
          }
        ],
      }
    ],
    flags: {
      DebugLuauIfLocalSyntax: true,
      DebugLuauIfLocalAnalysis: true,
    },
  },
];

portUpstreamFile("TypeInfer.refinements.test.cpp", cases);
