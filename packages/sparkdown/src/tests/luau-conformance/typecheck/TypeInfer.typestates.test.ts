// Luau tests/TypeInfer.typestates.test.cpp at 7d5f73364fdbbaa984fa545071630eba73cfea98.
// Sources and expectations follow the new-solver CI branches at this pin.

import { portUpstreamFile, type PortedCase } from "./portedCases";

export const cases: PortedCase[] = [
  // TypeInfer.typestates.test.cpp:20 TEST_CASE_FIXTURE(TypeStateFixture, "initialize_x_of_type_string_or_nil_with_nil")
  {
    name: "initialize_x_of_type_string_or_nil_with_nil",
    fixture: "TypeStateFixture",
    checks: [
      {
        source: `
        local x: string? = nil
        local a = x
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "a",
            equals: "string?",
          }
        ],
      }
    ],
  },
  // TypeInfer.typestates.test.cpp:31 TEST_CASE_FIXTURE(TypeStateFixture, "extraneous_lvalues_are_populated_with_nil")
  {
    name: "extraneous_lvalues_are_populated_with_nil",
    fixture: "TypeStateFixture",
    checks: [
      {
        source: `
        local function f(): (string, number)
            return "hello", 5
        end

        local x, y, z = f()
    `,
        expect: [
          {
            errors: 1,
          },
          {
            error: 0,
            message: "Function only returns 2 values, but 3 are required here",
          },
          {
            type: "x",
            equals: "string",
          },
          {
            type: "y",
            equals: "number",
          },
          {
            type: "z",
            equals: "nil",
          }
        ],
      }
    ],
  },
  // TypeInfer.typestates.test.cpp:48 TEST_CASE_FIXTURE(TypeStateFixture, "assign_different_values_to_x")
  {
    name: "assign_different_values_to_x",
    fixture: "TypeStateFixture",
    checks: [
      {
        source: `
        local x: string? = nil
        local a = x
        x = "hello!"
        local b = x
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "a",
            equals: "string?",
          },
          {
            type: "b",
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.typestates.test.cpp:62 TEST_CASE_FIXTURE(TypeStateFixture, "parameter_x_was_constrained_by_two_types")
  {
    name: "parameter_x_was_constrained_by_two_types",
    fixture: "TypeStateFixture",
    checks: [
      {
        source: `
        local function f(x): string?
            local y: string | number = x
            return y
        end
    `,
        expect: [
          {
            errors: "some",
          },
          {
            error: 0,
            code: "TypeMismatch",
          },
          {
            error: 0,
            code: "TypeMismatch",
            fields: {
              wantedType: "string?",
            },
          },
          {
            error: 0,
            code: "TypeMismatch",
            fields: {
              givenType: "number | string",
            },
          },
          {
            type: "f",
            equals: "(number | string) -> string?",
          }
        ],
      }
    ],
  },
  // TypeInfer.typestates.test.cpp:100 TEST_CASE_FIXTURE(TypeStateFixture, "local_that_will_be_assigned_later")
  {
    name: "local_that_will_be_assigned_later",
    fixture: "TypeStateFixture",
    checks: [
      {
        source: `
        local x: string
    `,
        expect: [
          {
            errors: 1,
          }
        ],
      }
    ],
    skip: {
      disabledUpstream: true,
    },
  },
  // TypeInfer.typestates.test.cpp:109 TEST_CASE_FIXTURE(TypeStateFixture, "refine_a_local_and_then_assign_it")
  {
    name: "refine_a_local_and_then_assign_it",
    fixture: "TypeStateFixture",
    checks: [
      {
        source: `
        local function f(x: string?)
            if typeof(x) == "string" then
                x = nil
            end

            local y: nil = x
        end
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
    skip: {
      disabledUpstream: true,
    },
  },
  // TypeInfer.typestates.test.cpp:125 TEST_CASE_FIXTURE(TypeStateFixture, "assign_a_local_and_then_refine_it")
  {
    name: "assign_a_local_and_then_refine_it",
    fixture: "TypeStateFixture",
    checks: [
      {
        source: `
        local function f(x: string?)
            x = nil

            if typeof(x) == "string" then
                local y: typeof(x) = "hello"
            end
        end
    `,
        expect: [
          {
            errors: 1,
          },
          {
            error: 0,
            message: "Expected this to be unreachable, but got 'string'",
          }
        ],
      }
    ],
  },
  // TypeInfer.typestates.test.cpp:141 TEST_CASE_FIXTURE(TypeStateFixture, "recursive_local_function")
  {
    name: "recursive_local_function",
    fixture: "TypeStateFixture",
    checks: [
      {
        source: `
        local function f(x)
            f(5)
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
  // TypeInfer.typestates.test.cpp:154 TEST_CASE_FIXTURE(TypeStateFixture, "recursive_function")
  {
    name: "recursive_function",
    fixture: "TypeStateFixture",
    checks: [
      {
        source: `
        function f(x)
            f(5)
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
  // TypeInfer.typestates.test.cpp:167 TEST_CASE_FIXTURE(TypeStateFixture, "compound_assignment")
  {
    name: "compound_assignment",
    fixture: "TypeStateFixture",
    checks: [
      {
        source: `
        local x = 5
        x += 7

        local a = x
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
  },
  // TypeInfer.typestates.test.cpp:179 TEST_CASE_FIXTURE(TypeStateFixture, "assignment_identity")
  {
    name: "assignment_identity",
    fixture: "TypeStateFixture",
    checks: [
      {
        source: `
        local x = 5
        x = x

        local a = x
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "a",
            equals: "number",
          }
        ],
      }
    ],
  },
  // TypeInfer.typestates.test.cpp:192 TEST_CASE_FIXTURE(TypeStateFixture, "assignment_swap")
  {
    name: "assignment_swap",
    fixture: "TypeStateFixture",
    checks: [
      {
        source: `
        local x, y = 5, "hello"
        x, y = y, x

        local a, b = x, y
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "a",
            equals: "string",
          },
          {
            type: "b",
            equals: "number",
          }
        ],
      }
    ],
  },
  // TypeInfer.typestates.test.cpp:206 TEST_CASE_FIXTURE(TypeStateFixture, "parameter_x_was_constrained_by_two_types_2")
  {
    name: "parameter_x_was_constrained_by_two_types_2",
    fixture: "TypeStateFixture",
    checks: [
      {
        source: `
        local function f(x): number?
            local y: string? = nil  -- 'y <: string?
            y = x                   -- 'y ~ 'x
            return y                -- 'y <: number?

                                    -- We therefore infer 'y <: (string | nil) & (number | nil)
                                    -- or 'y <: nil
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "f",
            equals: "(nil) -> number?",
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
  },
  // TypeInfer.typestates.test.cpp:225 TEST_CASE_FIXTURE(TypeStateFixture, "parameter_x_is_some_type_or_optional_then_assigned_with_alternate_value")
  {
    name: "parameter_x_is_some_type_or_optional_then_assigned_with_alternate_value",
    fixture: "TypeStateFixture",
    checks: [
      {
        source: `
        local function f(x: number?)
            x = x or 5
            return x
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "f",
            equals: "(number?) -> number",
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
  },
  // TypeInfer.typestates.test.cpp:240 TEST_CASE_FIXTURE(TypeStateFixture, "local_assigned_in_either_branches_that_falls_through")
  {
    name: "local_assigned_in_either_branches_that_falls_through",
    fixture: "TypeStateFixture",
    checks: [
      {
        source: `
        local x = nil
        if math.random() > 0.5 then
            x = 5
        else
            x = "hello"
        end
        local y = x
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "y",
            equals: "number | string",
          }
        ],
      }
    ],
  },
  // TypeInfer.typestates.test.cpp:256 TEST_CASE_FIXTURE(TypeStateFixture, "local_assigned_in_only_one_branch_that_falls_through")
  {
    name: "local_assigned_in_only_one_branch_that_falls_through",
    fixture: "TypeStateFixture",
    checks: [
      {
        source: `
        local x = nil
        if math.random() > 0.5 then
            x = 5
        end
        local y = x
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "y",
            equals: "number?",
          }
        ],
      }
    ],
  },
  // TypeInfer.typestates.test.cpp:270 TEST_CASE_FIXTURE(TypeStateFixture, "then_branch_assigns_and_else_branch_also_assigns_but_is_met_with_return")
  {
    name: "then_branch_assigns_and_else_branch_also_assigns_but_is_met_with_return",
    fixture: "TypeStateFixture",
    checks: [
      {
        source: `
        local x = nil
        if math.random() > 0.5 then
            x = 5
        else
            x = "hello"
            return
        end
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
  // TypeInfer.typestates.test.cpp:287 TEST_CASE_FIXTURE(TypeStateFixture, "then_branch_assigns_but_is_met_with_return_and_else_branch_assigns")
  {
    name: "then_branch_assigns_but_is_met_with_return_and_else_branch_assigns",
    fixture: "TypeStateFixture",
    checks: [
      {
        source: `
        local x = nil
        if math.random() > 0.5 then
            x = 5
            return
        else
            x = "hello"
        end
        local y = x
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "y",
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.typestates.test.cpp:304 TEST_CASE_FIXTURE(TypeStateFixture, "invalidate_type_refinements_upon_assignments")
  {
    name: "invalidate_type_refinements_upon_assignments",
    fixture: "TypeStateFixture",
    checks: [
      {
        source: `
        type Ok<T> = { tag: "ok", val: T }
        type Err<E> = { tag: "err", err: E }
        type Result<T, E> = Ok<T> | Err<E>

        local function f<T, E>(res: Result<T, E>)
            assert(res.tag == "ok")
            local tag: "ok", val: T = res.tag, res.val
            res = { tag = "err" :: "err", err = (5 :: any) :: E }
            local tag: "err", err: E = res.tag, res.err
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
  // TypeInfer.typestates.test.cpp:323 TEST_CASE_FIXTURE(TypeStateFixture, "local_t_is_assigned_a_fresh_table_with_x_assigned_a_union_and_then_assert_restricts_actual_outflow_of_types")
  {
    name: "local_t_is_assigned_a_fresh_table_with_x_assigned_a_union_and_then_assert_restricts_actual_outflow_of_types",
    fixture: "TypeStateFixture",
    checks: [
      {
        source: `
        local t = nil

        if math.random() > 0.5 then
            t = {}
            t.x = if math.random() > 0.5 then 5 else "hello"
            assert(typeof(t.x) == "string")
        else
            t = {}
            t.x = if math.random() > 0.5 then 7 else true
            assert(typeof(t.x) == "boolean")
        end

        local x = t.x
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "x",
            equals: "boolean | number | number | string",
          }
        ],
      }
    ],
    skip: {
      disabledUpstream: true,
    },
  },
  // TypeInfer.typestates.test.cpp:347 TEST_CASE_FIXTURE(TypeStateFixture, "captured_locals_do_not_mutate_upvalue_type")
  {
    name: "captured_locals_do_not_mutate_upvalue_type",
    fixture: "TypeStateFixture",
    checks: [
      {
        source: `
        local x = nil

        function f()
            print(x)
            x = "five"
        end

        x = 5
        f()
    `,
        expect: [
          {
            errors: 1,
          },
          {
            error: 0,
            code: "TypeMismatch",
            fields: {
              wantedType: "number?",
            },
          },
          {
            error: 0,
            code: "TypeMismatch",
            fields: {
              givenType: "string",
            },
          },
          {
            typeAt: [4, 18],
            equals: "number?",
          }
        ],
      }
    ],
  },
  // TypeInfer.typestates.test.cpp:368 TEST_CASE_FIXTURE(TypeStateFixture, "captured_locals_do_not_mutate_upvalue_type_2")
  {
    name: "captured_locals_do_not_mutate_upvalue_type_2",
    fixture: "TypeStateFixture",
    checks: [
      {
        source: `
        local t = {x = nil}

        function f()
            print(t.x)
            t = {x = "five"}
        end

        t = {x = 5}
        f()
    `,
        expect: [
          {
            errors: 1,
          },
          {
            error: 0,
            code: "TypeMismatch",
            fields: {
              wantedType: "{ x: nil } | { x: number }",
            },
            fieldOptions: {
              wantedType: {
                exhaustive: true,
              },
            },
          },
          {
            error: 0,
            code: "TypeMismatch",
            fields: {
              givenType: "{ x: string }",
            },
          },
          {
            typeAt: [4, 18],
            options: {
              exhaustive: true,
            },
            equals: "{ x: nil } | { x: number }",
          },
          {
            typeAt: [4, 20],
            equals: "number?",
          }
        ],
      }
    ],
  },
  // TypeInfer.typestates.test.cpp:392 TEST_CASE_FIXTURE(TypeStateFixture, "prototyped_recursive_functions")
  {
    name: "prototyped_recursive_functions",
    fixture: "TypeStateFixture",
    checks: [
      {
        source: `
        local f
        function f()
            if math.random() > 0.5 then
                f()
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "f",
            equals: "(() -> ())?",
          }
        ],
      }
    ],
  },
  // TypeInfer.typestates.test.cpp:407 TEST_CASE_FIXTURE(BuiltinsFixture, "prototyped_recursive_functions_but_has_future_assignments")
  {
    name: "prototyped_recursive_functions_but_has_future_assignments",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local f
        function f()
            if math.random() > 0.5 then
                f()
            end
        end
        f = 5
    `,
        expect: [
          {
            errors: 1,
          },
          {
            type: "f",
            equals: "((() -> ()) | number)?",
          }
        ],
      }
    ],
  },
  // TypeInfer.typestates.test.cpp:428 TEST_CASE_FIXTURE(TypeStateFixture, "prototyped_recursive_functions_but_has_previous_assignments")
  {
    name: "prototyped_recursive_functions_but_has_previous_assignments",
    fixture: "TypeStateFixture",
    checks: [
      {
        source: `
        local f
        f = 5
        function f()
            if math.random() > 0.5 then
                f()
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "f",
            equals: "((() -> ()) | number)?",
          }
        ],
      }
    ],
  },
  // TypeInfer.typestates.test.cpp:444 TEST_CASE_FIXTURE(TypeStateFixture, "multiple_assignments_in_loops")
  {
    name: "multiple_assignments_in_loops",
    fixture: "TypeStateFixture",
    checks: [
      {
        source: `
        local x = nil

        for i = 1, 10 do
            x = 5
            x = "hello"
        end

        print(x)
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "x",
            equals: "(number | string)?",
          }
        ],
      }
    ],
  },
  // TypeInfer.typestates.test.cpp:461 TEST_CASE_FIXTURE(TypeStateFixture, "typestates_preserve_error_suppression")
  {
    name: "typestates_preserve_error_suppression",
    fixture: "TypeStateFixture",
    checks: [
      {
        source: `
        local a: any = 51
        a = "pickles" -- We'll have a new DefId for this iteration of \`a\`.  Its type must also be error-suppressing
        print(a)
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 14],
            options: {
              exhaustive: true,
            },
            equals: "*error-type* | string",
          }
        ],
      }
    ],
  },
  // TypeInfer.typestates.test.cpp:473 TEST_CASE_FIXTURE(BuiltinsFixture, "typestates_do_not_apply_to_the_initial_local_definition")
  {
    name: "typestates_do_not_apply_to_the_initial_local_definition",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        type MyType = number | string
        local foo: MyType = 5
        print(foo)
        foo = 7
        print(foo)
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [3, 14],
            options: {
              exhaustive: true,
            },
            equals: "number | string",
          },
          {
            typeAt: [5, 14],
            options: {
              exhaustive: true,
            },
            equals: "number",
          }
        ],
      }
    ],
  },
  // TypeInfer.typestates.test.cpp:492 TEST_CASE_FIXTURE(Fixture, "typestate_globals")
  {
    name: "typestate_globals",
    fixture: "Fixture",
    checks: [
      {
        source: `
        foo = "a"
        f(foo)
    `,
        expect: [
          {
            errors: 0,
          }
        ],
        definitions: [`
        declare foo: string | number
        declare function f(x: string): ()
    `],
      }
    ],
  },
  // TypeInfer.typestates.test.cpp:509 TEST_CASE_FIXTURE(Fixture, "typestate_unknown_global")
  {
    name: "typestate_unknown_global",
    fixture: "Fixture",
    checks: [
      {
        source: `
        x = 5
    `,
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
  },
  // TypeInfer.typestates.test.cpp:522 TEST_CASE_FIXTURE(BuiltinsFixture, "fuzzer_normalized_type_variables_are_bad" * doctest::timeout(LUAU_TIMEOUT))
  {
    name: "fuzzer_normalized_type_variables_are_bad",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local _
        while _[""] do
            _, _ = nil
            while _.n0 do
                _, _ = nil
            end
            _, _ = nil
        end
        while _[""] do
            while if _ then if _ then _ else "" else "" do
                _, _ = nil
                do
                end
                _, _, _ = nil
            end
            _, _ = nil
            _, _, _ = nil
            while _.readi16 do
                _, _ = nil
            end
            _, _ = nil
        end
    `,
        expect: [
          {
            errors: "some",
          }
        ],
        unparsed: {
          defect: 1372,
        },
      }
    ],
  },
  // TypeInfer.typestates.test.cpp:552 TEST_CASE_FIXTURE(BuiltinsFixture, "oss_1547_simple")
  {
    name: "oss_1547_simple",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local rand = 0

        function a()
            rand = (rand % 4) + 1;
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "rand",
          },
          {
            type: "rand",
            equals: "number",
          }
        ],
      }
    ],
  },
  // TypeInfer.typestates.test.cpp:567 TEST_CASE_FIXTURE(BuiltinsFixture, "oss_1547")
  {
    name: "oss_1547",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local rand = 0

        function a()
            rand = (rand % 4) + 1;
        end

        function b()
            rand = math.max(rand - 1, 0);
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "rand",
          },
          {
            type: "rand",
            equals: "number",
          }
        ],
      }
    ],
  },
  // TypeInfer.typestates.test.cpp:586 TEST_CASE_FIXTURE(Fixture, "modify_captured_table_field")
  {
    name: "modify_captured_table_field",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local state = { x = 0 }
        function incr()
            state.x = state.x + 1
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "state",
          },
          {
            type: "state",
            options: {
              exhaustive: true,
            },
            equals: "{ x: number }",
          }
        ],
      }
    ],
  },
  // TypeInfer.typestates.test.cpp:603 TEST_CASE_FIXTURE(Fixture, "oss_1561")
  {
    name: "oss_1561",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local targetVelocity: Vector3 = Vector3.new()
        function set2D(X: number, Y: number)
            targetVelocity = Vector3.new(X, Y, targetVelocity.Z)
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "set2D",
            equals: "(number, number) -> ()",
          }
        ],
        definitions: [`
        declare extern type Vector3 with
            X: number
            Y: number
            Z: number
        end

        declare Vector3: {
            new: (number?, number?, number?) -> Vector3
        }
    `],
      }
    ],
  },
  // TypeInfer.typestates.test.cpp:627 TEST_CASE_FIXTURE(Fixture, "oss_1575")
  {
    name: "oss_1575",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local flag = true
        local function Flip()
            flag = not flag
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
  // TypeInfer.typestates.test.cpp:637 TEST_CASE_FIXTURE(Fixture, "capture_upvalue_in_returned_function")
  {
    name: "capture_upvalue_in_returned_function",
    fixture: "Fixture",
    checks: [
      {
        source: `
        function def()
            local i : number = 0
            local function Counter()
                i = i + 1
                return i
            end
            return Counter
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            type: "def",
            equals: "() -> () -> number",
          }
        ],
        ignoreMissingAnnotations: true,
      }
    ],
  },
  // TypeInfer.typestates.test.cpp:654 TEST_CASE_FIXTURE(BuiltinsFixture, "throw_in_else_branch")
  {
    name: "throw_in_else_branch",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        --!strict
        local x
        local coinflip : () -> boolean = (nil :: any)

        if coinflip () then
            x = "I win."
        else
            error("You lose.")
        end

        print(x)
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [11, 14],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.typestates.test.cpp:675 TEST_CASE_FIXTURE(BuiltinsFixture, "throw_in_if_branch")
  {
    name: "throw_in_if_branch",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        --!strict
        local x
        local coinflip : () -> boolean = (nil :: any)

        if coinflip () then
            error("You lose.")
        else
            x = "I win."
        end

        print(x)
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [11, 14],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.typestates.test.cpp:697 TEST_CASE_FIXTURE(BuiltinsFixture, "refinement_through_erroring")
  {
    name: "refinement_through_erroring",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        --!strict
        type Payload = { payload: number }

        local function decode(s: string): Payload?
            return (nil :: any)
        end

        local function decodeEx(s: string): Payload
            local p = decode(s)
            if not p then
                error("failed to decode payload!!!")
            end
            return p
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
  // TypeInfer.typestates.test.cpp:719 TEST_CASE_FIXTURE(BuiltinsFixture, "refinement_through_erroring_in_loop")
  {
    name: "refinement_through_erroring_in_loop",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        --!strict

        local x = nil

        while math.random() > 0.5 do
            x = 42
            return
        end

        print(x)
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [10, 14],
            equals: "nil",
          }
        ],
      }
    ],
  },
  // TypeInfer.typestates.test.cpp:740 TEST_CASE_FIXTURE(BuiltinsFixture, "type_refinement_in_loop")
  {
    name: "type_refinement_in_loop",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        --!strict
        local function onEachString(t: { string | number })
            for _, v in t do
                if type(v) ~= "string" then
                    continue
                end
                print(v)
            end
        end
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [4, 24],
            equals: "number | string",
          },
          {
            typeAt: [7, 22],
            equals: "string",
          }
        ],
      }
    ],
  },
  // TypeInfer.typestates.test.cpp:760 TEST_CASE_FIXTURE(BuiltinsFixture, "throw_in_if_branch_and_do_nothing_in_else")
  {
    name: "throw_in_if_branch_and_do_nothing_in_else",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        --!strict
        local x
        local coinflip : () -> boolean = (nil :: any)

        if coinflip () then
            error("You lose.")
        else
        end

        print(x)
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [10, 14],
            equals: "nil",
          }
        ],
      }
    ],
  },
  // TypeInfer.typestates.test.cpp:782 TEST_CASE_FIXTURE(BuiltinsFixture, "assign_in_an_if_branch_without_else")
  {
    name: "assign_in_an_if_branch_without_else",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        --!strict
        local x
        local coinflip : () -> boolean = (nil :: any)

        if coinflip () then
            x = "I win."
        end

        print(x)
    `,
        expect: [
          {
            errors: 0,
          },
          {
            typeAt: [9, 14],
            equals: "string?",
          }
        ],
      }
    ],
  },
  // TypeInfer.typestates.test.cpp:803 TEST_CASE_FIXTURE(BuiltinsFixture, "fuzzer_table_freeze_in_binary_expr")
  {
    name: "fuzzer_table_freeze_in_binary_expr",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local _
        if _ or table.freeze(_,_) or table.freeze(_,_) then
        end
    `,
        expect: [
          {
            errors: 4,
          },
          {
            error: 0,
            code: "TypeMismatch",
          },
          {
            error: 0,
            code: "TypeMismatch",
            fields: {
              givenType: "nil",
            },
          },
          {
            error: 0,
            code: "TypeMismatch",
            fields: {
              wantedType: "table",
            },
          },
          {
            error: 1,
            code: "CountMismatch",
          },
          {
            error: 1,
            code: "CountMismatch",
            fields: {
              expected: 1,
            },
          },
          {
            error: 1,
            code: "CountMismatch",
            fields: {
              actual: 2,
            },
          },
          {
            error: 0,
            code: "TypeMismatch",
          },
          {
            error: 0,
            code: "TypeMismatch",
            fields: {
              givenType: "nil",
            },
          },
          {
            error: 0,
            code: "TypeMismatch",
            fields: {
              wantedType: "table",
            },
          },
          {
            error: 1,
            code: "CountMismatch",
          },
          {
            error: 1,
            code: "CountMismatch",
            fields: {
              expected: 1,
            },
          },
          {
            error: 1,
            code: "CountMismatch",
            fields: {
              actual: 2,
            },
          }
        ],
      }
    ],
  },
  // TypeInfer.typestates.test.cpp:832 TEST_CASE_FIXTURE(BuiltinsFixture, "table_freeze_in_conditional")
  {
    name: "table_freeze_in_conditional",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local t = { x = 42 }
        if math.random() > 0.5 and table.freeze(t) then
        end
        t.y = 13
    `,
        expect: [
          {
            errors: 0,
          }
        ],
      }
    ],
  },
  // TypeInfer.typestates.test.cpp:847 TEST_CASE_FIXTURE(BuiltinsFixture, "fuzzer_table_freeze_in_conditional_expr")
  {
    name: "fuzzer_table_freeze_in_conditional_expr",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local _
        if
            if table.freeze(_,_) then _ else _
        then
        end
    `,
        expect: [
          {
            errors: 2,
          },
          {
            error: 0,
            code: "TypeMismatch",
          },
          {
            error: 0,
            code: "TypeMismatch",
            fields: {
              givenType: "nil",
            },
          },
          {
            error: 0,
            code: "TypeMismatch",
            fields: {
              wantedType: "table",
            },
          },
          {
            error: 1,
            code: "CountMismatch",
          },
          {
            error: 1,
            code: "CountMismatch",
            fields: {
              expected: 1,
            },
          },
          {
            error: 1,
            code: "CountMismatch",
            fields: {
              actual: 2,
            },
          }
        ],
      }
    ],
  },
  // TypeInfer.typestates.test.cpp:870 TEST_CASE_FIXTURE(BuiltinsFixture, "setmetatable_depends_on_sub_expression")
  {
    name: "setmetatable_depends_on_sub_expression",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        type AB = setmetatable<{ foo: number }, { bar: number }>

        local function takes(tbl: AB, _: unknown): ()
        end

        local function sends(tbl: { foo: number }): ()
            takes(tbl, setmetatable(tbl, { bar = 3 }))
        end
    `,
        expect: [
          {
            error: 0,
            code: "TypeMismatch",
          },
          {
            error: 0,
            code: "TypeMismatch",
            fields: {
              wantedType: "setmetatable<{ foo: number }, { bar: number }>",
            },
            fieldOptions: {
              wantedType: {
                exhaustive: true,
              },
            },
          },
          {
            error: 0,
            code: "TypeMismatch",
            fields: {
              givenType: "{ foo: number }",
            },
            fieldOptions: {
              givenType: {
                exhaustive: true,
              },
            },
          }
        ],
      }
    ],
  },
];

portUpstreamFile("TypeInfer.typestates.test.cpp", cases);
