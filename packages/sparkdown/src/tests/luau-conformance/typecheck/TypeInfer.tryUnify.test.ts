// Luau's type-checker tests from `tests/TypeInfer.tryUnify.test.cpp` at the
// commit pinned in `../upstream/typecheck-cases.json`, ported as `README.md`
// describes. Each case names its upstream line.

import { NEW_SOLVER_GUARD_REASON, portUpstreamFile } from "./portedCases";

portUpstreamFile("TypeInfer.tryUnify.test.cpp", [
  {
    // TypeInfer.tryUnify.test.cpp:28 TEST_CASE_FIXTURE(TryUnifyFixture, "primitives_unify")
    name: "primitives_unify",
    fixture: "TryUnifyFixture",
    skip: { notApplicable: "a unit test of the old solver's Unifier on types built in C++, with no Luau source to check" },
    checks: [],
  },
  {
    // TypeInfer.tryUnify.test.cpp:39 TEST_CASE_FIXTURE(TryUnifyFixture, "compatible_functions_are_unified")
    name: "compatible_functions_are_unified",
    fixture: "TryUnifyFixture",
    skip: { notApplicable: "a unit test of the old solver's Unifier on types built in C++, with no Luau source to check" },
    checks: [],
  },
  {
    // TypeInfer.tryUnify.test.cpp:59 TEST_CASE_FIXTURE(TryUnifyFixture, "incompatible_functions_are_preserved")
    name: "incompatible_functions_are_preserved",
    fixture: "TryUnifyFixture",
    skip: { notApplicable: "a unit test of the old solver's Unifier on types built in C++, with no Luau source to check" },
    checks: [],
  },
  {
    // TypeInfer.tryUnify.test.cpp:83 TEST_CASE_FIXTURE(TryUnifyFixture, "tables_can_be_unified")
    name: "tables_can_be_unified",
    fixture: "TryUnifyFixture",
    skip: { notApplicable: "a unit test of the old solver's Unifier on types built in C++, with no Luau source to check" },
    checks: [],
  },
  {
    // TypeInfer.tryUnify.test.cpp:108 TEST_CASE_FIXTURE(TryUnifyFixture, "incompatible_tables_are_preserved")
    name: "incompatible_tables_are_preserved",
    fixture: "TryUnifyFixture",
    skip: { notApplicable: "a unit test of the old solver's Unifier on types built in C++, with no Luau source to check" },
    checks: [],
  },
  {
    // TypeInfer.tryUnify.test.cpp:141 TEST_CASE_FIXTURE(Fixture, "uninhabited_intersection_sub_never")
    name: "uninhabited_intersection_sub_never",
    fixture: "Fixture",
    source: `
        function f(arg : string & number) : never
          return arg
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tryUnify.test.cpp:151 TEST_CASE_FIXTURE(Fixture, "uninhabited_intersection_sub_anything")
    name: "uninhabited_intersection_sub_anything",
    fixture: "Fixture",
    source: `
        function f(arg : string & number) : boolean
          return arg
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tryUnify.test.cpp:161 TEST_CASE_FIXTURE(Fixture, "uninhabited_table_sub_never")
    name: "uninhabited_table_sub_never",
    fixture: "Fixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        function f(arg : { prop : string & number }) : never
          return arg
        end
    `,
    expect: [],
  },
  {
    // TypeInfer.tryUnify.test.cpp:173 TEST_CASE_FIXTURE(Fixture, "uninhabited_table_sub_anything")
    name: "uninhabited_table_sub_anything",
    fixture: "Fixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        function f(arg : { prop : string & number }) : boolean
          return arg
        end
    `,
    expect: [],
  },
  {
    // TypeInfer.tryUnify.test.cpp:185 TEST_CASE_FIXTURE(Fixture, "members_of_failed_typepack_unification_are_unified_with_errorType")
    name: "members_of_failed_typepack_unification_are_unified_with_errorType",
    fixture: "Fixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        function f(arg: number) end
        local a
        local b
        f(a, b)
    `,
    expect: [],
  },
  {
    // TypeInfer.tryUnify.test.cpp:202 TEST_CASE_FIXTURE(Fixture, "result_of_failed_typepack_unification_is_constrained")
    name: "result_of_failed_typepack_unification_is_constrained",
    fixture: "Fixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        function f(arg: number) return arg end
        local a
        local b
        local c = f(a, b)
    `,
    expect: [],
  },
  {
    // TypeInfer.tryUnify.test.cpp:220 TEST_CASE_FIXTURE(Fixture, "typepack_unification_should_trim_free_tails")
    name: "typepack_unification_should_trim_free_tails",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        --!strict
        local function f(v: number)
            if v % 2 == 0 then
                return true
            end
        end

        return function()
            return (f(1))
        end
    `,
    expect: [{ errors: 1 }, { type: "f", equals: "(number) -> boolean" }],
  },
  {
    // TypeInfer.tryUnify.test.cpp:240 TEST_CASE_FIXTURE(TryUnifyFixture, "variadic_type_pack_unification")
    name: "variadic_type_pack_unification",
    fixture: "TryUnifyFixture",
    skip: { notApplicable: "a unit test of the old solver's Unifier on types built in C++, with no Luau source to check" },
    checks: [],
  },
  {
    // TypeInfer.tryUnify.test.cpp:250 TEST_CASE_FIXTURE(TryUnifyFixture, "variadic_tails_respect_progress")
    name: "variadic_tails_respect_progress",
    fixture: "TryUnifyFixture",
    skip: { notApplicable: "a unit test of the old solver's Unifier on types built in C++, with no Luau source to check" },
    checks: [],
  },
  {
    // TypeInfer.tryUnify.test.cpp:261 TEST_CASE_FIXTURE(Fixture, "variadics_should_use_reversed_properly")
    name: "variadics_should_use_reversed_properly",
    fixture: "Fixture",
    unparsed: { defect: 876 }, // a variadic type written ...T, or T... inside << >>
    source: `
        --!strict
        local function f<T>(...: T): ...T
            return ...
        end

        local x: string = f(1)
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "TypeMismatch", fields: { givenType: "number", wantedType: "string" } },
    ],
  },
  {
    // TypeInfer.tryUnify.test.cpp:279 TEST_CASE_FIXTURE(BuiltinsFixture, "cli_41095_concat_log_in_sealed_table_unification")
    // Upstream also checks that the second error belongs to the module named
    // MainModule, the name its fixture gives the checked source.
    name: "cli_41095_concat_log_in_sealed_table_unification",
    fixture: "BuiltinsFixture",
    source: `
        --!strict
        table.insert()
    `,
    expect: [
      { errors: 2 },
      { error: 0, message: "No overload for function accepts 0 arguments." },
      { error: 1, message: "Available overloads: <V>({V}, V) -> (); and <V>({V}, number, V) -> ()" },
    ],
  },
  {
    // TypeInfer.tryUnify.test.cpp:296 TEST_CASE_FIXTURE(TryUnifyFixture, "free_tail_is_grown_properly")
    name: "free_tail_is_grown_properly",
    fixture: "TryUnifyFixture",
    skip: { notApplicable: "a unit test of the old solver's Unifier on types built in C++, with no Luau source to check" },
    checks: [],
  },
  {
    // TypeInfer.tryUnify.test.cpp:306 TEST_CASE_FIXTURE(TryUnifyFixture, "recursive_metatable_getmatchtag")
    name: "recursive_metatable_getmatchtag",
    fixture: "TryUnifyFixture",
    skip: { notApplicable: "a unit test of the old solver's Unifier on types built in C++, with no Luau source to check" },
    checks: [],
  },
  {
    // TypeInfer.tryUnify.test.cpp:317 TEST_CASE_FIXTURE(TryUnifyFixture, "cli_50320_follow_in_any_unification")
    name: "cli_50320_follow_in_any_unification",
    fixture: "TryUnifyFixture",
    skip: { notApplicable: "a unit test of the old solver's Unifier on types built in C++, with no Luau source to check" },
    checks: [],
  },
  {
    // TypeInfer.tryUnify.test.cpp:329 TEST_CASE_FIXTURE(TryUnifyFixture, "txnlog_preserves_type_owner")
    name: "txnlog_preserves_type_owner",
    fixture: "TryUnifyFixture",
    skip: { notApplicable: "a unit test of the old solver's Unifier on types built in C++, with no Luau source to check" },
    checks: [],
  },
  {
    // TypeInfer.tryUnify.test.cpp:340 TEST_CASE_FIXTURE(TryUnifyFixture, "txnlog_preserves_pack_owner")
    name: "txnlog_preserves_pack_owner",
    fixture: "TryUnifyFixture",
    skip: { notApplicable: "a unit test of the old solver's Unifier on types built in C++, with no Luau source to check" },
    checks: [],
  },
  {
    // TypeInfer.tryUnify.test.cpp:351 TEST_CASE_FIXTURE(TryUnifyFixture, "fuzz_tail_unification_issue")
    name: "fuzz_tail_unification_issue",
    fixture: "TryUnifyFixture",
    skip: { notApplicable: "a unit test of the old solver's Unifier on types built in C++, with no Luau source to check" },
    checks: [],
  },
  {
    // TypeInfer.tryUnify.test.cpp:364 TEST_CASE_FIXTURE(BuiltinsFixture, "fuzz_unify_any_should_check_log")
    name: "fuzz_unify_any_should_check_log",
    fixture: "BuiltinsFixture",
    source: `
repeat
_._,_ = nil
until _
local l0:(any)&(typeof(_)),l0:(any)|(any) = _,_
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.tryUnify.test.cpp:376 TEST_CASE_FIXTURE(BuiltinsFixture, "table_unification_full_restart_recursion")
    name: "table_unification_full_restart_recursion",
    fixture: "BuiltinsFixture",
    source: `
local A, B, C, D

E = function(a, b)
    local mt = getmetatable(b)
    if mt.tm:bar(A) == nil and mt.tm:bar(B) == nil then end
    if mt.foo == true then D(b, 3) end
    mt.foo:call(false, b)
end

A = function(a, b)
    local mt = getmetatable(b)
    if mt.foo == true then D(b, 3) end
    C(mt, 3)
end

B = function(a, b)
    local mt = getmetatable(b)
    if mt.foo == true then D(b, 3) end
    C(mt, 3)
end
    `,
    expect: [{ errors: "some" }],
  },
]);
