// Luau's type-checker tests from `tests/TypeInfer.test.cpp` at the
// commit pinned in `../upstream/typecheck-cases.json`, ported as `README.md`
// describes. Each case names its upstream line.

import { NEW_SOLVER_GUARD_REASON, portUpstreamFile } from "./portedCases";

portUpstreamFile("TypeInfer.test.cpp", [
  {
    // TypeInfer.test.cpp:40 TEST_CASE_FIXTURE(Fixture, "tc_hello_world")
    name: "tc_hello_world",
    fixture: "Fixture",
    source: `local a = 7`,
    expect: [{ errors: 0 }, { type: "a", equals: "number" }],
  },
  {
    // TypeInfer.test.cpp:48 TEST_CASE_FIXTURE(Fixture, "tc_propagation")
    // Upstream checks that `b` is the primitive type `number`.
    name: "tc_propagation",
    fixture: "Fixture",
    source: `local a = 7   local b = a`,
    expect: [{ errors: 0 }, { type: "b", equals: "number" }],
  },
  {
    // TypeInfer.test.cpp:57 TEST_CASE_FIXTURE(Fixture, "tc_error")
    name: "tc_error",
    fixture: "Fixture",
    source: `local a = 7   local b = 'hi'   a = b`,
    expect: [{ errors: 0 }, { type: "a", equals: "number | string" }],
  },
  {
    // TypeInfer.test.cpp:77 TEST_CASE_FIXTURE(Fixture, "tc_error_2")
    name: "tc_error_2",
    fixture: "Fixture",
    source: `local a = 7   a = 'hi'`,
    expect: [{ errors: 0 }, { type: "a", equals: "number | string" }],
  },
  {
    // TypeInfer.test.cpp:103 TEST_CASE_FIXTURE(Fixture, "infer_locals_with_nil_value")
    name: "infer_locals_with_nil_value",
    fixture: "Fixture",
    unparsed: { defect: 919 }, // a ; right after the value of a local
    source: `local f = nil; f = 'hello world'`,
    expect: [{ errors: 0 }, { type: "f", equals: "string?" }],
  },
  {
    // TypeInfer.test.cpp:119 TEST_CASE_FIXTURE(Fixture, "infer_locals_with_nil_value_2")
    name: "infer_locals_with_nil_value_2",
    fixture: "Fixture",
    source: `
        local a = 2
        local b = a,nil
    `,
    expect: [{ errors: 0 }, { type: "a", equals: "number" }, { type: "b", equals: "number" }],
  },
  {
    // TypeInfer.test.cpp:131 TEST_CASE_FIXTURE(Fixture, "infer_locals_via_assignment_from_its_call_site")
    name: "infer_locals_via_assignment_from_its_call_site",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        local a
        function f(x) a = x end
        f(1)
        f("foo")
    `,
    expect: [
      { type: "a", equals: "unknown" },
      { type: "f", equals: "(unknown) -> ()" },
      { errors: 0 },
    ],
  },
  {
    // TypeInfer.test.cpp:157 TEST_CASE_FIXTURE(Fixture, "infer_in_nocheck_mode")
    name: "infer_in_nocheck_mode",
    fixture: "Fixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        --!nocheck
        function f(x)
            return x
        end
         -- we get type information even if there's type errors
        f(1, 2)
    `,
    expect: [],
  },
  {
    // TypeInfer.test.cpp:175 TEST_CASE_FIXTURE(Fixture, "obvious_type_error_in_nocheck_mode")
    name: "obvious_type_error_in_nocheck_mode",
    fixture: "Fixture",
    source: `
        --!nocheck
        local x: string = 5
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:185 TEST_CASE_FIXTURE(Fixture, "expr_statement")
    name: "expr_statement",
    fixture: "Fixture",
    source: `local foo = 5    foo()`,
    expect: [{ errors: 1 }],
  },
  {
    // TypeInfer.test.cpp:191 TEST_CASE_FIXTURE(Fixture, "if_statement")
    name: "if_statement",
    fixture: "Fixture",
    source: `
        local a
        local b

        if true then
            a = 'hello'
        else
            b = 999
        end
    `,
    expect: [{ errors: 0 }, { type: "a", equals: "string?" }, { type: "b", equals: "number?" }],
  },
  {
    // TypeInfer.test.cpp:218 TEST_CASE_FIXTURE(Fixture, "statements_are_topologically_sorted")
    name: "statements_are_topologically_sorted",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        function foo()
            return bar(999), bar("hi")
        end

        function bar(i)
            return i
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:236 TEST_CASE_FIXTURE(Fixture, "unify_nearly_identical_recursive_types")
    name: "unify_nearly_identical_recursive_types",
    fixture: "Fixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        local o
        o:method()

        local p
        p:method()

        o = p
    `,
    expect: [],
  },
  {
    // TypeInfer.test.cpp:253 TEST_CASE_FIXTURE(BuiltinsFixture, "warn_on_lowercase_parent_property")
    name: "warn_on_lowercase_parent_property",
    fixture: "BuiltinsFixture",
    unparsed: { defect: 879 }, // a call to require
    source: `
        local M = require(script.parent.DoesNotMatter)
    `,
    expect: [{ errors: 1 }, { error: 0, code: "DeprecatedApiUsed", fields: { symbol: "parent" } }],
  },
  {
    // TypeInfer.test.cpp:267 TEST_CASE_FIXTURE(BuiltinsFixture, "weird_case")
    name: "weird_case",
    fixture: "BuiltinsFixture",
    ignoreMissingAnnotations: true,
    source: `
        local function f() return 4 end
        local d = math.deg(f())
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:279 TEST_CASE_FIXTURE(Fixture, "dont_ice_when_failing_the_occurs_check")
    name: "dont_ice_when_failing_the_occurs_check",
    fixture: "Fixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        --!strict
        local s
        s(s, 'a')
    `,
    expect: [],
  },
  {
    // TypeInfer.test.cpp:291 TEST_CASE_FIXTURE(Fixture, "occurs_check_does_not_recurse_forever_if_asked_to_traverse_a_cyclic_type")
    name: "occurs_check_does_not_recurse_forever_if_asked_to_traverse_a_cyclic_type",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
         --!strict
        function u(t, w)
            u(u, t)
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:305 TEST_CASE_FIXTURE(Fixture, "crazy_complexity")
    name: "crazy_complexity",
    fixture: "Fixture",
    source: `
        --!nonstrict
        A:A():A():A():A():A():A():A():A():A():A():A()
    `,
    expect: [],
  },
  {
    // TypeInfer.test.cpp:313 TEST_CASE_FIXTURE(Fixture, "type_errors_infer_types")
    name: "type_errors_infer_types",
    fixture: "Fixture",
    source: `
        local err = (true).x
        local c = err.Parent.Reward.GetChildren
        local d = err.Parent.Reward
        local e = err.Parent
        local f = err
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "UnknownProperty", fields: { table: "boolean", key: "x" } },
    ],
  },
  {
    // TypeInfer.test.cpp:340 TEST_CASE_FIXTURE(Fixture, "should_be_able_to_infer_this_without_stack_overflowing")
    name: "should_be_able_to_infer_this_without_stack_overflowing",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        local function f(x, y)
            return x or y
        end

        local function dont_crash(x, y)
            local z: typeof(f(x, y)) = f(x, y)
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:357 TEST_CASE_FIXTURE(Fixture, "exponential_blowup_from_copying_types")
    // Upstream also checks that the module's interface holds at most 13 types,
    // which measures Luau's own copying of types.
    name: "exponential_blowup_from_copying_types",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        --!strict
        -- An example of exponential blowup in number of types
        -- The problem is that if we define function f(a) return x end
        -- then this has type <t>(t)->T where x:T
        -- *but* it copies T each time f is applied
        -- so { left = f("hi"), right = f(5) }
        -- has type { left : T_L, right : T_R }
        -- where T_L and T_R are copies of T.
        -- x0 : T0 where T0 = {}
        local x0 = {}
        -- f0 : <t>(t)->T0
        local function f0(a) return x0 end
        -- x1 : T1 where T1 = { left : T0_L, right : T0_R }
        local x1 = { left = f0("hi"), right = f0(5) }
        -- f1 : <t>(t)->T1
        local function f1(a) return x1 end
        -- x2 : T2 where T2 = { left : T1_L, right : T1_R }
        local x2 = { left = f1("hi"), right = f1(5) }
        -- f2 : <t>(t)->T2
        local function f2(a) return x2 end
        -- etc etc
        local x3 = { left = f2("hi"), right = f2(5) }
        local function f3(a) return x3 end
        local x4 = { left = f3("hi"), right = f3(5) }
        return x4
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:399 TEST_CASE_FIXTURE(Fixture, "check_type_infer_recursion_count")
    // The source repeats `{a=` and `}` 600 times, upstream's limit for an
    // optimized build without sanitizers.
    name: "check_type_infer_recursion_count",
    fixture: "Fixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: "function f() return " + "{a=".repeat(600) + "'a'" + "}".repeat(600) + " end",
    expect: [],
  },
  {
    // TypeInfer.test.cpp:419 TEST_CASE_FIXTURE(Fixture, "check_block_recursion_limit")
    // The source nests 595 do blocks, upstream's limit for an optimized build
    // without sanitizers. Upstream lowers Luau's recursion limits (the parser's
    // to 1190, and the solvers' and subtyping's to 495) with ScopedFastInt for
    // the case.
    name: "check_block_recursion_limit",
    fixture: "Fixture",
    source: "do ".repeat(595) + "local a = 1" + " end".repeat(595),
    expect: [{ errors: 1 }, { error: 0, code: "CodeTooComplex" }],
  },
  {
    // TypeInfer.test.cpp:452 TEST_CASE_FIXTURE(Fixture, "check_expr_recursion_limit")
    // The source chains 500 calls to lower, upstream's limit for an optimized
    // build without sanitizers. Upstream lowers Luau's recursion limits (the
    // parser's to 1000, and the solvers' and subtyping's to 400) with
    // ScopedFastInt for the case.
    name: "check_expr_recursion_limit",
    fixture: "Fixture",
    source: '("foo")' + ":lower()".repeat(500),
    expect: [{ errors: 1 }, { error: 0, code: "CodeTooComplex" }],
  },
  {
    // TypeInfer.test.cpp:482 TEST_CASE_FIXTURE(Fixture, "globals")
    name: "globals",
    fixture: "Fixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        --!nonstrict
        foo = true
        foo = "now i'm a string!"
    `,
    expect: [],
  },
  {
    // TypeInfer.test.cpp:497 TEST_CASE_FIXTURE(Fixture, "globals2")
    name: "globals2",
    fixture: "Fixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        --!nonstrict
        foo = function() return 1 end
        foo = "now i'm a string!"
    `,
    expect: [],
  },
  {
    // TypeInfer.test.cpp:516 TEST_CASE_FIXTURE(Fixture, "globals_are_banned_in_strict_mode")
    name: "globals_are_banned_in_strict_mode",
    fixture: "Fixture",
    source: `
        --!strict
        foo = true
    `,
    expect: [{ errors: 1 }, { error: 0, code: "UnknownSymbol", fields: { name: "foo" } }],
  },
  {
    // TypeInfer.test.cpp:530 TEST_CASE_FIXTURE(Fixture, "correctly_scope_locals_do")
    name: "correctly_scope_locals_do",
    fixture: "Fixture",
    source: `
        do
            local a = 1
        end

        local b = a -- oops!
    `,
    expect: [{ errors: 1 }, { error: 0, code: "UnknownSymbol", fields: { name: "a" } }],
  },
  {
    // TypeInfer.test.cpp:547 TEST_CASE_FIXTURE(Fixture, "checking_should_not_ice")
    name: "checking_should_not_ice",
    fixture: "Fixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        --!nonstrict
        f,g = ...
        f(g(...))[...] = nil
        f,xpcall = ...
        local value = g(...)(g(...))
    `,
    expect: [],
  },
  {
    // TypeInfer.test.cpp:562 TEST_CASE_FIXTURE(Fixture, "cyclic_follow")
    name: "cyclic_follow",
    fixture: "Fixture",
    source: `
--!nonstrict
l0,table,_,_,_ = ...
_,_,_,_.time(...)._.n0,l0,_ = function(l0)
end,_.__index,(_),_.time(_.n0 or _,...)
for l0=...,_,"" do
end
_ += not _
do end
`,
    expect: [],
  },
  {
    // TypeInfer.test.cpp:576 TEST_CASE_FIXTURE(Fixture, "cyclic_follow_2")
    name: "cyclic_follow_2",
    fixture: "Fixture",
    source: `
--!nonstrict
n13,_,table,_,l0,_,_ = ...
_,n0[(_)],_,_._(...)._.n39,l0,_._ = function(l84,...)
end,_.__index,"",_,l0._(nil)
for l0=...,table.n5,_ do
end
_:_(...).n1 /= _
do
_(_ + _)
do end
end
`,
    expect: [],
  },
  {
    // TypeInfer.test.cpp:621 TEST_CASE_FIXTURE(Fixture, "tc_after_error_recovery")
    // Upstream checks that `a` is the primitive type `number`. Luau rejects the
    // snippet (`local x =` has no value); Sparkdown reads it without complaint,
    // so the error is left to the checker.
    name: "tc_after_error_recovery",
    fixture: "Fixture",
    source: `
        local x =
        local a = 7
    `,
    expect: [{ errors: "some" }, { type: "a", equals: "number" }],
  },
  {
    // TypeInfer.test.cpp:634 TEST_CASE_FIXTURE(Fixture, "tc_after_error_recovery_no_assert")
    // Luau rejects the snippet (`function +()` has no name); Sparkdown reads it
    // without complaint, so the error is left to the checker.
    name: "tc_after_error_recovery_no_assert",
    fixture: "Fixture",
    source: `function +() local _ = true end`,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.test.cpp:640 TEST_CASE_FIXTURE(BuiltinsFixture, "tc_after_error_recovery_no_replacement_name_in_error")
    // Luau rejects the fourth snippet's nameless local functions too; Sparkdown
    // reads them without complaint, so their errors are left to the checker.
    name: "tc_after_error_recovery_no_replacement_name_in_error",
    fixture: "BuiltinsFixture",
    checks: [
      {
        malformed: "`return t.` has no name after the dot",
        doesNotPassNewSolver: true,
        source: `
            --!strict
            local t = { x = 10, y = 20 }
            return t.
        `,
        expect: [],
      },
      {
        malformed: "`export type = number` has no name for the type",
        source: `
            --!strict
            export type = number
            export type = string
        `,
        expect: [{ errors: 2 }],
      },
      {
        malformed: "`function string.()` has no name after the dot",
        doesNotPassNewSolver: true,
        source: `
            --!strict
            function string.() end
        `,
        expect: [],
      },
      {
        source: `
            --!strict
            local function () end
            local function () end
        `,
        expect: [{ errors: 2 }],
      },
      {
        malformed: "`function dm.()` has no name after the dot",
        source: `
            --!strict
            local dm = {}
            function dm.() end
            function dm.() end
        `,
        expect: [{ errors: 2 }],
      },
    ],
  },
  {
    // TypeInfer.test.cpp:700 TEST_CASE_FIXTURE(BuiltinsFixture, "invalide_deprecated_attribute_doesn't_chrash_checker")
    name: "invalide_deprecated_attribute_doesn't_chrash_checker",
    fixture: "BuiltinsFixture",
    unparsed: { defect: 921 }, // an attribute written @[...]
    source: `
@[deprecated{ reason = reasonString }]
function hello(x: number, y: number): number
    return x + y
end`,
    expect: [{ errors: 2 }],
  },
  {
    // TypeInfer.test.cpp:711 TEST_CASE_FIXTURE(BuiltinsFixture, "index_expr_should_be_checked")
    name: "index_expr_should_be_checked",
    fixture: "BuiltinsFixture",
    source: `
        local foo: any

        print(foo[(true).x])
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "UnknownProperty", fields: { table: "boolean", key: "x" } },
    ],
  },
  {
    // TypeInfer.test.cpp:727 TEST_CASE_FIXTURE(Fixture, "stringify_nested_unions_with_optionals")
    // Upstream compares the wanted type with the builtin `number` type itself,
    // which prints as `number`.
    name: "stringify_nested_unions_with_optionals",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        --!strict
        local a: number | (string | boolean) | nil
        local b: number = a
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "TypeMismatch", fields: { wantedType: "number", givenType: "(boolean | number | string)?" } },
    ],
  },
  {
    // TypeInfer.test.cpp:742 TEST_CASE_FIXTURE(Fixture, "cli_39932_use_unifier_in_ensure_methods")
    name: "cli_39932_use_unifier_in_ensure_methods",
    fixture: "Fixture",
    source: `
        local x: {number|number} = {1, 2, 3}
        local y = x[1] - x[2]
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:752 TEST_CASE_FIXTURE(Fixture, "dont_report_type_errors_within_an_AstStatError")
    // Luau rejects the snippet (a bare `foo` is not a statement); Sparkdown
    // reads it without complaint, so the error is left to the checker.
    name: "dont_report_type_errors_within_an_AstStatError",
    fixture: "Fixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        foo
    `,
    expect: [],
  },
  {
    // TypeInfer.test.cpp:763 TEST_CASE_FIXTURE(Fixture, "dont_report_type_errors_within_an_AstExprError")
    name: "dont_report_type_errors_within_an_AstExprError",
    fixture: "Fixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    malformed: "`foo:` has no method name after the colon",
    source: `
        local a = foo:
    `,
    expect: [],
  },
  {
    // TypeInfer.test.cpp:774 TEST_CASE_FIXTURE(Fixture, "dont_ice_on_astexprerror")
    name: "dont_ice_on_astexprerror",
    fixture: "Fixture",
    malformed: "`-` has no operand",
    source: `
        local foo = -;
    `,
    expect: [{ errors: 1 }],
  },
  {
    // TypeInfer.test.cpp:783 TEST_CASE_FIXTURE(Fixture, "luau_resolves_symbols_the_same_way_lua_does")
    name: "luau_resolves_symbols_the_same_way_lua_does",
    fixture: "Fixture",
    source: `
        --!strict
        function Funky()
            local a: number = foo
        end

        local foo: string = 'hello'
    `,
    expect: [{ errors: 1 }, { error: 0, code: "UnknownSymbol" }],
  },
  {
    // TypeInfer.test.cpp:800 TEST_CASE_FIXTURE(Fixture, "no_stack_overflow_from_isoptional")
    name: "no_stack_overflow_from_isoptional",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        function _(l0:t0): (any, ()->())
            return 0,_
        end

        type t0 = t0 | {}
        _(nil)
    `,
    expect: [{ errors: "some" }, { alias: "t0", equals: "any" }, { anyError: "OccursCheckFailed" }],
  },
  {
    // TypeInfer.test.cpp:832 TEST_CASE_FIXTURE(BuiltinsFixture, "no_stack_overflow_from_isoptional2")
    name: "no_stack_overflow_from_isoptional2",
    fixture: "BuiltinsFixture",
    source: `
        function _(l0:({})|(t0)):((((typeof((xpcall)))|(t96<t0>))|(t13))&(t96<t0>),()->typeof(...))
            return 0,_
        end

        type t0<t107> = ((typeof((_G)))|(({})|(t0)))|(t0)
        _(nil)

        local t: ({})|(t0)
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.test.cpp:848 TEST_CASE_FIXTURE(Fixture, "no_infinite_loop_when_trying_to_unify_uh_this")
    name: "no_infinite_loop_when_trying_to_unify_uh_this",
    fixture: "Fixture",
    source: `
        function _(l22,l0):((((boolean)|(t0))|(t0))&(()->(()->(()->()->{},(t0<t22>)|(t0)),any)))
            return function():t0<t0>
            end
        end
        type t0<t0> = ((typeof(_))|(any))|(typeof(_))
        _()
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.test.cpp:862 TEST_CASE_FIXTURE(BuiltinsFixture, "no_heap_use_after_free_error")
    name: "no_heap_use_after_free_error",
    fixture: "BuiltinsFixture",
    source: `
        --!nonstrict
        _ += _:n0(xpcall,_)
        local l0
        do end
        while _ do
            function _:_()
                _ += _(_._(_:n0(xpcall,_)))
            end
        end
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.test.cpp:879 TEST_CASE_FIXTURE(Fixture, "infer_type_assertion_value_type")
    name: "infer_type_assertion_value_type",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    unparsed: { defect: 877 }, // a :: cast to a type that is not also an expression
    source: `
local function f()
    return {4, "b", 3} :: {string|number}
end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:892 TEST_CASE_FIXTURE(Fixture, "infer_assignment_value_types")
    name: "infer_assignment_value_types",
    fixture: "Fixture",
    source: `
local a: (number, number) -> number = function(a, b) return a - b end

a = function(a, b) return a + b end

local b: {number|string}
local c: {number|string}
b, c = {2, "s"}, {"b", 4}
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:907 TEST_CASE_FIXTURE(BuiltinsFixture, "infer_assignment_value_types_mutable_lval")
    name: "infer_assignment_value_types_mutable_lval",
    fixture: "BuiltinsFixture",
    source: `
local a = {}
a.x = 2
a = setmetatable(a, { __call = function(x) end })
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:918 TEST_CASE_FIXTURE(Fixture, "infer_through_group_expr")
    name: "infer_through_group_expr",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
local function f(a: (number, number) -> number) return a(1, 3) end
f(((function(a, b) return a + b end)))
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:930 TEST_CASE_FIXTURE(Fixture, "tc_if_else_expressions1")
    name: "tc_if_else_expressions1",
    fixture: "Fixture",
    source: `local a = if true then "true" else "false"`,
    expect: [{ errors: 0 }, { type: "a", equals: "string" }],
  },
  {
    // TypeInfer.test.cpp:939 TEST_CASE_FIXTURE(Fixture, "tc_if_else_expressions2")
    name: "tc_if_else_expressions2",
    fixture: "Fixture",
    source: `
local a = if false then "a" elseif false then "b" else "c"
    `,
    expect: [{ errors: 0 }, { type: "a", equals: "string" }],
  },
  {
    // TypeInfer.test.cpp:950 TEST_CASE_FIXTURE(Fixture, "tc_if_else_expressions_type_union")
    name: "tc_if_else_expressions_type_union",
    fixture: "Fixture",
    source: `local a: number? = if true then 42 else nil`,
    expect: [{ errors: 0 }, { type: "a", equals: "number?", options: { exhaustive: true } }],
  },
  {
    // TypeInfer.test.cpp:958 TEST_CASE_FIXTURE(Fixture, "tc_if_else_expressions_expected_type_1")
    name: "tc_if_else_expressions_expected_type_1",
    fixture: "Fixture",
    source: `
type X = {number | string}
local a: X = if true then {"1", 2, 3} else {4, 5, 6}
`,
    expect: [
      { errors: 0 },
      { type: "a", equals: "{number | string}", options: { exhaustive: true } },
    ],
  },
  {
    // TypeInfer.test.cpp:969 TEST_CASE_FIXTURE(Fixture, "tc_if_else_expressions_expected_type_2")
    name: "tc_if_else_expressions_expected_type_2",
    fixture: "Fixture",
    source: `
local a: number? = if true then 1 else nil
`,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:978 TEST_CASE_FIXTURE(BuiltinsFixture, "tc_if_else_expressions_expected_type_3")
    name: "tc_if_else_expressions_expected_type_3",
    fixture: "BuiltinsFixture",
    ignoreMissingAnnotations: true,
    source: `
local function times<T>(n: any, f: () -> T)
    local result: {T} = {}
    local res = f()
    table.insert(result, if true then res else n)
    return result
end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:994 TEST_CASE_FIXTURE(Fixture, "tc_interpolated_string_basic")
    name: "tc_interpolated_string_basic",
    fixture: "Fixture",
    source: `
        local foo: string = \`hello {"world"}\`
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:1003 TEST_CASE_FIXTURE(Fixture, "tc_interpolated_string_with_invalid_expression")
    name: "tc_interpolated_string_with_invalid_expression",
    fixture: "Fixture",
    source: `
        local function f(x: number) end

        local foo: string = \`hello {f("uh oh")}\`
    `,
    expect: [{ errors: 1 }],
  },
  {
    // TypeInfer.test.cpp:1014 TEST_CASE_FIXTURE(Fixture, "tc_interpolated_string_constant_type")
    name: "tc_interpolated_string_constant_type",
    fixture: "Fixture",
    source: `
        local foo: "hello" = \`hello\`
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:1032 TEST_CASE_FIXTURE(Fixture, "free_types_introduced_within_control_flow_constructs_do_not_get_an_elevated_TypeLevel")
    name: "free_types_introduced_within_control_flow_constructs_do_not_get_an_elevated_TypeLevel",
    fixture: "Fixture",
    source: `
        --!strict
        if _ then
            _[_], _ = nil
            _()
        end

        local aaa = function():typeof(_) return 1 end

        if aaa then
            while _() do
            end
        end
    `,
    expect: [],
  },
  {
    // TypeInfer.test.cpp:1064 TEST_CASE_FIXTURE(Fixture, "fuzzer_found_this")
    name: "fuzzer_found_this",
    fixture: "Fixture",
    source: `
        l0, _ = nil

        local function p()
            _()
        end

        a = _(
            function():(typeof(p),typeof(_))
            end
        )[nil]
    `,
    expect: [],
  },
  {
    // TypeInfer.test.cpp:1085 TEST_CASE_FIXTURE(BuiltinsFixture, "fuzzer_found_this_2")
    name: "fuzzer_found_this_2",
    fixture: "BuiltinsFixture",
    source: `
        local _
        if _ then
            _ = _
            while _() do
                _ = # _
            end
        end
    `,
    expect: [],
  },
  {
    // TypeInfer.test.cpp:1098 TEST_CASE_FIXTURE(Fixture, "indexing_a_cyclic_intersection_does_not_crash")
    name: "indexing_a_cyclic_intersection_does_not_crash",
    fixture: "Fixture",
    malformed: "`if _ then \"\"` has no else",
    source: `
        local _
        if _ then
            while nil do
                _ = _
            end
        end
        if _[if _ then ""] then
            while nil do
                _ = if _ then ""
            end
        end
    `,
    expect: [],
  },
  {
    // TypeInfer.test.cpp:1115 TEST_CASE_FIXTURE(BuiltinsFixture, "recursive_metatable_crash")
    name: "recursive_metatable_crash",
    fixture: "BuiltinsFixture",
    ignoreMissingAnnotations: true,
    source: `
local function getIt()
    local y
    y = setmetatable({}, y)
    return y
end
local a = getIt()
local b = getIt()
local c = a or b
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:1133 TEST_CASE_FIXTURE(Fixture, "bound_typepack_promote")
    name: "bound_typepack_promote",
    fixture: "Fixture",
    source: `
local function p()
    local this = {}
    this.pf = foo()
    function this:IsActive() end
    function this:Start(o) end
    return this
end

local function h(tp, o)
    ep = tp
    tp:Start(o)
    tp.pf.Connect(function()
        ep:IsActive()
    end)
end

function on()
    local t = p()
    h(t)
end
    `,
    expect: [],
  },
  {
    // TypeInfer.test.cpp:1160 TEST_CASE_FIXTURE(Fixture, "cli_50041_committing_txnlog_in_apollo_client_error")
    name: "cli_50041_committing_txnlog_in_apollo_client_error",
    fixture: "Fixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        --!strict
        --!nolint

        type FieldSpecifier = {
            fieldName: string,
        }

        type ReadFieldOptions = FieldSpecifier & { from: number? }

        type Policies = {
            getStoreFieldName: (self: Policies, fieldSpec: FieldSpecifier) -> string,
        }

        local Policies = {}

        local function foo(p: Policies)
        end

        function Policies:getStoreFieldName(specifier: FieldSpecifier): string
            return ""
        end

        function Policies:readField(options: ReadFieldOptions)
            local _ = self:getStoreFieldName(options)
            foo(self)
        end
    `,
    expect: [],
  },
  {
    // TypeInfer.test.cpp:1225 TEST_CASE_FIXTURE(Fixture, "type_infer_recursion_limit_no_ice")
    // Upstream lowers the old solver's type inference recursion limit to 2 with
    // ScopedFastInt for the case.
    name: "type_infer_recursion_limit_no_ice",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        function complex()
          function _(l0:t0): (any, ()->())
              return 0,_
          end
          type t0 = t0 | {}
          _(nil)
        end
    `,
    expect: [
      { errors: "some" },
      { error: 0, message: "Type contains a self-recursive construct that cannot be resolved" },
    ],
  },
  {
    // TypeInfer.test.cpp:1247 TEST_CASE_FIXTURE(Fixture, "type_infer_recursion_limit_normalizer")
    // Upstream lowers the old solver's type inference recursion limit to 10
    // with ScopedFastInt for the case. It also checks each error with Luau's
    // internal validateErrors.
    name: "type_infer_recursion_limit_normalizer",
    fixture: "Fixture",
    source: `
        function f<a,b,c,d,e,f,g,h,i,j>()
            local x : a&b&c&d&e&f&g&h&(i?)
            local y : (a&b&c&d&e&f&g&h&i)? = x
        end
    `,
    expect: [
      { errors: "some" },
      { errors: 3 },
      { error: 0, location: [2, 22, 2, 42] },
      { error: 1, location: [3, 22, 3, 42] },
      { error: 2, location: [3, 22, 3, 41] },
      { error: 0, message: "Code is too complex to typecheck! Consider simplifying the code around this area" },
      { error: 1, message: "Code is too complex to typecheck! Consider simplifying the code around this area" },
      { error: 2, message: "Code is too complex to typecheck! Consider simplifying the code around this area" },
    ],
  },
  {
    // TypeInfer.test.cpp:1280 TEST_CASE_FIXTURE(Fixture, "type_infer_cache_limit_normalizer")
    // Upstream lowers the normalizer's cache limit to 10 with ScopedFastInt for
    // the case.
    name: "type_infer_cache_limit_normalizer",
    fixture: "Fixture",
    source: `
        local x : ((number) -> number) & ((string) -> string) & ((nil) -> nil) & (({}) -> {})
        local y : (number | string | nil | {}) -> (number | string | nil | {}) = x
    `,
    expect: [
      { errors: "some" },
      { error: 0, message: "Code is too complex to typecheck! Consider simplifying the code around this area" },
    ],
  },
  {
    // TypeInfer.test.cpp:1293 TEST_CASE_FIXTURE(Fixture, "follow_on_new_types_in_substitution")
    name: "follow_on_new_types_in_substitution",
    fixture: "Fixture",
    source: `
        local obj = {}

        function obj:Method()
            self.fieldA = function(object)
                if object.a then
                    self.arr[object] = true
                elseif object.b then
                    self.fieldB[object] = object:Connect(function(arg)
                        self.arr[arg] = nil
                    end)
                end
            end
        end

        return obj
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:1316 TEST_CASE_FIXTURE(Fixture, "types_stored_in_astResolvedTypes")
    // Upstream checks that Luau recorded the alias's type as the resolved type
    // of `param`'s annotation (astResolvedTypes), which is internal.
    name: "types_stored_in_astResolvedTypes",
    fixture: "Fixture",
    source: `
        type alias = typeof("hello")
        local function foo(param: alias)
        end
    `,
    expect: [],
  },
  {
    // TypeInfer.test.cpp:1339 TEST_CASE_FIXTURE(Fixture, "bidirectional_checking_of_higher_order_function")
    // Upstream also checks that the error ends on line 4.
    name: "bidirectional_checking_of_higher_order_function",
    fixture: "Fixture",
    source: `
        function higher(cb: (number) -> ()) end

        higher(function(n)      -- no error here.  n : number
            local e: string = n -- error here.  n /: string
        end)
    `,
    expect: [{ errors: 1 }, { error: 0, line: 4 }],
  },
  {
    // TypeInfer.test.cpp:1356 TEST_CASE_FIXTURE(BuiltinsFixture, "it_is_ok_to_have_inconsistent_number_of_return_values_in_nonstrict")
    name: "it_is_ok_to_have_inconsistent_number_of_return_values_in_nonstrict",
    fixture: "BuiltinsFixture",
    source: `
        --!nonstrict
        function validate(stats, hits, misses)
            local checked = {}

            for _,l in ipairs(hits) do
                if not (stats[l] and stats[l] > 0) then
                    return false, string.format("expected line %d to be hit", l)
                end
                checked[l] = true
            end

            for _,l in ipairs(misses) do
                if not (stats[l] and stats[l] == 0) then
                    return false, string.format("expected line %d to be missed", l)
                end
                checked[l] = true
            end

            for k,v in pairs(stats) do
                if type(k) == "number" and not checked[k] then
                    return false, string.format("expected line %d to be absent", k)
                end
            end

            return true
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:1390 TEST_CASE_FIXTURE(Fixture, "fuzz_free_table_type_change_during_index_check")
    name: "fuzz_free_table_type_change_during_index_check",
    fixture: "Fixture",
    source: `
local _ = nil
while _["" >= _] do
end
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.test.cpp:1401 TEST_CASE_FIXTURE(BuiltinsFixture, "typechecking_in_type_guards")
    name: "typechecking_in_type_guards",
    fixture: "BuiltinsFixture",
    source: `
local a = type(foo) == 'nil'
local b = typeof(foo) ~= 'nil'
    `,
    expect: [
      { errors: 2 },
      { error: 0, message: "Unknown global 'foo'; consider assigning to it first" },
      { error: 1, message: "Unknown global 'foo'; consider assigning to it first" },
    ],
  },
  {
    // TypeInfer.test.cpp:1413 TEST_CASE_FIXTURE(Fixture, "occurs_isnt_always_failure")
    name: "occurs_isnt_always_failure",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
function f(x, c)                   -- x : X
    local y = if c then x else nil -- y : X?
    local z = if c then x else nil -- z : X?
    y = z
end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:1428 TEST_CASE_FIXTURE(Fixture, "dcr_delays_expansion_of_function_containing_blocked_parameter_type")
    name: "dcr_delays_expansion_of_function_containing_blocked_parameter_type",
    fixture: "Fixture",
    source: `
        local b: any

        function f(x)
            local a = b[1] or 'Cn'
            local c = x[1]

            if a:sub(1, #c) == c then
            end
        end
    `,
    expect: [],
  },
  {
    // TypeInfer.test.cpp:1447 TEST_CASE_FIXTURE(BuiltinsFixture, "recursive_function_that_invokes_itself_with_a_refinement_of_its_parameter")
    name: "recursive_function_that_invokes_itself_with_a_refinement_of_its_parameter",
    fixture: "BuiltinsFixture",
    source: `
        local TRUE: true = true

        local function matches(value, t: true)
            if value then
                return true
            end
        end

        local function readValue(breakpoint)
            if matches(breakpoint, TRUE) then
                readValue(breakpoint)
            end
        end
    `,
    expect: [{ type: "readValue", equals: "(unknown) -> ()" }],
  },
  {
    // TypeInfer.test.cpp:1471 TEST_CASE_FIXTURE(BuiltinsFixture, "recursive_function_that_invokes_itself_with_a_refinement_of_its_parameter_2")
    name: "recursive_function_that_invokes_itself_with_a_refinement_of_its_parameter_2",
    fixture: "BuiltinsFixture",
    source: `
        local function readValue(breakpoint)
            if type(breakpoint) == 'number' then
                readValue(breakpoint)
            end
        end
    `,
    expect: [{ type: "readValue", equals: "(unknown) -> ()" }],
  },
  {
    // TypeInfer.test.cpp:1494 TEST_CASE_FIXTURE(BuiltinsFixture, "convoluted_case_where_two_TypeVars_were_bound_to_each_other")
    name: "convoluted_case_where_two_TypeVars_were_bound_to_each_other",
    fixture: "BuiltinsFixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        type React_Ref<ElementType> = { current: ElementType } | ((ElementType) -> ())

        type React_AbstractComponent<Config, Instance> = {
            render: ((ref: React_Ref<Instance>) -> nil)
        }

        local createElement : <P, T>(React_AbstractComponent<P, T>) -> ()

        function ScrollView:render()
            local one = table.unpack(
                if true then a else b
            )

            createElement(one)
            createElement(one)
        end
    `,
    expect: [],
  },
  {
    // TypeInfer.test.cpp:1531 TEST_CASE_FIXTURE(Fixture, "handle_self_referential_HasProp_constraints")
    name: "handle_self_referential_HasProp_constraints",
    fixture: "Fixture",
    source: `
        local function calculateTopBarHeight(props)
        end
        local function isTopPage(props)
            local topMostOpaquePage
            if props.avatarRoute then
                topMostOpaquePage = props.avatarRoute.opaque.name
            else
                topMostOpaquePage = props.opaquePage
            end
        end

        function TopBarContainer:updateTopBarHeight(prevProps, prevState)
            calculateTopBarHeight(self.props)
            isTopPage(self.props)
            local topMostOpaquePage
            if self.props.avatarRoute then
                topMostOpaquePage = self.props.avatarRoute.opaque.name
                --                  ^--------------------------------^
            else
                topMostOpaquePage = self.props.opaquePage
            end
        end
    `,
    expect: [],
  },
  {
    // TypeInfer.test.cpp:1569 TEST_CASE_FIXTURE(Fixture, "promote_tail_type_packs")
    name: "promote_tail_type_packs",
    fixture: "Fixture",
    source: `
        --!strict

        local A: any = nil

        local C
        local D = A(
            A({}, {
                __call = function(a): string
                    local E: string = C(a)
                    return E
                end
            }),
            {
                F = function(s: typeof(C))
                end
            }
        )

        function C(b: any): string
            return ''
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:1598 TEST_CASE_FIXTURE(BuiltinsFixture, "lti_must_record_contributing_locations")
    // Upstream also checks that Luau recorded two locations contributing to the
    // upper bound of `f`'s parameter (upperBoundContributors), which is
    // internal.
    name: "lti_must_record_contributing_locations",
    fixture: "BuiltinsFixture",
    ignoreMissingAnnotations: true,
    source: `
        local function f(a)
            if math.random() > 0.5 then
                math.abs(a)
            else
                string.len(a)
            end
        end
    `,
    expect: [{ errors: 3 }, { type: "f", kind: "FunctionType" }],
  },
  {
    // TypeInfer.test.cpp:1636 TEST_CASE_FIXTURE(BuiltinsFixture, "be_sure_to_use_active_txnlog_when_evaluating_a_variadic_overload")
    // Upstream also checks that every error begins on line 5, however many
    // there are.
    name: "be_sure_to_use_active_txnlog_when_evaluating_a_variadic_overload",
    fixture: "BuiltinsFixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        local function concat<T>(target: {T}, ...: {T} | T): {T}
            return (nil :: any) :: {T}
        end

        local res = concat({"alic"}, 1, 2)
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.test.cpp:1655 TEST_CASE_FIXTURE(Fixture, "typeof_cannot_refine_builtin_alias")
    // Upstream first adds a sealed table type named GlobalTable to the
    // fixture's global types through Luau's C++ API, and asserts only that
    // checking does not crash.
    name: "typeof_cannot_refine_builtin_alias",
    fixture: "Fixture",
    source: `
        function foo(x)
            if typeof(x) == 'GlobalTable' then
            end
        end
    `,
    expect: [],
  },
  {
    // TypeInfer.test.cpp:1674 TEST_CASE_FIXTURE(BuiltinsFixture, "bad_iter_metamethod")
    name: "bad_iter_metamethod",
    fixture: "BuiltinsFixture",
    source: `
        function iter(): unknown
            return nil
        end

        local a = {__iter = iter}
        setmetatable(a, a)

        for i in a do
        end
    `,
    expect: [{ errors: 1 }, { error: 0, code: "CannotCallNonFunction", fields: { ty: "unknown" } }],
  },
  {
    // TypeInfer.test.cpp:1703 TEST_CASE_FIXTURE(Fixture, "leading_bar")
    name: "leading_bar",
    fixture: "Fixture",
    source: `
        type Bar = | number
    `,
    expect: [{ errors: 0 }, { alias: "Bar", equals: "number" }],
  },
  {
    // TypeInfer.test.cpp:1713 TEST_CASE_FIXTURE(Fixture, "leading_bar_question_mark")
    name: "leading_bar_question_mark",
    fixture: "Fixture",
    malformed: "`|?` has no type before the ?",
    source: `
        type Bar = |?
    `,
    expect: [
      { errors: 1 },
      { error: 0, message: "Expected type, got '?'" },
      { alias: "Bar", equals: "*error-type*?" },
    ],
  },
  {
    // TypeInfer.test.cpp:1724 TEST_CASE_FIXTURE(Fixture, "leading_ampersand")
    name: "leading_ampersand",
    fixture: "Fixture",
    source: `
        type Amp = & string
    `,
    expect: [{ errors: 0 }, { alias: "Amp", equals: "string" }],
  },
  {
    // TypeInfer.test.cpp:1734 TEST_CASE_FIXTURE(Fixture, "leading_bar_no_type")
    name: "leading_bar_no_type",
    fixture: "Fixture",
    malformed: "`|` has no type after it",
    source: `
        type Bar = |
    `,
    expect: [
      { errors: 1 },
      { error: 0, message: "Expected type, got <eof>" },
      { alias: "Bar", equals: "*error-type*" },
    ],
  },
  {
    // TypeInfer.test.cpp:1745 TEST_CASE_FIXTURE(Fixture, "leading_ampersand_no_type")
    name: "leading_ampersand_no_type",
    fixture: "Fixture",
    malformed: "`&` has no type after it",
    source: `
        type Amp = &
    `,
    expect: [
      { errors: 1 },
      { error: 0, message: "Expected type, got <eof>" },
      { alias: "Amp", equals: "*error-type*" },
    ],
  },
  {
    // TypeInfer.test.cpp:1756 TEST_CASE_FIXTURE(Fixture, "react_lua_follow_free_type_ub")
    name: "react_lua_follow_free_type_ub",
    fixture: "Fixture",
    source: `
        return function(Roact)
            local Tree = Roact.Component:extend("Tree")

            function Tree:render()
                local breadth, components, depth, id, wrap =
                    self.props.breadth, self.props.components, self.props.depth, self.props.id, self.props.wrap
                local Box = components.Box
                if depth == 0 then
                    Roact.createElement(Box, {})
                else
                    Roact.createElement(Tree, {})
                end

            end
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:1779 TEST_CASE_FIXTURE(Fixture, "visit_error_nodes_in_lvalue")
    name: "visit_error_nodes_in_lvalue",
    fixture: "Fixture",
    malformed: "`(::,` is not an expression",
    source: `
        --!strict
        (::,
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.test.cpp:1801 TEST_CASE_FIXTURE(Fixture, "avoid_blocking_type_function")
    name: "avoid_blocking_type_function",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        --!strict
        local function foo(a : string?)
            local b = a or ""
            return b:upper()
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:1816 TEST_CASE_FIXTURE(Fixture, "avoid_double_reference_to_free_type")
    name: "avoid_double_reference_to_free_type",
    fixture: "Fixture",
    source: `
        --!strict
        local function wtf(name: string?)
            local message
            message = "invalid alternate fiber: " .. (name or "UNNAMED alternate")
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:1829 TEST_CASE_FIXTURE(BuiltinsFixture, "infer_types_of_globals")
    name: "infer_types_of_globals",
    fixture: "BuiltinsFixture",
    source: `
        --!strict
        foo = 5
        print(foo)
    `,
    expect: [
      { typeAt: [3, 14], equals: "number" },
      { errors: 1 },
      { error: 0, message: "Unknown global 'foo'; consider assigning to it first" },
    ],
  },
  {
    // TypeInfer.test.cpp:1845 TEST_CASE_FIXTURE(Fixture, "multiple_assignment")
    name: "multiple_assignment",
    fixture: "Fixture",
    unparsed: { defect: 876 }, // a variadic type written ...T, or T... inside << >>
    source: `
        local function requireString(arg: string) end
        local function requireNumber(arg: number) end

        local function f(): ...number end

        local w: "a", x, y, z = "a", 1, f()
        requireString(w)
        requireNumber(x)
        requireNumber(y)
        requireNumber(z)
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:1865 TEST_CASE_FIXTURE(Fixture, "fuzz_global_self_assignment")
    name: "fuzz_global_self_assignment",
    fixture: "Fixture",
    source: `
        _ = _
    `,
    expect: [],
  },
  {
    // TypeInfer.test.cpp:1874 TEST_CASE_FIXTURE(BuiltinsFixture, "getmetatable_works_with_any")
    name: "getmetatable_works_with_any",
    fixture: "BuiltinsFixture",
    source: `
        return {
            new = function(name: string)
                local self = newproxy(true) :: any

                getmetatable(self).__tostring = function()
                    return "Hello, I am " .. name
                end

                return self
            end,
        }
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:1891 TEST_CASE_FIXTURE(BuiltinsFixture, "getmetatable_infer_any_ret")
    name: "getmetatable_infer_any_ret",
    fixture: "BuiltinsFixture",
    ignoreMissingAnnotations: true,
    source: `
        local function spooky(x: any)
            return getmetatable(x)
        end
    `,
    expect: [{ errors: 0 }, { type: "spooky", equals: "(any) -> any" }],
  },
  {
    // TypeInfer.test.cpp:1904 TEST_CASE_FIXTURE(BuiltinsFixture, "getmetatable_infer_any_param")
    name: "getmetatable_infer_any_param",
    fixture: "BuiltinsFixture",
    source: `
        local function check(x): any
            return getmetatable(x)
        end
    `,
    expect: [{ type: "check", equals: "(unknown) -> any" }],
  },
  {
    // TypeInfer.test.cpp:1918 TEST_CASE_FIXTURE(BuiltinsFixture, "fuzzer_pack_check_missing_follow")
    name: "fuzzer_pack_check_missing_follow",
    fixture: "BuiltinsFixture",
    source: `
_ = n255
function _()
setmetatable(_)[_[xpcall(_,setmetatable(_,_()))]] /= xpcall(_,_)
_.n16(_,_)[_[_]] *= _
end
    `,
    expect: [],
  },
  {
    // TypeInfer.test.cpp:1930 TEST_CASE_FIXTURE(Fixture, "fuzzer_unify_with_free_missing_follow")
    name: "fuzzer_unify_with_free_missing_follow",
    fixture: "Fixture",
    malformed: "`if _ then _,_()` has no else",
    source: `
for _ in ... do
repeat
local function l0(l0)
end
_ = l0["aaaa"]
repeat
_ = true,_("")
_ = _[_]
until _
until _
repeat
_ = if _ then _,_()
_ = _[_]
until _
end
    `,
    expect: [],
  },
  {
    // TypeInfer.test.cpp:1952 TEST_CASE_FIXTURE(Fixture, "fuzzer_derived_unsound_loops")
    name: "fuzzer_derived_unsound_loops",
    fixture: "Fixture",
    source: `
        for _ in ... do
            repeat
                _ = 42
            until _
            repeat
                _ = _ + 2
            until _
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:1966 TEST_CASE_FIXTURE(Fixture, "concat_string_with_string_union")
    name: "concat_string_with_string_union",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        local function concat_stuff(x: string, y : string | number)
            return x .. y
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:1979 TEST_CASE_FIXTURE(BuiltinsFixture, "fuzz_local_before_declaration_ice")
    name: "fuzz_local_before_declaration_ice",
    fixture: "BuiltinsFixture",
    source: `
        local _
        table.freeze(_, _)
    `,
    expect: [
      { errors: 2 },
      { error: 0, code: "TypeMismatch", fields: { givenType: "nil", wantedType: "table" } },
      { error: 1, code: "CountMismatch", fields: { expected: 1, actual: 2 } },
    ],
  },
  {
    // TypeInfer.test.cpp:1998 TEST_CASE_FIXTURE(Fixture, "fuzz_dont_double_solve_compound_assignment" * doctest::timeout(LUAU_TIMEOUT))
    name: "fuzz_dont_double_solve_compound_assignment",
    fixture: "Fixture",
    source: `
        local _ = {}
        _[function<t0...>(...)
            _[function(...)
                _[_] %= _
                _ = {}
                _ = (- _)()
            end] %= _
            _[_] %= _
        end] %= true
    `,
    expect: [{ errors: "some" }, { noError: "ConstraintSolvingIncompleteError" }],
  },
  {
    // TypeInfer.test.cpp:2018 TEST_CASE_FIXTURE(Fixture, "assert_allows_singleton_union_or_intersection")
    name: "assert_allows_singleton_union_or_intersection",
    fixture: "Fixture",
    unparsed: { defect: 877 }, // a :: cast to a type that is not also an expression
    source: `
        local x = 42 :: | number
        local y = 42 :: & number
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:2026 TEST_CASE_FIXTURE(BuiltinsFixture, "assert_table_freeze_constraint_solving")
    name: "assert_table_freeze_constraint_solving",
    fixture: "BuiltinsFixture",
    source: `
        local f = table.freeze
        f(table)
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:2035 TEST_CASE_FIXTURE(BuiltinsFixture, "fuzz_assert_table_freeze_constraint_solving")
    name: "fuzz_assert_table_freeze_constraint_solving",
    fixture: "BuiltinsFixture",
    malformed: "`(if _ then table)` has no else",
    source: `
        local function l0()
        end
        for l0 in false do
        _ = (if _ then table)
        repeat
        do end
        _:freeze(table)
        until if _ then {{n0=_,},(_:freeze()._[_]),}
        end
    `,
    expect: [{ errors: "some" }, { noError: "ConstraintSolvingIncompleteError" }],
  },
  {
    // TypeInfer.test.cpp:2054 TEST_CASE_FIXTURE(BuiltinsFixture, "cyclic_unification_aborts_eventually" * doctest::timeout(LUAU_TIMEOUT))
    name: "cyclic_unification_aborts_eventually",
    fixture: "BuiltinsFixture",
    flags: { LuauInstantiateInSubtyping: true },
    skip: { newSolver: "sets DebugLuauForceOldSolver, so upstream runs it on the old solver only" },
    source: `pcall(table.unpack({pcall}))`,
    expect: [{ anyError: "CodeTooComplex" }],
  },
  {
    // TypeInfer.test.cpp:2068 TEST_CASE_FIXTURE(Fixture, "fuzz_generalize_one_remove_type_assert")
    name: "fuzz_generalize_one_remove_type_assert",
    fixture: "Fixture",
    source: `
        local _ = {_ = _}, l0
        _ += _
        while _ do
            while _[_] do
                if _.n0 then
                    _ = _
                else
                    _ = _
                    return _
                end
                do
                    while _ do
                        _, _ = nil
                    end
                    return function()
                    end
                end
                while _[_] do
                    _ = _._VERSION, ""
                end
            end
            local _
        end
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.test.cpp:2102 TEST_CASE_FIXTURE(Fixture, "fuzz_generalize_one_remove_type_assert_2")
    name: "fuzz_generalize_one_remove_type_assert_2",
    fixture: "Fixture",
    source: `
        local _ = {n0 = _.n0}, -_, _
        _ += _.n0
        _ /= _[_]
        while _.n110 do
            while _._ do
                while _ do
                    while _ do
                        _ = _
                    end
                end
                while _[_] do
                    function _()
                    end
                end
            end
            while ... do
            end
        end
    `,
    expect: [{ errors: "some" }, { noError: "ConstraintSolvingIncompleteError" }],
  },
  {
    // TypeInfer.test.cpp:2132 TEST_CASE_FIXTURE(BuiltinsFixture, "fuzz_simplify_combinatorial_explosion")
    name: "fuzz_simplify_combinatorial_explosion",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
_ = {[_[\`{_ + ...}\`]]=_,_,[{_=nil,[_._G]=false,}]={[_[_[_]][_][_ / ...]]=_,[...]=false,_,},[_[_][_][_]]=l255,},""
local _
    `,
        expect: [{ errors: "some" }],
      },
      {
        source: `
_ = {[(_G)]=_,[_[_[_]][_[_]][nil][_]]={_G=_,},_[_[_]][_][_],n0={[_]=_,_G=_,},248,}
local _
    `,
        expect: [{ errors: "some" }],
      },
    ],
  },
  {
    // TypeInfer.test.cpp:2149 TEST_CASE_FIXTURE(BuiltinsFixture, "fuzz_missing_follow_table_freeze")
    name: "fuzz_missing_follow_table_freeze",
    fixture: "BuiltinsFixture",
    source: `
        if _:freeze(_)[_][_] then
        else
        do end
        end
        if _:freeze((nil))[_][_] then
        else
        do end
        end
        _ = table,true,_(lower)
        do end
        _:freeze()[_] += {} > _
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.test.cpp:2166 TEST_CASE_FIXTURE(BuiltinsFixture, "fuzzer_avoid_double_negation" * doctest::timeout(LUAU_TIMEOUT))
    name: "fuzzer_avoid_double_negation",
    fixture: "BuiltinsFixture",
    malformed: "`return if _ then _,_` has no else",
    source: `
local _ = _
repeat
do end
while 0 do
do
_ = _[0]
_._ *= _
end
if _ then
elseif "" then
end
_ = _[0]
_ = ""
end
_ = ""
until _
while false do
do
_ = _[0]
do end
end
_ = ""
return if _ then _,_
end
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.test.cpp:2199 TEST_CASE_FIXTURE(BuiltinsFixture, "fuzzer_has_indexer_can_create_cyclic_union")
    name: "fuzzer_has_indexer_can_create_cyclic_union",
    fixture: "BuiltinsFixture",
    unparsed: { defect: 879 }, // a call to require
    source: `
        local _ = nil
        repeat
            _ = {[true] = _[_]}
            do
                repeat
                    _ = {[_[l0]] = _[_]}
                    return
                until #next(_) < _
            end
            local l0 = require(module0)
        until #_[_](_) < next(_)
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.test.cpp:2216 TEST_CASE_FIXTURE(Fixture, "fuzzer_simplify_table_indexer" * doctest::timeout(LUAU_TIMEOUT))
    name: "fuzzer_simplify_table_indexer",
    fixture: "Fixture",
    source: `
        _[_] += true
        _ = {
            [{
                [_] = _[_][if ... then _ else _](),
                [-1795162112] = function()
                end,
                [{
                    _G = function()
                    end
                }] = _(_(true)),
                _G = _
            }] = _,
            [_[not _][_]] = _(),
            _
        }

    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.test.cpp:2238 TEST_CASE_FIXTURE(Fixture, "fuzzer_simplify_crash")
    name: "fuzzer_simplify_crash",
    fixture: "Fixture",
    malformed: "the `if` has no `end` for its `else if`",
    source: `
        if _ then
            _ = nil
        else if _ and _ then
            _ = nil
        end
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.test.cpp:2249 TEST_CASE_FIXTURE(BuiltinsFixture, "fuzzer_simplify_is_check_on_bound_type")
    name: "fuzzer_simplify_is_check_on_bound_type",
    fixture: "BuiltinsFixture",
    malformed: "`_[if _ then false]` has no else",
    source: `
        _[if _ then false],_,_._,log10 = {{[_]={_,},_G=not function():true
        _ = nil
        end,},[_[_ + true][_][_]]=_,sort=_,},_
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.test.cpp:2258 TEST_CASE_FIXTURE(BuiltinsFixture, "regexp_hang" * doctest::timeout(LUAU_TIMEOUT))
    name: "regexp_hang",
    fixture: "BuiltinsFixture",
    unparsed: { defect: 922 }, // a keyword written right after an operand with no space
    source: `
local outln, group_id, verb_flags = {}, {}, {
    newline = 1,
    newline_seq = 1,
    not_empty = 0
}
if not escape_c then
elseif escape_c >= 48 and escape_c <= 57 then
elseif escape_c == 69 then
elseif escape_c == 81 then
elseif escape_c == 78 then
    if codes[i] ~= 125 or i == start_i then
    end
    table.insert(outln, code_point)
elseif escape_c == 80 or escape_c == 112 then
    if script_set then
    elseif not valid_categories[c_name]then
    else
        table.insert(outln, { 'category', negate, c_name })
    end
elseif escape_c == 103 and (codes[i + 1] == 123 or codes[i + 1] >= 48 and codes[i + 1] <= 57)then
elseif escape_c == 111 then
elseif escape_c == 120 then
else
    table.insert(outln, esc_char or escape_c)
end

for i, v in ipairs(outln)do
    if type(v) == 'table' and (v[1] == 40 or v[1] == 'quantifier' and type(v[5]) == 'table' and v[5][1] == 40)then
        v = v[5]
    elseif type(v) == 'table' and (v[1] == 'backref' or v[1] == 'recurmatch')then
        for i1, v1 in ipairs(outln)do
            break
        end
    end
end
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.test.cpp:2299 TEST_CASE_FIXTURE(Fixture, "self_bound_due_to_compound_assign")
    name: "self_bound_due_to_compound_assign",
    fixture: "Fixture",
    skip: { notApplicable: "declares extern types, which a Luau host defines in C++ or a definition file; Sparkdown has neither" },
    source: `
        --!strict
        function MT_UPDATE(CAMERA: Camera, Enum: any, totalOffsets: number, focusToCFrame: number, magnitude: number)
            if CAMERA.CameraType ~= Enum.CameraType.Custom then
                return
            end

            local goalCFrame = (CAMERA.CFrame) * totalOffsets
            if goalCFrame ~= CAMERA.CFrame then
                goalCFrame -= (focusToCFrame * magnitude) -- Offset the goalCFrame the raycast direction based on the cutoff distance.
            end
        end

        return {}
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:2327 TEST_CASE_FIXTURE(BuiltinsFixture, "config_reader_example")
    name: "config_reader_example",
    fixture: "BuiltinsFixture",
    checks: [
      {
        module: "game/ConfigReader",
        source: `
        --!strict
        local ConfigReader = {}
        ConfigReader.Defaults = {}

        local Defaults = ConfigReader.Defaults
        local Config = ConfigReader.Defaults

        function ConfigReader:read(config_name: string)
            if Config[config_name] ~= nil then
                return Config[config_name]
            elseif Defaults[config_name] ~= nil then
                return Defaults[config_name]
            else
                error(config_name .. " must be defined in Config")
            end
        end


        function ConfigReader:getFullConfigWithDefaults()
            local config = {}
            for key, val in pairs(ConfigReader.Defaults) do
                config[key] = val
            end
            for key, val in pairs(Config) do
                config[key] = val
            end
            return config
        end

        return ConfigReader
    `,
        expect: [],
      },
      {
        module: "game/Util",
        unparsed: { defect: 879 }, // a call to require
        source: `
        --!strict
        local ConfigReader = require(script.Parent.ConfigReader)
        local _ = ConfigReader:read("foobar")()
    `,
        expect: [{ errors: "some" }],
      },
    ],
  },
  {
    // TypeInfer.test.cpp:2378 TEST_CASE_FIXTURE(BuiltinsFixture, "is_safe_integer_example")
    name: "is_safe_integer_example",
    fixture: "BuiltinsFixture",
    checks: [
      {
        module: "game/isInteger",
        source: `
        --!strict
        return function(value)
            return type(value) == "number" and value ~= math.huge and value == math.floor(value)
        end
    `,
        expect: [],
      },
      {
        module: "game/MAX_SAFE_INTEGER",
        source: `
        --!strict
        return 42
    `,
        expect: [],
      },
      {
        module: "game/Util",
        unparsed: { defect: 879 }, // a call to require
        source: `
        --!strict
        local isInteger = require(script.Parent.isInteger)
        local MAX_SAFE_INTEGER = require(script.Parent.MAX_SAFE_INTEGER)
        return function(value)
        	return isInteger(value) and math.abs(value) <= MAX_SAFE_INTEGER
        end
    `,
        expect: [{ errors: 0 }],
      },
    ],
  },
  {
    // TypeInfer.test.cpp:2404 TEST_CASE_FIXTURE(BuiltinsFixture, "type_remover_heap_use_after_free")
    name: "type_remover_heap_use_after_free",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        _ = if l0.n0.n0 then {n4(...,setmetatable(setmetatable(_),_)),_ == _,} elseif _.ceil._ then _ elseif _ then not _
    `,
        expect: [{ errors: "some" }],
      },
      {
        unparsed: { defect: 923 }, // an if expression with an = before its else
        source: `
        do
        _ = if _[_] then {[_(\`\`)]="y",} elseif _ then _ elseif _[_] then "" elseif _ then _ elseif _[_] then {} elseif _[_] then false else ""
        end
    `,
        expect: [{ errors: "some" }],
      },
      {
        unparsed: { defect: 879 }, // a call to require
        source: `
        local l249 = require(module0)
        _,_ = {[\`{_}\`]=_,[_._G._]=(_)(),[_["" + _]._G]={_=_,_=_,[_._G[_]._]=_G,},},_,(_)()
    `,
        expect: [{ errors: "some" }],
      },
    ],
  },
  {
    // TypeInfer.test.cpp:2422 TEST_CASE_FIXTURE(Fixture, "fuzzer_missing_follow_in_assign_index_constraint")
    name: "fuzzer_missing_follow_in_assign_index_constraint",
    fixture: "Fixture",
    source: `
        _._G = nil
        for _ in ... do
        break
        end
        for _ in function<t0,t0,t0>(l0)
        _,_._,l0 = l0,_,_._
        local _ = l0,{[_]=_,}
        _[{nil=_,}](_)
        end,{[_]=_,} do
        end
        _ -= _
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.test.cpp:2439 TEST_CASE_FIXTURE(Fixture, "fuzzer_occurs_check_stack_overflow")
    name: "fuzzer_occurs_check_stack_overflow",
    fixture: "Fixture",
    malformed: "`if _ then _` has no else",
    source: `
        _ = if _ then _
        for l0 in ... do
        type t0 = (()->((t0<t0...>)->())|(any))|(typeof(_))
        end
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.test.cpp:2450 TEST_CASE_FIXTURE(Fixture, "fuzzer_infer_divergent_rw_props")
    name: "fuzzer_infer_divergent_rw_props",
    fixture: "Fixture",
    source: `
        return function(l0:{_:(any)&(any),write _:any,})
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:2460 TEST_CASE_FIXTURE(Fixture, "read_table_type_refinements_persist_scope")
    name: "read_table_type_refinements_persist_scope",
    fixture: "Fixture",
    source: `
_ = {n0=_,},if _._ then ... else if _[if _ then _ else ({nil,})].setmetatable then if _ then _ elseif l0 then ... elseif _.n0 then _ elseif function<A>(l0)
return _._G,_
end then _._G else ...
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.test.cpp:2471 TEST_CASE_FIXTURE(Fixture, "oss_1815_verbatim")
    name: "oss_1815_verbatim",
    fixture: "Fixture",
    source: `
        --!strict
        local item: "foo" = "bar"
        item = if true then "foo" else "foo"

        local item2: "foo" = if true then "doge" else "doge2"
    `,
    expect: [
      { errors: 3 },
      { error: 0, location: [2, 28, 2, 33] },
      { error: 0, code: "TypeMismatch", fields: { wantedType: "\"foo\"", givenType: "\"bar\"" } },
      { error: 1, location: [5, 42, 5, 48] },
      { error: 1, code: "TypeMismatch", fields: { wantedType: "\"foo\"", givenType: "\"doge\"" } },
      { error: 2, location: [5, 54, 5, 61] },
      { error: 2, code: "TypeMismatch", fields: { wantedType: "\"foo\"", givenType: "\"doge2\"" } },
    ],
  },
  {
    // TypeInfer.test.cpp:2500 TEST_CASE_FIXTURE(Fixture, "if_then_else_bidirectional_inference")
    name: "if_then_else_bidirectional_inference",
    fixture: "Fixture",
    source: `
        type foo = {
            bar: (() -> string)?,
        }
        local qux: foo = if false then {} else 10
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "TypeMismatch", fields: { givenType: "number", wantedType: "foo" } },
    ],
  },
  {
    // TypeInfer.test.cpp:2518 TEST_CASE_FIXTURE(Fixture, "if_then_else_two_errors")
    name: "if_then_else_two_errors",
    fixture: "Fixture",
    source: `
        type foo = {
            bar: () -> string,
        }
        local qux: foo = if false then {} else 10
    `,
    expect: [
      { errors: 2 },
      { error: 0, code: "MissingProperties", fields: { superType: "foo", subType: "{  }" } },
      { error: 1, code: "TypeMismatch", fields: { wantedType: "foo", givenType: "number" } },
    ],
  },
  {
    // TypeInfer.test.cpp:2540 TEST_CASE_FIXTURE(Fixture, "standalone_constraint_solving_incomplete_is_hidden")
    name: "standalone_constraint_solving_incomplete_is_hidden",
    fixture: "Fixture",
    flags: { DebugLuauMagicTypes: true, DebugLuauAlwaysShowConstraintSolvingIncomplete: false },
    skip: { notApplicable: "uses the debug-only magic type _luau_force_constraint_solving_incomplete (DebugLuauMagicTypes), which forces an internal solver error" },
    source: `
        local function _f(_x: _luau_force_constraint_solving_incomplete) end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:2557 TEST_CASE_FIXTURE(Fixture, "non_standalone_constraint_solving_incomplete_is_hidden")
    name: "non_standalone_constraint_solving_incomplete_is_hidden",
    fixture: "Fixture",
    flags: { DebugLuauMagicTypes: true },
    skip: { notApplicable: "uses the debug-only magic type _luau_force_constraint_solving_incomplete (DebugLuauMagicTypes), which forces an internal solver error" },
    source: `
        local function _f(_x: _luau_force_constraint_solving_incomplete) end
        local x: number = true
    `,
    expect: [
      { errors: 2 },
      { error: 0, code: "ConstraintSolvingIncompleteError" },
      { error: 1, code: "TypeMismatch" },
    ],
  },
  {
    // TypeInfer.test.cpp:2574 TEST_CASE_FIXTURE(BuiltinsFixture, "fuzzer_missing_type_pack_follow")
    name: "fuzzer_missing_type_pack_follow",
    fixture: "BuiltinsFixture",
    checks: [
      {
        unparsed: { defect: 879 }, // a call to require
        source: `
local _ = {[0]=_,}
while _ do
do
local l2 = require(module0)
end
end
do end
function _(l0:typeof(_),l0,l0)
local l0 = require(module0)
_()(l0(),_,_(_())((_)))
do end
end
_()(_(if nil then _))("",_,_(_,(_)))
do end
    `,
        expect: [{ errors: "some" }],
      },
      {
        unparsed: { defect: 879 }, // a call to require
        source: `
local _ = {_,}
while _ do
do
do end
end
end
_ = nil
function _(l0,l0,l0)
local l0 = require(module0)
_()(_(),_,_(_())(_,true)(_,_),l0)
do end
end
_()(_())("",_.n0,_,_(_,true,(_)))
do end
    `,
        expect: [{ errors: "some" }],
      },
    ],
  },
  {
    // TypeInfer.test.cpp:2614 TEST_CASE_FIXTURE(Fixture, "txnlog_checks_for_occurrence_before_self_binding_a_type")
    name: "txnlog_checks_for_occurrence_before_self_binding_a_type",
    fixture: "Fixture",
    skip: { disabledUpstream: true },
    source: `
        local any = nil :: any

        function f1(x)
            x:m()
            local _ = x.A.p.a
        end

        function f2(x)
            local _ = x.d
        end

        function f3(x)
            local a = ""
            a = x.d.p
            local _ = undef[x.a]
        end

        function f4(x)
            f2(x)
            if undef and x and x:m() then
                any(x)
                return
            end
            f3(x)
            for _, v in any.x do
                local a = x[v].p
            end
            a.b = x
            if x.q ~= nil then
                f1(x) -- things go bad here
            end
        end

        return f4
    `,
    expect: [],
  },
  {
    // TypeInfer.test.cpp:2657 TEST_CASE_FIXTURE(Fixture, "constraint_generation_recursion_limit")
    // Upstream lowers the old solver's and the constraint generator's recursion
    // limits to 5 with ScopedFastInt for the case. It asserts only that
    // checking does not crash.
    name: "constraint_generation_recursion_limit",
    fixture: "Fixture",
    source: `
        if true then
        elseif true then
        elseif true then
        elseif true then
        else
        local x = 1
        end
    `,
    expect: [],
  },
  {
    // TypeInfer.test.cpp:2677 TEST_CASE_FIXTURE(Fixture, "nested_functions_can_depend_on_outer_generics")
    name: "nested_functions_can_depend_on_outer_generics",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        function name<P>(arg1: P)
            return function(what: P) return what end
        end

        local funcTest = name(nil)
        local out = funcTest(1) -- Doesn't report type mismatch error anymore
    `,
    expect: [
      { type: "funcTest", equals: "(nil) -> nil" },
      { errors: 1 },
      { error: 0, code: "TypeMismatch", fields: { wantedType: "nil", givenType: "number" } },
    ],
  },
  {
    // TypeInfer.test.cpp:2700 TEST_CASE_FIXTURE(BuiltinsFixture, "unterminated_function_body_causes_constraint_generator_crash")
    name: "unterminated_function_body_causes_constraint_generator_crash",
    fixture: "BuiltinsFixture",
    malformed: "`typeof(function)` has a function with no body",
    source: `
export type t = {
	func : typeof(
		function
	)
}

export type t1 = t12

export type t2 = {}

export type t3 = {
	foo:number
	bar:number
}

export type t4 = "foobar"

export type t5 = string

export type t6 = number

export type t7 = "foobar"

export type t8 = "foobar"

export type t9 = typeof(1)

export type t10 = typeof(1)

export type t11 = typeof(1)

export type t12 = {
	b:number
	pb:number
}
`,
    expect: [],
  },
  {
    // TypeInfer.test.cpp:2742 TEST_CASE_FIXTURE(BuiltinsFixture, "any_type_in_function_argument_should_not_error")
    name: "any_type_in_function_argument_should_not_error",
    fixture: "BuiltinsFixture",
    source: `
        --!strict
        local function f(u: string) end

        local t: {[any]: any} = {}

        for k in t do
            f(k)
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:2758 TEST_CASE_FIXTURE(BuiltinsFixture, "fuzz_avoid_singleton_union")
    name: "fuzz_avoid_singleton_union",
    fixture: "BuiltinsFixture",
    source: `
        _ = if true then _ else {},if (_) then _ elseif "" then {} elseif _ then {} elseif _ then _ else {}
        for l0,l2 in setmetatable(_,_),l0,_ do
        end
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.test.cpp:2767 TEST_CASE_FIXTURE(Fixture, "captured_globals_are_not_blocked")
    name: "captured_globals_are_not_blocked",
    fixture: "Fixture",
    flags: { DebugLuauForbidInternalTypes: true },
    source: `
        --!strict
        local Cancelled: boolean = false

        function Start()
            if Cancelled then
                return
            end
            Selection = 42
            local _ = function ()
                if Selection then
                end
            end
        end

        function Cancel()
            Selection = nil
        end

        return {}
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.test.cpp:2796 TEST_CASE_FIXTURE(BuiltinsFixture, "fuzzer_missing_follow_in_instantiation2")
    name: "fuzzer_missing_follow_in_instantiation2",
    fixture: "BuiltinsFixture",
    source: `
        _ = if {l0._,} then if _ then _ elseif rawset({[_]=_,[{_._,}]=_,}) then _ else {_._,} elseif rawset(_) then (true),""
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.test.cpp:2803 TEST_CASE_FIXTURE(BuiltinsFixture, "iterate_over_table_with_optional_indexer_values")
    name: "iterate_over_table_with_optional_indexer_values",
    fixture: "BuiltinsFixture",
    source: `
        --!strict
        type Bar = {x: number}
        type Foo = {[string]: Bar?}

        function printAllClassNames(foo: Foo)
            for _, value in foo do
                print(value.x)
            end
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:2822 TEST_CASE_FIXTURE(BuiltinsFixture, "iterate_over_local_table_with_optional_indexer_values")
    name: "iterate_over_local_table_with_optional_indexer_values",
    fixture: "BuiltinsFixture",
    source: `
        --!strict
        type TypeA = {Value: any}

        local list = {} :: {[string]: TypeA?}

        for index, a in list do
            a.Value = 1
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:2841 TEST_CASE_FIXTURE(BuiltinsFixture, "2236_iterate_over_table_with_values_as_optional_types")
    name: "2236_iterate_over_table_with_values_as_optional_types",
    fixture: "BuiltinsFixture",
    source: `
        --!strict
        local t: { number? } = {}

        for _, v in t do
            local x: number = v
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:2857 TEST_CASE_FIXTURE(Fixture, "fuzzer_missing_follow_in_function_call")
    name: "fuzzer_missing_follow_in_function_call",
    fixture: "Fixture",
    malformed: "`type t0<),A,)...>` has no type parameter names",
    source: `
        do end
        _ = if _ then true elseif _ then if _ then _ elseif _ then 2 .. {} elseif _._ then l0 else _ elseif _ then if ... then _ elseif {} then \`\` elseif _ then {_G=_,}
        type t0<),A,)...> = ({_G:any,write n0:any,write _:any<<A...>()->()>,write [any]:""""""""""""""""""""userda290013136ta:(0x000062900131369029001313690"""})|(l0.any)
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.test.cpp:2866 TEST_CASE_FIXTURE(BuiltinsFixture, "fuzzer_avoid_emplacing_blocked_types_you_dont_own")
    name: "fuzzer_avoid_emplacing_blocked_types_you_dont_own",
    fixture: "BuiltinsFixture",
    checks: [
      {
        unparsed: { defect: 879 }, // a call to require
        source: `
        if if _ then _ else nil then
            local l0 = require(module0)
            _ = l0
        elseif _ then
            function _(l0:true,...)
            end
        else
        end
        _ = l0
    `,
        expect: [{ errors: "some" }],
      },
      {
        unparsed: { defect: 879 }, // a call to require
        source: `
        local l0 = require(module0)
        local l10 = require(module0)
        do end
        for l0=_,_,true do
        end
        do
        local l0 = require(module0)
        _ = l0
        local l10 = require(module0)
        function _()
        end
        end
        local l10 = require(module0)
    `,
        expect: [{ errors: "some" }],
      },
    ],
  },
  {
    // TypeInfer.test.cpp:2897 TEST_CASE_FIXTURE(Fixture, "fuzzer_attach_polarity_to_ret_free_type")
    name: "fuzzer_attach_polarity_to_ret_free_type",
    fixture: "Fixture",
    source: `
        FOO =
            {
                [1 // setmetatable({}, FOO)] = 2,
                __idiv = function(lhs, rhs, ...) return ... end,
            }
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.test.cpp:2912 TEST_CASE_FIXTURE(BuiltinsFixture, "fuzzer_missing_follow_in_checking_generic_mapping")
    name: "fuzzer_missing_follow_in_checking_generic_mapping",
    fixture: "BuiltinsFixture",
    checks: [
      {
        malformed: "`_(if _ then _)` has no else",
        source: `
        function _<U...,M...>(l0,l0,l0,l0,)
            l0(_(rshift),_()(_(if _ then _),))
            _()(_(_(_)))
        end
        _()(_()(_(true,_)),)
    `,
        expect: [{ errors: "some" }],
      },
      {
        source: `
        function _<Y...,U...,M...>(l0:any,l0,l0,...)
            _()(_,_()(_(_()),_))
            do end
        end
        do end
        _()(_(""),{})
        do end
        for _ in ... do
        end
    `,
        expect: [{ errors: "some" }],
      },
    ],
  },
  {
    // TypeInfer.test.cpp:2935 TEST_CASE_FIXTURE(BuiltinsFixture, "fuzzer_allow_failing_to_bind_generic")
    name: "fuzzer_allow_failing_to_bind_generic",
    fixture: "BuiltinsFixture",
    source: `
        function test(arg1, arg2)
            local fun1 = test(test)
            local fun2 = test(test())
            fun1(arg2, fun2)
        end

        test()
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.test.cpp:2948 TEST_CASE_FIXTURE(BuiltinsFixture, "fuzzer_bind_generic_sigsegv")
    name: "fuzzer_bind_generic_sigsegv",
    fixture: "BuiltinsFixture",
    source: `
        function test(arg1, arg2)
            local fun = test()
            local fun2 = fun(nil, test(test()))
            fun2(test(test)())
        end

        local f = test()
        f(nil, test())
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.test.cpp:2962 TEST_CASE_FIXTURE(BuiltinsFixture, "fuzzer_global_type_inference")
    name: "fuzzer_global_type_inference",
    fixture: "BuiltinsFixture",
    source: `
        A = A
        A = A
        function A()
        end
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.test.cpp:2972 TEST_CASE_FIXTURE(BuiltinsFixture, "fuzzer_instantiate_iter_function")
    name: "fuzzer_instantiate_iter_function",
    fixture: "BuiltinsFixture",
    source: `
        function iterfunc(l0)
            return l0()
        end
        for _, _ in setmetatable({}, { __iter = iterfunc }) do
        end
    `,
    expect: [],
  },
  {
    // TypeInfer.test.cpp:2996 TEST_CASE_FIXTURE(BuiltinsFixture, "table_insert_and_unpack_generic_order_independence")
    name: "table_insert_and_unpack_generic_order_independence",
    fixture: "BuiltinsFixture",
    source: `
        local tbl = {}
        for i=0, 3 do
            table.insert(tbl, i)
        end
        return table.unpack(tbl)
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:3011 TEST_CASE_FIXTURE(Fixture, "fuzzer_export_no_ice")
    name: "fuzzer_export_no_ice",
    fixture: "Fixture",
    malformed: "`export local` exports a value, which Luau allows only for types",
    source: `
        while true do
            export local _
        end
        do
            export local _
            _ = _
        end
    `,
    expect: [],
  },
  {
    // TypeInfer.test.cpp:3025 TEST_CASE_FIXTURE(Fixture, "generic_P_inference_with_optional_param_does_not_leak_nil")
    name: "generic_P_inference_with_optional_param_does_not_leak_nil",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        local function createElement<P>(component: (P) -> any, props: P?): any
            return nil
        end

        local function MyComponent(props: { x: number, y: number? })
            return nil
        end

        createElement(MyComponent, { x = 1 })
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:3048 TEST_CASE_FIXTURE(Fixture, "generic_P_with_intersection_props_and_partial_table")
    name: "generic_P_with_intersection_props_and_partial_table",
    fixture: "Fixture",
    flags: { LuauSubtypingMissingPropertiesAsNil: true, LuauBidirectionalInferenceSimplifyTables: true },
    ignoreMissingAnnotations: true,
    source: `
        type BaseProps = { tag: string? }
        type ExtraProps = { b1: number? }

        local function Image(props: BaseProps & ExtraProps)
            return nil
        end

        local function createElement<P>(component: (P) -> any, props: P?): any
            return nil
        end

        local _x = createElement(Image, { tag = "test" })
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:3079 TEST_CASE_FIXTURE(Fixture, "generic_P_widening_with_recursive_optional_field")
    name: "generic_P_widening_with_recursive_optional_field",
    fixture: "Fixture",
    flags: { LuauSubtypingMissingPropertiesAsNil: true, LuauBidirectionalInferenceSimplifyTables: true },
    ignoreMissingAnnotations: true,
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        type Node = string | number | { [string]: Node }
        type BaseProps = { tag: string?, children: Node? }
        type ExtraProps = { size: number? }
        local function View(props: BaseProps & ExtraProps)
            return nil
        end
        local function createElement<P>(component: (P) -> any, props: P?): any
            return nil
        end
        local _x = createElement(View, { tag = "hello" })
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.test.cpp:3106 TEST_CASE_FIXTURE(BuiltinsFixture, "fuzzer_relate_extern_table_1")
    name: "fuzzer_relate_extern_table_1",
    fixture: "BuiltinsFixture",
    flags: { LuauCheckReadTyWhenRelatingExtern: true, DebugLuauUserDefinedClasses: true },
    unparsed: { divergence: "No `class` declarations" },
    source: `
        class _ end
        class l0 extends _
            public _
            public n108:{write _:string}
        end
        l0 = l0 { n108 = if _ then l0(_) else _() }
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.test.cpp:3123 TEST_CASE_FIXTURE(BuiltinsFixture, "fuzzer_relate_extern_table_2")
    name: "fuzzer_relate_extern_table_2",
    fixture: "BuiltinsFixture",
    flags: { LuauCheckReadTyWhenRelatingExtern: true, DebugLuauUserDefinedClasses: true },
    unparsed: { divergence: "No `class` declarations" },
    source: `
        class _ end
        class l0 extends _
            public _
            public n108:{ read: string | number, write _: string }
        end
        l0 = l0 { n108 = if _ then l0(_) else _() }
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.test.cpp:3140 TEST_CASE_FIXTURE(BuiltinsFixture, "fuzzer_generic_binding_ice")
    name: "fuzzer_generic_binding_ice",
    fixture: "BuiltinsFixture",
    flags: { LuauDoNotIceForBindingGeneric: true },
    malformed: "`function,` has no function body",
    source: `
        local l0: any
        l32 = l0.new {
            n5 = n0({fill=_,n33=_,},_,table.find,optional,_(_,_,n0,function,_,optional,""),),
            n0 = if _ then _,
            _ = n0({fill=_,n33=_,},_,table.find,optional,_(_,_,n0,function,_,optional,""),),
            rshift = n0({fill=_,n33=_,},_,table.find,optional,_(_,_,n0,function,_,optional,""),),
            _ = n0({fill=_,n33=_,},_,table.find,optional,_(_,_,n0,function,_,optional,""),),
            n0 = if _ then _,
            _ = n0({fill=_,n33=_,},_,table.find,optional,_(_,_,n0,function,_,optional,""),),
            _ = if _ then _, 
            n0 = n0({fill=_,n33=_,},_,table.find,optional,_(_,_,n0,function,_,optional,""),),
            n0 = if _ then _, 
            _ = n0({fill=_,n33=_,},_,table.find,optional,_(_,_,n0,function,_,optional,""),)
        }
    `,
    expect: [{ errors: "some" }],
  },
]);
