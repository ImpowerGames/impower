import { NEW_SOLVER_GUARD_REASON, portUpstreamFile } from "./portedCases";

portUpstreamFile("TypeInfer.tryUnify.test.cpp", [
  {
    name: "primitives_unify",
    fixture: "TryUnifyFixture",
    skip: { notApplicable: "a unit test of the old solver's Unifier on types built in C++, with no Luau source to check" },
    checks: [],
  },
  {
    name: "compatible_functions_are_unified",
    fixture: "TryUnifyFixture",
    skip: { notApplicable: "a unit test of the old solver's Unifier on types built in C++, with no Luau source to check" },
    checks: [],
  },
  {
    name: "incompatible_functions_are_preserved",
    fixture: "TryUnifyFixture",
    skip: { notApplicable: "a unit test of the old solver's Unifier on types built in C++, with no Luau source to check" },
    checks: [],
  },
  {
    name: "tables_can_be_unified",
    fixture: "TryUnifyFixture",
    skip: { notApplicable: "a unit test of the old solver's Unifier on types built in C++, with no Luau source to check" },
    checks: [],
  },
  {
    name: "incompatible_tables_are_preserved",
    fixture: "TryUnifyFixture",
    skip: { notApplicable: "a unit test of the old solver's Unifier on types built in C++, with no Luau source to check" },
    checks: [],
  },
  {
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
    name: "variadic_type_pack_unification",
    fixture: "TryUnifyFixture",
    skip: { notApplicable: "a unit test of the old solver's Unifier on types built in C++, with no Luau source to check" },
    checks: [],
  },
  {
    name: "variadic_tails_respect_progress",
    fixture: "TryUnifyFixture",
    skip: { notApplicable: "a unit test of the old solver's Unifier on types built in C++, with no Luau source to check" },
    checks: [],
  },
  {
    name: "variadics_should_use_reversed_properly",
    fixture: "Fixture",
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
    name: "free_tail_is_grown_properly",
    fixture: "TryUnifyFixture",
    skip: { notApplicable: "a unit test of the old solver's Unifier on types built in C++, with no Luau source to check" },
    checks: [],
  },
  {
    name: "recursive_metatable_getmatchtag",
    fixture: "TryUnifyFixture",
    skip: { notApplicable: "a unit test of the old solver's Unifier on types built in C++, with no Luau source to check" },
    checks: [],
  },
  {
    name: "cli_50320_follow_in_any_unification",
    fixture: "TryUnifyFixture",
    skip: { notApplicable: "a unit test of the old solver's Unifier on types built in C++, with no Luau source to check" },
    checks: [],
  },
  {
    name: "txnlog_preserves_type_owner",
    fixture: "TryUnifyFixture",
    skip: { notApplicable: "a unit test of the old solver's Unifier on types built in C++, with no Luau source to check" },
    checks: [],
  },
  {
    name: "txnlog_preserves_pack_owner",
    fixture: "TryUnifyFixture",
    skip: { notApplicable: "a unit test of the old solver's Unifier on types built in C++, with no Luau source to check" },
    checks: [],
  },
  {
    name: "fuzz_tail_unification_issue",
    fixture: "TryUnifyFixture",
    skip: { notApplicable: "a unit test of the old solver's Unifier on types built in C++, with no Luau source to check" },
    checks: [],
  },
  {
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
