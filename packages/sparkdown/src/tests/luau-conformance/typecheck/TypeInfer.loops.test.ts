// Luau tests/TypeInfer.loops.test.cpp at 7d5f73364fdbbaa984fa545071630eba73cfea98.
// Sources and expectations follow the new-solver CI branches at this pin.

import { portUpstreamFile, type PortedCase } from "./portedCases";

export const cases: PortedCase[] = [
  // TypeInfer.loops.test.cpp:23 TEST_CASE_FIXTURE(Fixture, "for_loop")
  {
    name: "for_loop",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local q
        for i=0, 50, 2 do
            q = i
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "q",
            equals: "number?",
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:44 TEST_CASE_FIXTURE(BuiltinsFixture, "iteration_no_table_passed")
  {
    name: "iteration_no_table_passed",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `

type Iterable = typeof(setmetatable(
    {},
    {}::{
        __iter: (self: Iterable) -> (any, number) -> (number, string)
    }
))

local t: Iterable

for a, b in t do end
`,
        expect: [
          {
            errors: 1,
          },
          {
            error: 0,
            code: "GenericError",
          },
          {
            error: 0,
            code: "GenericError",
            fields: {
              message: "__iter metamethod must return (next[, table[, state]])",
            },
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:72 TEST_CASE_FIXTURE(BuiltinsFixture, "iteration_regression_issue_69967")
  {
    name: "iteration_regression_issue_69967",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        type Iterable = typeof(setmetatable(
            {},
            {}::{
                __iter: (self: Iterable) -> () -> (number, string)
            }
        ))

        local t: Iterable

        for a, b in t do end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:93 TEST_CASE_FIXTURE(BuiltinsFixture, "iteration_regression_issue_69967_alt")
  {
    name: "iteration_regression_issue_69967_alt",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        type Iterable = typeof(setmetatable(
            {},
            {}::{
                __iter: (self: Iterable) -> () -> (number, string)
            }
        ))

        local t: Iterable
        local x, y

        for a, b in t do
            x = a
            y = b
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "x",
            equals: "number?",
          },
          {
            type: "y",
            equals: "string?",
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:129 TEST_CASE_FIXTURE(BuiltinsFixture, "for_in_loop")
  {
    name: "for_in_loop",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local n
        local s
        for i, v in pairs({ "foo" }) do
            n = i
            s = v
            print(i, v)
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "n",
            equals: "number?",
          },
          {
            type: "s",
            equals: "string?",
          },
          {
            typeAt: [6, 18],
            equals: "number",
          },
          {
            typeAt: [6, 21],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:157 TEST_CASE_FIXTURE(BuiltinsFixture, "for_in_loop_with_next")
  {
    name: "for_in_loop_with_next",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local n
        local s
        for i, v in next, { "foo" } do
            n = i
            s = v
            print(i, v)
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "n",
            equals: "number?",
          },
          {
            type: "s",
            equals: "string?",
          },
          {
            typeAt: [6, 18],
            equals: "number",
          },
          {
            typeAt: [6, 21],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:184 TEST_CASE_FIXTURE(BuiltinsFixture, "for_in_loop_with_next_and_multiple_elements")
  {
    name: "for_in_loop_with_next_and_multiple_elements",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local n
        local s
        for i, v in next, { "foo", "bar" } do
            n = i
            s = v
            print(i, v)
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "n",
            equals: "number?",
          },
          {
            type: "s",
            equals: "string?",
          },
          {
            typeAt: [6, 18],
            equals: "number",
          },
          {
            typeAt: [6, 21],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:212 TEST_CASE_FIXTURE(Fixture, "for_in_with_an_iterator_of_type_any")
  {
    name: "for_in_with_an_iterator_of_type_any",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local it: any
        local a, b
        for i, v in it do
            a, b = i, v
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
  // TypeInfer.loops.test.cpp:225 TEST_CASE_FIXTURE(Fixture, "for_in_loop_should_fail_with_non_function_iterator")
  {
    name: "for_in_loop_should_fail_with_non_function_iterator",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local foo = "bar"
        for i, v in foo do
        end
    `,
        expect: [
          {
            errors: 1,
          },
          {
            error: 0,
            message: "Cannot call a value of type string",
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:238 TEST_CASE_FIXTURE(BuiltinsFixture, "for_in_with_just_one_iterator_is_ok")
  {
    name: "for_in_with_just_one_iterator_is_ok",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function keys(dictionary)
            local new = {}
            local index = 1

            for key in pairs(dictionary) do
                new[index] = key
                index = index + 1
            end

            return new
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
  // TypeInfer.loops.test.cpp:258 TEST_CASE_FIXTURE(BuiltinsFixture, "for_in_loop_with_zero_iterators_dcr")
  {
    name: "for_in_loop_with_zero_iterators_dcr",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        function no_iter() end
        for key in no_iter() do end
    `,
        expect: [
          {
            errors: 1,
          },
          {
            error: 0,
            code: "GenericError",
          },
          {
            error: 0,
            code: "GenericError",
            fields: {
              message: "for..in loops require at least one value to iterate over.  Got zero",
            },
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:273 TEST_CASE_FIXTURE(BuiltinsFixture, "for_in_with_a_custom_iterator_should_type_check")
  {
    name: "for_in_with_a_custom_iterator_should_type_check",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function range(l, h): () -> number
            return function()
                return l
            end
        end

        for n: string in range(1, 10) do
            print(n)
        end
    `,
        expect: [
          {
            errors: 1,
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
  },
  // TypeInfer.loops.test.cpp:291 TEST_CASE_FIXTURE(Fixture, "for_in_loop_on_error")
  {
    name: "for_in_loop_on_error",
    fixture: "Fixture",
    checks: [
      {
        source: `
        function f(x)
            gobble.prop = x.otherprop
        end

        local p
        for _, part in i_am_not_defined do
            p = part
            f(part)
            part.thirdprop = false
        end
    `,
        expect: [
          {
            errors: 2,
          },
          {
            type: "p",
            equals: "*error-type*?",
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
  },
  // TypeInfer.loops.test.cpp:316 TEST_CASE_FIXTURE(Fixture, "for_in_loop_on_non_function")
  {
    name: "for_in_loop_on_non_function",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local bad_iter = 5

        for a in bad_iter() do
        end
    `,
        expect: [
          {
            errors: 1,
          },
          {
            error: 0,
            code: "CannotCallNonFunction",
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:330 TEST_CASE_FIXTURE(BuiltinsFixture, "for_in_loop_error_on_factory_not_returning_the_right_amount_of_values")
  {
    name: "for_in_loop_error_on_factory_not_returning_the_right_amount_of_values",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function hasDivisors(value: number, table)
            return false
        end

        function prime_iter(state, index)
            while hasDivisors(index, state) do
                index += 1
            end

            state[index] = true
            return index
        end

        function primes1()
            return prime_iter, {}
        end

        function primes2()
            return prime_iter, {}, ""
        end

        function primes3()
            return prime_iter, {}, 2
        end

        for p in primes1() do print(p) end -- mismatch in argument count

        for p in primes2() do print(p) end -- mismatch in argument types, prime_iter takes {}, number, we are given {}, string

        for p in primes3() do print(p) end -- no error
    `,
        expect: [],
      }
    ],
    skip: {
      newSolver: "does not pass on Luau's new solver upstream",
    },
  },
  // TypeInfer.loops.test.cpp:382 TEST_CASE_FIXTURE(BuiltinsFixture, "for_in_loop_error_on_iterator_requiring_args_but_none_given")
  {
    name: "for_in_loop_error_on_iterator_requiring_args_but_none_given",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        function prime_iter(state, index)
            return 1
        end

        for p in prime_iter do print(p) end
    `,
        expect: [],
      }
    ],
    skip: {
      newSolver: "does not pass on Luau's new solver upstream",
    },
  },
  // TypeInfer.loops.test.cpp:404 TEST_CASE_FIXTURE(Fixture, "for_in_loop_with_incompatible_args_to_iterator")
  {
    name: "for_in_loop_with_incompatible_args_to_iterator",
    fixture: "Fixture",
    checks: [
      {
        source: `
        function my_iter(state: string, index: number)
            return state, index
        end

        local my_state = {}
        local first_index = "first"

        -- Type errors here.  my_state and first_index cannot be passed to my_iter
        for a, b in my_iter, my_state, first_index do
        end
    `,
        expect: [
          {
            errors: 1,
          },
          {
            error: 0,
            code: "TypeMismatch",
          },
          {
            error: 0,
            location: [9, 20, 9, 27],
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
  },
  // TypeInfer.loops.test.cpp:442 TEST_CASE_FIXTURE(Fixture, "for_in_loop_with_custom_iterator")
  {
    name: "for_in_loop_with_custom_iterator",
    fixture: "Fixture",
    checks: [
      {
        source: `
        function primes()
            return function (state: number) end,  2
        end

        for p, q in primes do
            q = ""
        end
    `,
        expect: [
          {
            errors: 1,
          },
          {
            error: 0,
            code: "TypeMismatch",
          },
          {
            diagnosticType: [0, "wantedType"],
            sameAs: {
              builtin: "number",
            },
          },
          {
            diagnosticType: [0, "givenType"],
            sameAs: {
              builtin: "string",
            },
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
  },
  // TypeInfer.loops.test.cpp:463 TEST_CASE_FIXTURE(Fixture, "while_loop")
  {
    name: "while_loop",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local i
        while true do
            i = 8
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "i",
            equals: "number?",
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:480 TEST_CASE_FIXTURE(Fixture, "repeat_loop")
  {
    name: "repeat_loop",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local i
        repeat
            i = 'hi'
        until true
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "i",
            equals: "string?",
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:497 TEST_CASE_FIXTURE(Fixture, "repeat_loop_condition_binds_to_its_block")
  {
    name: "repeat_loop_condition_binds_to_its_block",
    fixture: "Fixture",
    checks: [
      {
        source: `
        repeat
            local x = true
        until x
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:508 TEST_CASE_FIXTURE(BuiltinsFixture, "symbols_in_repeat_block_should_not_be_visible_beyond_until_condition")
  {
    name: "symbols_in_repeat_block_should_not_be_visible_beyond_until_condition",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        repeat
            local x = true
        until x

        print(x)
    `,
        expect: [
          {
            errors: 1,
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:521 TEST_CASE_FIXTURE(BuiltinsFixture, "varlist_declared_by_for_in_loop_should_be_free")
  {
    name: "varlist_declared_by_for_in_loop_should_be_free",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local T = {}

        function T.f(p)
            for i, v in pairs(p) do
                T.f(v)
            end
        end
    `,
        expect: [
          {
            errors: 1,
          },
          {
            error: 0,
            code: "TypeMismatch",
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
  },
  // TypeInfer.loops.test.cpp:547 TEST_CASE_FIXTURE(BuiltinsFixture, "iter_constraint_before_loop_body")
  {
    name: "iter_constraint_before_loop_body",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local T = {
    \t    fields = {},
        }

        function f()
            for u, v in pairs(T.fields) do
                T.fields[u] = nil
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
  // TypeInfer.loops.test.cpp:564 TEST_CASE_FIXTURE(BuiltinsFixture, "rbxl_place_file_crash_for_wrong_constraints")
  {
    name: "rbxl_place_file_crash_for_wrong_constraints",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
local VehicleParameters = {
    -- These are default values in the case the package structure is broken
\tStrutSpringStiffnessFront = 28000,
}

local function updateFromConfiguration()
\tfor property, value in pairs(VehicleParameters) do
        VehicleParameters[property] = value
\tend
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
  // TypeInfer.loops.test.cpp:582 TEST_CASE_FIXTURE(BuiltinsFixture, "properly_infer_iteratee_is_a_free_table")
  {
    name: "properly_infer_iteratee_is_a_free_table",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        for iter in pairs({}) do
            iter:g().p = true
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
            location: [2, 12, 2, 18],
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:603 TEST_CASE_FIXTURE(BuiltinsFixture, "correctly_scope_locals_while")
  {
    name: "correctly_scope_locals_while",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        while true do
            local a = 1
        end

        print(a) -- oops!
    `,
        expect: [
          {
            errors: 1,
          },
          {
            error: 0,
            code: "UnknownSymbol",
          },
          {
            error: 0,
            code: "UnknownSymbol",
            fields: {
              name: "a",
            },
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:620 TEST_CASE_FIXTURE(BuiltinsFixture, "trivial_ipairs_usage")
  {
    name: "trivial_ipairs_usage",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local next, t, s = ipairs({1, 2, 3})
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "next",
            equals: "({number}, number) -> (number?, number)",
          },
          {
            type: "t",
            equals: "{number}",
          },
          {
            type: "s",
            equals: "number",
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:633 TEST_CASE_FIXTURE(BuiltinsFixture, "ipairs_produces_integral_indices")
  {
    name: "ipairs_produces_integral_indices",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local key
        for i, e in ipairs({}) do key = i end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "key",
            equals: "number?",
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:648 TEST_CASE_FIXTURE(Fixture, "for_in_loop_where_iteratee_is_free")
  {
    name: "for_in_loop_where_iteratee_is_free",
    fixture: "Fixture",
    checks: [
      {
        source: `
        --!nonstrict
        function _:_(...)
        end

        repeat
            if _ then
            else
                _ = ...
            end
        until _

        for _ in _() do
        end
    `,
        expect: [],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:668 TEST_CASE_FIXTURE(BuiltinsFixture, "unreachable_code_after_infinite_loop")
  {
    name: "unreachable_code_after_infinite_loop",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
            function unreachablecodepath(a): number
                while true do
                    if a then return 10 end
                end
                -- unreachable
            end
            unreachablecodepath(4)
        `,
        expect: [
          {
            errors: 0,
          }
        ],
        ignoreMissingAnnotations: true,
      },
      {
        source: `
            function reachablecodepath(a): number
                while true do
                    if a then break end
                    return 10
                end

                print("x") -- correct error
            end
            reachablecodepath(4)
        `,
        expect: [
          {
            errors: "some",
          },
          {
            error: 0,
            code: "FunctionExitsWithoutReturning",
          }
        ],
        ignoreMissingAnnotations: true,
      },
      {
        source: `
            function unreachablecodepath(a): number
                repeat
                    if a then return 10 end
                until false

                -- unreachable
            end
            unreachablecodepath(4)
        `,
        expect: [
          {
            errors: 0,
          }
        ],
        ignoreMissingAnnotations: true,
      },
      {
        source: `
            function reachablecodepath(a, b): number
                repeat
                    if a then break end

                    if b then return 10 end
                until false

                print("x") -- correct error
            end
            reachablecodepath(4)
        `,
        expect: [
          {
            errors: "some",
          },
          {
            error: 0,
            code: "FunctionExitsWithoutReturning",
          }
        ],
        ignoreMissingAnnotations: true,
      },
      {
        source: `
            function unreachablecodepath(a: number?): number
                repeat
                    return 10
                until a ~= nil

                -- unreachable
            end
            unreachablecodepath(4)
        `,
        expect: [
          {
            errors: 0,
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
    shareFixture: true,
  },
  // TypeInfer.loops.test.cpp:755 TEST_CASE_FIXTURE(BuiltinsFixture, "loop_typecheck_crash_on_empty_optional")
  // Upstream returns before checking on the new solver: if (!FFlag::DebugLuauForceOldSolver) return;. Source and old-solver expectations remain as provenance and do not execute as new-solver assertions.
  {
    name: "loop_typecheck_crash_on_empty_optional",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local t = {}
        for _ in t do
            for _ in assert(missing()) do
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
    skip: {
      newSolver: "upstream returns before checking: CLI-116498 Sometimes you can iterate over tables with no indexers.",
    },
  },
  // TypeInfer.loops.test.cpp:772 TEST_CASE_FIXTURE(Fixture, "fuzz_fail_missing_instantitation_follow")
  {
    name: "fuzz_fail_missing_instantitation_follow",
    fixture: "Fixture",
    checks: [
      {
        source: `
        --!nonstrict
        function _(l0:number)
        return _
        end
        for _ in _(8) do
        end
    `,
        expect: [],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:785 TEST_CASE_FIXTURE(BuiltinsFixture, "for_in_with_generic_next")
  {
    name: "for_in_with_generic_next",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        for k: number, v: number in next, {1, 2, 3} do
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
  // TypeInfer.loops.test.cpp:795 TEST_CASE_FIXTURE(Fixture, "loop_iter_basic")
  {
    name: "loop_iter_basic",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local t: {string} = {}
        local key
        for k: number in t do
        end
        for k: number, v: string in t do
        end
        for k, v in t do
            key = k
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "key",
            equals: "number?",
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:822 TEST_CASE_FIXTURE(Fixture, "loop_iter_trailing_nil")
  {
    name: "loop_iter_trailing_nil",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local t: {string} = {}
        local extra
        for k, v, e in t do
            extra = e
        end
    `,
        expect: [],
      }
    ],
    skip: {
      newSolver: "does not pass on Luau's new solver upstream",
    },
  },
  // TypeInfer.loops.test.cpp:839 TEST_CASE_FIXTURE(Fixture, "loop_iter_no_indexer_strict")
  {
    name: "loop_iter_no_indexer_strict",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local t = {}
        for k, v in t do
        end
    `,
        expect: [],
      }
    ],
    skip: {
      newSolver: "does not pass on Luau's new solver upstream",
    },
  },
  // TypeInfer.loops.test.cpp:853 TEST_CASE_FIXTURE(Fixture, "loop_iter_no_indexer_nonstrict")
  {
    name: "loop_iter_no_indexer_nonstrict",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local t = {}
        for k, v in t do
        end
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
  // TypeInfer.loops.test.cpp:864 TEST_CASE_FIXTURE(BuiltinsFixture, "loop_iter_metamethod_nil")
  // Upstream compiles this case header, but its entire body is preprocessor-disabled. This empty check asserts nothing upstream; the exact disabled body follows for provenance.
  // #if 0 // CLI-116499 Free types persisting until typechecking time.
  //     if (FFlag::DebugLuauForceOldSolver)
  //         return;
  //
  //     CheckResult result = check(R"(
  //         local t = setmetatable({}, { __iter = function(o) return next, nil end, })
  //         for k: number, v: string in t do
  //         end
  //     )");
  //
  //     LUAU_REQUIRE_ERROR_COUNT(1, result);
  //     CHECK(toString(result.errors[0]) == "Type 'nil' could not be converted into '{- [a]: b -}'");
  // #endif
  {
    name: "loop_iter_metamethod_nil",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: "",
        expect: [],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:881 TEST_CASE_FIXTURE(BuiltinsFixture, "loop_iter_metamethod_not_enough_returns")
  // Upstream compiles this case header, but its entire body is preprocessor-disabled. This empty check asserts nothing upstream; the exact disabled body follows for provenance.
  // #if 0 // CLI-116500
  //     if (FFlag::DebugLuauForceOldSolver)
  //         return;
  //
  //     CheckResult result = check(R"(
  //         local t = setmetatable({}, { __iter = function(o) end })
  //         for k: number, v: string in t do
  //         end
  //     )");
  //
  //     LUAU_REQUIRE_ERROR_COUNT(1, result);
  //     CHECK(
  //         result.errors[0] == TypeError{
  //                                 Location{{2, 36}, {2, 37}},
  //                                 GenericError{"__iter must return at least one value"},
  //                             }
  //     );
  // #endif
  {
    name: "loop_iter_metamethod_not_enough_returns",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: "",
        expect: [],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:903 TEST_CASE_FIXTURE(BuiltinsFixture, "loop_iter_metamethod_ok")
  // Upstream compiles this case header, but its entire body is preprocessor-disabled. This empty check asserts nothing upstream; the exact disabled body follows for provenance.
  // #if 0 // CLI-116500
  //     if (FFlag::DebugLuauForceOldSolver)
  //         return;
  //
  //     CheckResult result = check(R"(
  //         local t = setmetatable({
  //             children = {"foo"}
  //         }, { __iter = function(o) return next, o.children end })
  //         for k: number, v: string in t do
  //         end
  //     )");
  //
  //     LUAU_REQUIRE_ERROR_COUNT(0, result);
  // #endif
  {
    name: "loop_iter_metamethod_ok",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: "",
        expect: [],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:921 TEST_CASE_FIXTURE(BuiltinsFixture, "loop_iter_metamethod_ok_with_inference")
  // Upstream compiles this case header, but its entire body is preprocessor-disabled. This empty check asserts nothing upstream; the exact disabled body follows for provenance.
  // #if 0 // CLI-116500
  //     if (FFlag::DebugLuauForceOldSolver)
  //         return;
  //
  //     CheckResult result = check(R"(
  //         local t = setmetatable({
  //             children = {"foo"}
  //         }, { __iter = function(o) return next, o.children end })
  //
  //         local a, b
  //         for k, v in t do
  //             a = k
  //             b = v
  //         end
  //     )");
  //
  //     LUAU_REQUIRE_NO_ERRORS(result);
  //     CHECK(toString(requireType("a")) == "number");
  //     CHECK(toString(requireType("b")) == "string");
  // #endif
  {
    name: "loop_iter_metamethod_ok_with_inference",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: "",
        expect: [],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:945 TEST_CASE_FIXTURE(Fixture, "for_loop_lower_bound_is_string")
  {
    name: "for_loop_lower_bound_is_string",
    fixture: "Fixture",
    checks: [
      {
        source: `
        for i: unknown = 1, 10 do end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:954 TEST_CASE_FIXTURE(Fixture, "for_loop_lower_bound_is_string_2")
  {
    name: "for_loop_lower_bound_is_string_2",
    fixture: "Fixture",
    checks: [
      {
        source: `
        for i: never = 1, 10 do end
    `,
        expect: [
          {
            errors: 1,
          },
          {
            error: 0,
            message: "Expected this to be unreachable, but got 'number'",
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:964 TEST_CASE_FIXTURE(Fixture, "for_loop_lower_bound_is_string_3")
  {
    name: "for_loop_lower_bound_is_string_3",
    fixture: "Fixture",
    checks: [
      {
        source: `
        for i: number | string = 1, 10 do end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:973 TEST_CASE_FIXTURE(BuiltinsFixture, "cli_68448_iterators_need_not_accept_nil")
  // Upstream returns before checking on the new solver: if (!FFlag::DebugLuauForceOldSolver) return;. Source and old-solver expectations remain as provenance and do not execute as new-solver assertions.
  {
    name: "cli_68448_iterators_need_not_accept_nil",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function makeEnum(members)
            local enum = {}
            for _, memberName in ipairs(members) do
                enum[memberName] = memberName
            end
            return enum
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "makeEnum",
            options: {
              exhaustive: true,
            },
            equals: "<T>({T}) -> { [T]: T }",
          }
        ],
      }
    ],
    skip: {
      newSolver: "upstream returns before checking: CLI-116500",
    },
  },
  // TypeInfer.loops.test.cpp:995 TEST_CASE_FIXTURE(Fixture, "iterate_over_free_table")
  {
    name: "iterate_over_free_table",
    fixture: "Fixture",
    checks: [
      {
        source: `
        function print(x) end

        function dump(tbl)
            print(tbl.whatever)
            for k, v in tbl do
                print(k)
                print(v)
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
  // TypeInfer.loops.test.cpp:1013 TEST_CASE_FIXTURE(BuiltinsFixture, "dcr_iteration_explore_raycast_minimization")
  {
    name: "dcr_iteration_explore_raycast_minimization",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local testResults = {}
        for _, testData in pairs(testResults) do
        end

        table.insert(testResults, {})
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:1026 TEST_CASE_FIXTURE(BuiltinsFixture, "dcr_iteration_minimized_fragmented_keys_1")
  {
    name: "dcr_iteration_minimized_fragmented_keys_1",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function rawpairs(t)
            return next, t, nil
        end

        local function getFragmentedKeys(tbl)
            local _ = rawget(tbl, 0)
            for _ in rawpairs(tbl) do
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
  // TypeInfer.loops.test.cpp:1044 TEST_CASE_FIXTURE(BuiltinsFixture, "dcr_iteration_minimized_fragmented_keys_2")
  {
    name: "dcr_iteration_minimized_fragmented_keys_2",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function getFragmentedKeys(tbl)
            local _ = rawget(tbl, 0)
            for _ in next, tbl, nil do
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
  // TypeInfer.loops.test.cpp:1058 TEST_CASE_FIXTURE(BuiltinsFixture, "dcr_iteration_minimized_fragmented_keys_3")
  {
    name: "dcr_iteration_minimized_fragmented_keys_3",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function getFragmentedKeys(tbl)
            local _ = rawget(tbl, 0)
            for _ in pairs(tbl) do
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
  // TypeInfer.loops.test.cpp:1072 TEST_CASE_FIXTURE(BuiltinsFixture, "dcr_iteration_fragmented_keys")
  {
    name: "dcr_iteration_fragmented_keys",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function isIndexKey(k, contiguousLength)
            return true
        end

        local function getTableLength(tbl)
            local length = 1
            local value = rawget(tbl, length)
            while value ~= nil do
                length += 1
                value = rawget(tbl, length)
            end
            return length - 1
        end

        local function rawpairs(t)
            return next, t, nil
        end

        local function getFragmentedKeys(tbl)
            local keys = {}
            local keysLength = 0
            local tableLength = getTableLength(tbl)
            for key, _ in rawpairs(tbl) do
                if not isIndexKey(key, tableLength) then
                    keysLength = keysLength + 1
                    keys[keysLength] = key
                end
            end
            return keys, keysLength, tableLength
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
  // TypeInfer.loops.test.cpp:1111 TEST_CASE_FIXTURE(BuiltinsFixture, "dcr_xpath_candidates")
  // Upstream returns before checking on the new solver: if (!FFlag::DebugLuauForceOldSolver) return;. Source and old-solver expectations remain as provenance and do not execute as new-solver assertions.
  {
    name: "dcr_xpath_candidates",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        type Instance = {}
        local function findCandidates(instances: { Instance },  path: { string })
            for _, name in ipairs(path) do
            end
            return {}
        end

        local canditates = findCandidates({}, {})
        for _, canditate in ipairs(canditates) do end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
    skip: {
      newSolver: "upstream returns before checking: CLI-116500",
    },
  },
  // TypeInfer.loops.test.cpp:1132 TEST_CASE_FIXTURE(BuiltinsFixture, "dcr_iteration_on_never_gives_never")
  {
    name: "dcr_iteration_on_never_gives_never",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local iter: never
        local ans
        for xs in iter do
            ans = xs
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "ans",
            equals: "nil",
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:1153 TEST_CASE_FIXTURE(BuiltinsFixture, "iterate_over_properties")
  {
    name: "iterate_over_properties",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function f()
            local t = { p = 5, q = "hello" }
            for k, v in t do
                return k, v
            end

            error("")
        end

        local k, v = f()
    `,
        expect: [],
      }
    ],
    skip: {
      newSolver: "does not pass on Luau's new solver upstream",
    },
  },
  // TypeInfer.loops.test.cpp:1177 TEST_CASE_FIXTURE(BuiltinsFixture, "iterate_over_properties_nonstrict")
  {
    name: "iterate_over_properties_nonstrict",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        --!nonstrict
        local function f()
            local t = { p = 5, q = "hello" }
            for k, v in t do
                return k, v
            end

            error("")
        end

        local k, v = f()
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:1196 TEST_CASE_FIXTURE(BuiltinsFixture, "pairs_should_not_retroactively_add_an_indexer")
  {
    name: "pairs_should_not_retroactively_add_an_indexer",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        --!strict
        local prices = {
            hat = 1,
            bat = 2,
        }
        print(prices.wwwww)
        for _, _ in pairs(prices) do
        end
        print(prices.wwwww)
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:1221 TEST_CASE_FIXTURE(BuiltinsFixture, "lti_fuzzer_uninitialized_loop_crash")
  {
    name: "lti_fuzzer_uninitialized_loop_crash",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        for l0=_,_ do
            return _()
        end
    `,
        expect: [
          {
            errors: 3,
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:1232 TEST_CASE_FIXTURE(BuiltinsFixture, "iterate_array_of_singletons")
  {
    name: "iterate_array_of_singletons",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        --!strict
        type Direction = "Left" | "Right" | "Up" | "Down"
        local Instructions: { Direction } = { "Left", "Down" }

        for _, step in Instructions do
            local dir: Direction = step
            print(dir)
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
  // TypeInfer.loops.test.cpp:1251 TEST_CASE_FIXTURE(BuiltinsFixture, "iter_mm_results_are_lvalue")
  {
    name: "iter_mm_results_are_lvalue",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local foo = setmetatable({}, {
            __iter = function()
                return pairs({1, 2, 3})
            end,
        })

        for k, v in foo do
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
  // TypeInfer.loops.test.cpp:1267 TEST_CASE_FIXTURE(BuiltinsFixture, "forin_metatable_no_iter_mm")
  {
    name: "forin_metatable_no_iter_mm",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local t = setmetatable({1, 2, 3}, {})

        for i, v in t do
            print(i, v)
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [4, 18],
            equals: "number",
          },
          {
            typeAt: [4, 21],
            equals: "number",
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:1285 TEST_CASE_FIXTURE(BuiltinsFixture, "forin_metatable_iter_mm")
  {
    name: "forin_metatable_iter_mm",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        type Iterable<T...> = typeof(setmetatable({}, {} :: {
            __iter: (Iterable<T...>) -> () -> T...
        }))

        for i, v in {} :: Iterable<...number> do
            print(i, v)
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [6, 18],
            equals: "number",
          },
          {
            typeAt: [6, 21],
            equals: "number",
          }
        ],
        unparsed: {
          defect: 876,
        },
      }
    ],
  },
  // TypeInfer.loops.test.cpp:1305 TEST_CASE_FIXTURE(BuiltinsFixture, "iteration_preserves_error_suppression")
  {
    name: "iteration_preserves_error_suppression",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        function first(x: any)
            for k, v in pairs(x) do
                print(k, v)
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 22],
            equals: "*error-type* | ~nil",
          },
          {
            typeAt: [3, 25],
            equals: "any",
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:1323 TEST_CASE_FIXTURE(BuiltinsFixture, "tryDispatchIterableFunction_under_constrained_loop_should_not_assert")
  {
    name: "tryDispatchIterableFunction_under_constrained_loop_should_not_assert",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
local function foo(Instance)
    for _, Child in next, Instance:GetChildren() do
    end
end
    `,
        expect: [],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:1333 TEST_CASE_FIXTURE(BuiltinsFixture, "for_in_surprising_iterator")
  {
    name: "for_in_surprising_iterator",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
function broken(): (...() -> ())
    return function() end, function() end
end

for p in broken() do print(p) end
    `,
        expect: [
          {
            errors: "some",
          }
        ],
        unparsed: {
          defect: 876,
        },
      }
    ],
  },
  // TypeInfer.loops.test.cpp:1346 TEST_CASE_FIXTURE(BuiltinsFixture, "for_in_require")
  {
    name: "for_in_require",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        for _ in require do
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
        unparsed: {
          defect: 879,
        },
      }
    ],
  },
  // TypeInfer.loops.test.cpp:1356 TEST_CASE_FIXTURE(Fixture, "oss_1480")
  {
    name: "oss_1480",
    fixture: "Fixture",
    checks: [
      {
        source: `
        type Part = { Parent: Part? }
        type Instance = Part

        local part = {} :: Part

        local currentParent: Instance? = part.Parent
        while currentParent ~= nil do
            currentParent = currentParent.Parent
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
  // TypeInfer.loops.test.cpp:1371 TEST_CASE_FIXTURE(BuiltinsFixture, "oss_1413")
  {
    name: "oss_1413",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function KahanSum(values: {number}): number
            local sum: number = 0
            local compensator: number = 0
            for _, value in values do
                local y = value - compensator
                local t = sum + y
                compensator = (t - sum) - y
                sum = t
            end
            return sum
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
        local function HistogramString(values: {number})
            local histogram = {}
            values = table.clone(values)
            table.sort(values)

            local count = #values
            local range = (count - 1)

            local digitIndex = range // 2 + 1
            while digitIndex < count and values[digitIndex] == 0 do
                digitIndex = count - ((count - digitIndex) // 2)
            end
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
        local function fun1()
            local foo = 1
            local bar = foo - foo + foo
            while false do
                foo = bar
            end
        end
        local function fun2()
            local foo = 1
            while false do
                local bar = foo - foo + foo
                foo = bar
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
    shareFixture: true,
  },
  // TypeInfer.loops.test.cpp:1421 TEST_CASE_FIXTURE(BuiltinsFixture, "while_loop_error_in_body")
  {
    name: "while_loop_error_in_body",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function foo()
            local x = ""
            while math.random () > 0.5 do
                x = nil
                error("why did you make x nil tho")
            end
            return x
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "foo",
            equals: "() -> string",
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
  },
  // TypeInfer.loops.test.cpp:1442 TEST_CASE_FIXTURE(BuiltinsFixture, "while_loop_assign_different_type")
  {
    name: "while_loop_assign_different_type",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function takesString(_: string) end
        local function takesNil(_: nil) end
        local function foo()
            local x = ""
            takesString(x)
            while math.random () > 0.5 do
                x = nil
                takesNil(x)
            end
            return x
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "foo",
            equals: "() -> string?",
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
  },
  // TypeInfer.loops.test.cpp:1465 TEST_CASE_FIXTURE(BuiltinsFixture, "repeat_loop_assignment")
  {
    name: "repeat_loop_assignment",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local x = nil
        repeat
            x = 42
        until math.random() > 0.5
        local y = x
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "y",
            equals: "number",
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:1478 TEST_CASE_FIXTURE(BuiltinsFixture, "repeat_loop_assignment_with_break")
  {
    name: "repeat_loop_assignment_with_break",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local x = nil
        repeat
            x = 42
        until math.random() > 0.5
        local y = x
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "y",
            equals: "number",
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:1491 TEST_CASE_FIXTURE(BuiltinsFixture, "repeat_unconditionally_fires_error")
  {
    name: "repeat_unconditionally_fires_error",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local x = nil
        repeat
            x = 42
        until true
        -- \`x\` should unconditionally be \`number\` here as the assignment
        -- above will _always_ run.
        local y = x
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "y",
            equals: "number",
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:1506 TEST_CASE_FIXTURE(BuiltinsFixture, "repeat_is_linearish")
  {
    name: "repeat_is_linearish",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local x = nil
        if math.random () > 0.5 then
            x = ""
            repeat
                error("spooky scary error")
            until true
        end
        -- The repeat in the above branch unconditionally fires the error, so
        -- this should _always_ be \`nil\`
        local y = x
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "y",
            equals: "nil",
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:1527 TEST_CASE_FIXTURE(Fixture, "ensure_local_in_loop_does_not_escape")
  {
    name: "ensure_local_in_loop_does_not_escape",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local x = 42
        repeat
            local x = ""
        until true
        -- The local inside the loop should have no effect on the local
        -- outside the loop.
        local y = x
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "y",
            equals: "number",
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:1542 TEST_CASE_FIXTURE(Fixture, "oss_1851_union_of_many_strings")
  {
    name: "oss_1851_union_of_many_strings",
    fixture: "Fixture",
    checks: [
      {
        source: `
--!strict
type union = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"

local example: { [union]: number } = {}

for key in example do
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
  // TypeInfer.loops.test.cpp:1555 TEST_CASE_FIXTURE(BuiltinsFixture, "any_type_in_for_loop_should_propagate")
  {
    name: "any_type_in_for_loop_should_propagate",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        --!strict
        function my_iter(): any
            return {}
        end

        for index: number, value: string in my_iter() do
            print(index, value)
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [7, 18],
            equals: "number",
          },
          {
            typeAt: [7, 25],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:1574 TEST_CASE_FIXTURE(BuiltinsFixture, "explicit_types_in_for_loop_should_propagate")
  {
    name: "explicit_types_in_for_loop_should_propagate",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        --!strict
        function my_iter(): {[number]: string}
            return {}
        end

        for index: number, value: string in my_iter() do
            print(index, value)
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [7, 18],
            equals: "number",
          },
          {
            typeAt: [7, 25],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:1593 TEST_CASE_FIXTURE(BuiltinsFixture, "incorrect_type_annotation_types_in_loop_should_propagate_with_errors")
  {
    name: "incorrect_type_annotation_types_in_loop_should_propagate_with_errors",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        --!strict
        function my_iter(): any
            return {}
        end
        for index: number, value: string in my_iter() do
            index = ""
            print(index)
        end
    `,
        expect: [
          {
            errors: 1,
          },
          {
            error: 0,
            code: "TypeMismatch",
          },
          {
            error: 0,
            code: "TypeMismatch",
            fields: {
              wantedType: "number",
            },
          },
          {
            error: 0,
            code: "TypeMismatch",
            fields: {
              givenType: "string",
            },
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:1614 TEST_CASE_FIXTURE(BuiltinsFixture, "for_in_loop_annotations_apply_to_function_expressions")
  {
    name: "for_in_loop_annotations_apply_to_function_expressions",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        --!strict
        function my_iter(): any
            return {}
        end

        local function takesString(s: string) end

        for index: number in my_iter() do
            takesString(index)
        end
    `,
        expect: [
          {
            errors: 1,
          },
          {
            error: 0,
            code: "TypeMismatch",
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
              givenType: "number",
            },
          }
        ],
      }
    ],
  },
  // TypeInfer.loops.test.cpp:1637 TEST_CASE_FIXTURE(BuiltinsFixture, "for_in_loop_annotations_apply_inside_lambdas")
  {
    name: "for_in_loop_annotations_apply_inside_lambdas",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        --!strict
        function my_iter(): any
            return {}
        end

        for index: number in my_iter() do
            local fn = function()
                index = ""
            end
            fn()
        end
    `,
        expect: [
          {
            errors: 1,
          },
          {
            error: 0,
            code: "TypeMismatch",
          },
          {
            error: 0,
            code: "TypeMismatch",
            fields: {
              wantedType: "number",
            },
          },
          {
            error: 0,
            code: "TypeMismatch",
            fields: {
              givenType: "string",
            },
          }
        ],
      }
    ],
  },
];

portUpstreamFile("TypeInfer.loops.test.cpp", cases);
