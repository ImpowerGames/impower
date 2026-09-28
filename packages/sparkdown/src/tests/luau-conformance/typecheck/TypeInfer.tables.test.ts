// Luau's type-checker tests from `tests/TypeInfer.tables.test.cpp` at the
// commit pinned in `../upstream/typecheck-cases.json`, ported as `README.md`
// describes. Each case names its upstream line.

import { NEW_SOLVER_GUARD_REASON, portUpstreamFile } from "./portedCases";

portUpstreamFile("TypeInfer.tables.test.cpp", [
  {
    // TypeInfer.tables.test.cpp:43 TEST_CASE_FIXTURE(BuiltinsFixture, "generalization_shouldnt_seal_table_in_len_function_fn")
    // Upstream compares the indexer's key and result with Luau's builtin types,
    // ported as printing as their names.
    name: "generalization_shouldnt_seal_table_in_len_function_fn",
    fixture: "BuiltinsFixture",
    source: `
local t = {}
for i = #t, 2, -1 do
    t[i] = t[i + 1]
end
    `,
    expect: [
      { errors: 0 },
      { type: "t", kind: "TableType" },
      { type: "t", path: [{ indexer: "key" }], equals: "number" },
      { type: "t", path: [{ indexer: "result" }], equals: "unknown" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:62 TEST_CASE_FIXTURE(BuiltinsFixture, "LUAU_ASSERT_arg_exprs_doesnt_trigger_assert")
    name: "LUAU_ASSERT_arg_exprs_doesnt_trigger_assert",
    fixture: "BuiltinsFixture",
    source: `
local FadeValue = {}
function FadeValue.new(finalCallback)
	local self = setmetatable({}, FadeValue)
	self.finalCallback = finalCallback
	return self
end

function FadeValue:destroy()
	self.finalCallback()
	self.finalCallback = nil
end
`,
    expect: [],
  },
  {
    // TypeInfer.tables.test.cpp:79 TEST_CASE_FIXTURE(Fixture, "basic")
    // Upstream checks that the properties foo, baz and quux are the primitive
    // types string, number and nil.
    name: "basic",
    fixture: "Fixture",
    source: `local t = {foo = "bar", baz = 9, quux = nil}`,
    expect: [
      { errors: 0 },
      { type: "t", kind: "TableType" },
      { type: "t", path: [{ property: "foo" }], equals: "string" },
      { type: "t", path: [{ property: "baz" }], equals: "number" },
      { type: "t", path: [{ property: "quux" }], equals: "nil" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:103 TEST_CASE_FIXTURE(Fixture, "augment_table")
    name: "augment_table",
    fixture: "Fixture",
    source: `
        local t = {}
        t.foo = 'bar'
    `,
    expect: [
      { errors: 0 },
      { type: "t", kind: "TableType" },
      { type: "t", equals: "{ foo: string }", options: { exhaustive: true } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:120 TEST_CASE_FIXTURE(Fixture, "augment_nested_table")
    name: "augment_nested_table",
    fixture: "Fixture",
    source: `
        local t = { p = {} }
        t.p.foo = 'bar'
    `,
    expect: [
      { errors: 0 },
      { type: "t", kind: "TableType" },
      { type: "t", path: [{ property: "p" }], kind: "TableType" },
      { type: "t", equals: "{ p: { foo: string } }", options: { exhaustive: true } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:144 TEST_CASE_FIXTURE(Fixture, "assign_key_at_index_expr")
    name: "assign_key_at_index_expr",
    fixture: "Fixture",
    source: `
        function f(t: {[string]: number})
            t["hello"] = 1
        end
    `,
    expect: [{ errors: 0 }, { typeAt: [2, 19], equals: "string" }],
  },
  {
    // TypeInfer.tables.test.cpp:158 TEST_CASE_FIXTURE(Fixture, "index_expression_is_checked_against_the_indexer_type")
    name: "index_expression_is_checked_against_the_indexer_type",
    fixture: "Fixture",
    source: `
        function f(t: {[boolean]: number})
            t["hello"] = 15
        end
    `,
    expect: [{ errors: 1 }, { error: 0, code: "CannotExtendTable" }],
  },
  {
    // TypeInfer.tables.test.cpp:173 TEST_CASE_FIXTURE(Fixture, "cannot_augment_sealed_table")
    // Upstream prints the error's tableType exhaustively.
    name: "cannot_augment_sealed_table",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        function mkt()
            return {prop=999}
        end

        local t = mkt()
        t.foo = 'bar'
    `,
    expect: [
      { errors: 1 },
      { error: 0, location: [6, 8, 6, 13] },
      { error: 0, code: "CannotExtendTable", fields: { tableType: "{ prop: number }", prop: "foo", context: "Property" } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:201 TEST_CASE_FIXTURE(Fixture, "dont_seal_an_unsealed_table_by_passing_it_to_a_function_that_takes_a_sealed_table")
    name: "dont_seal_an_unsealed_table_by_passing_it_to_a_function_that_takes_a_sealed_table",
    fixture: "Fixture",
    source: `
        type T = {[number]: number}
        function f(arg: T) end

        local B = {}
        f(B)
        function B:method() end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:215 TEST_CASE_FIXTURE(Fixture, "updating_sealed_table_prop_is_ok")
    name: "updating_sealed_table_prop_is_ok",
    fixture: "Fixture",
    source: `local t = {prop=999}    t.prop = 0`,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:221 TEST_CASE_FIXTURE(Fixture, "cannot_change_type_of_unsealed_table_prop")
    name: "cannot_change_type_of_unsealed_table_prop",
    fixture: "Fixture",
    source: `
        local t = {}
        t.prop = 999
        t.prop = 'hello'
    `,
    expect: [{ errors: 1 }],
  },
  {
    // TypeInfer.tables.test.cpp:231 TEST_CASE_FIXTURE(Fixture, "cannot_change_type_of_table_prop")
    name: "cannot_change_type_of_table_prop",
    fixture: "Fixture",
    source: `local t = {prop=999}   t.prop = 'hello'`,
    expect: [{ errors: 1 }],
  },
  {
    // TypeInfer.tables.test.cpp:237 TEST_CASE_FIXTURE(Fixture, "report_sensible_error_when_adding_a_value_to_a_nonexistent_prop")
    name: "report_sensible_error_when_adding_a_value_to_a_nonexistent_prop",
    fixture: "Fixture",
    source: `
        local t = {}
        t.foo[1] = 'one'
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "UnknownProperty", fields: { table: "t", key: "foo" } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:255 TEST_CASE_FIXTURE(Fixture, "function_calls_can_produce_tables")
    name: "function_calls_can_produce_tables",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `function get_table() return {prop=999} end    get_table().prop = 0`,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:263 TEST_CASE_FIXTURE(Fixture, "function_calls_produces_sealed_table_given_unsealed_table")
    name: "function_calls_produces_sealed_table_given_unsealed_table",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        function f() return {} end
        f().foo = 'fail'
    `,
    expect: [{ errors: 1 }],
  },
  {
    // TypeInfer.tables.test.cpp:274 TEST_CASE_FIXTURE(Fixture, "tc_member_function")
    name: "tc_member_function",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `local T = {}  function T:foo() return 5 end`,
    expect: [
      { errors: 0 },
      { type: "T", kind: "TableType" },
      { type: "T", path: [{ property: "foo" }], kind: "FunctionType" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:292 TEST_CASE_FIXTURE(Fixture, "tc_member_function_2")
    // Upstream also checks that T.U.foo takes exactly one argument.
    name: "tc_member_function_2",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `local T = {U={}}  function T.U:foo() return 5 end`,
    expect: [
      { errors: 0 },
      { type: "T", kind: "TableType" },
      { type: "T", path: [{ property: "U" }], kind: "TableType" },
      { type: "T", path: [{ property: "U" }, { property: "foo" }], kind: "FunctionType" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:326 TEST_CASE_FIXTURE(Fixture, "call_method")
    name: "call_method",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        local T = {}
        T.x = 0
        function T:method()
            return self.x
        end
        local a = T:method()
    `,
    expect: [{ errors: 0 }, { type: "a", equals: "number" }],
  },
  {
    // TypeInfer.tables.test.cpp:343 TEST_CASE_FIXTURE(Fixture, "call_method_with_explicit_self_argument")
    name: "call_method_with_explicit_self_argument",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        local T = {}
        T.x = 0

        function T:method()
            return self.x
        end

        local a = T.method(T)
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:360 TEST_CASE_FIXTURE(Fixture, "used_dot_instead_of_colon")
    name: "used_dot_instead_of_colon",
    fixture: "Fixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        local T = {}
        T.x = 0
        function T:method()
            return self.x
        end
        local a = T.method()
    `,
    expect: [],
  },
  {
    // TypeInfer.tables.test.cpp:385 TEST_CASE_FIXTURE(BuiltinsFixture, "used_colon_correctly")
    name: "used_colon_correctly",
    fixture: "BuiltinsFixture",
    source: `
        --!nonstrict
        local upVector = {}
        function upVector:Dot(lookVector)
            return 8
        end
        local v = math.abs(upVector:Dot(5))
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:399 TEST_CASE_FIXTURE(Fixture, "used_dot_instead_of_colon_but_correctly")
    name: "used_dot_instead_of_colon_but_correctly",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        local T = {}
        T.x = 0
        function T:method(arg1, arg2)
            return self.x
        end
        local a = T.method(T, 6, 7)
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:414 TEST_CASE_FIXTURE(Fixture, "used_colon_instead_of_dot")
    name: "used_colon_instead_of_dot",
    fixture: "Fixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        local T = {}
        T.x = 0
        function T.method()
            return 5
        end
        local a = T:method()
    `,
    expect: [],
  },
  {
    // TypeInfer.tables.test.cpp:439 TEST_CASE_FIXTURE(Fixture, "open_table_unification_2")
    name: "open_table_unification_2",
    fixture: "Fixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        local a = {}
        a.x = 99

        function a:method()
            return self.y
        end
        a:method()
    `,
    expect: [],
  },
  {
    // TypeInfer.tables.test.cpp:467 TEST_CASE_FIXTURE(Fixture, "open_table_unification_3")
    // Upstream also checks that foo takes exactly one argument.
    name: "open_table_unification_3",
    fixture: "Fixture",
    source: `
        function id(x)
            return x
        end

        function foo(o)
            id(o.bar)
            id(o.baz)
        end
    `,
    expect: [
      { type: "foo", kind: "FunctionType" },
      { type: "foo", path: [{ argument: 0 }], kind: "TableType" },
      { type: "foo", path: [{ argument: 0 }, { property: "bar" }] },
      { type: "foo", path: [{ argument: 0 }, { property: "baz" }] },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:496 TEST_CASE_FIXTURE(Fixture, "table_param_width_subtyping_1")
    name: "table_param_width_subtyping_1",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        function foo(o)
            local a = o.x
            local b = o.y
            return o
        end

        foo({x=55, y=nil, w=3.14159})
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:512 TEST_CASE_FIXTURE(BuiltinsFixture, "table_param_width_subtyping_2")
    name: "table_param_width_subtyping_2",
    fixture: "BuiltinsFixture",
    ignoreMissingAnnotations: true,
    source: `
        --!strict
        function foo(o)
            string.lower(o.bar)
            string.lower(o.baz)
        end

        foo({bar='bar'})
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "MissingProperties", fields: { properties: ["baz"] } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:534 TEST_CASE_FIXTURE(Fixture, "table_param_width_subtyping_3")
    // Upstream's branch for LuauSubtypingMissingPropertiesAsNil, which is on,
    // expects no errors.
    name: "table_param_width_subtyping_3",
    fixture: "Fixture",
    source: `
        local T = {}
        T.bar = 'hello'
        function T:method()
            local a = self.baz
        end
        T:method()
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:582 TEST_CASE_FIXTURE(Fixture, "table_unification_4")
    name: "table_unification_4",
    fixture: "Fixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        function foo(o)
            if o.prop then
                return o
            else
                return {prop=false}
            end
        end
    `,
    expect: [],
  },
  {
    // TypeInfer.tables.test.cpp:600 TEST_CASE_FIXTURE(Fixture, "ok_to_add_property_to_free_table")
    name: "ok_to_add_property_to_free_table",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        function fn(d)
            d:Method()
            d.prop = true
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:614 TEST_CASE_FIXTURE(Fixture, "okay_to_add_property_to_unsealed_tables_by_assignment")
    name: "okay_to_add_property_to_unsealed_tables_by_assignment",
    fixture: "Fixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        --!strict
        local t = { u = {} }
        t = { u = { p = 37 } }
        t = { u = { q = "hi" } }
        local x = t.u.p
        local y = t.u.q
    `,
    expect: [],
  },
  {
    // TypeInfer.tables.test.cpp:633 TEST_CASE_FIXTURE(Fixture, "okay_to_add_property_to_unsealed_tables_by_function_call")
    name: "okay_to_add_property_to_unsealed_tables_by_function_call",
    fixture: "Fixture",
    source: `
        --!strict
        function get(x) return x.opts["MYOPT"] end
        function set(x,y) x.opts["MYOPT"] = y end
        local t = { opts = {} }
        set(t,37)
        local x = get(t)
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.tables.test.cpp:648 TEST_CASE_FIXTURE(Fixture, "width_subtyping")
    name: "width_subtyping",
    fixture: "Fixture",
    source: `
        --!strict
        function f(x : { q : number })
           x.q = 8
        end
        local t : { q : number, r : string } = { q = 8, r = "hi" }
        f(t)
        local x : string = t.r
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:663 TEST_CASE_FIXTURE(Fixture, "width_subtyping_needs_covariance")
    name: "width_subtyping_needs_covariance",
    fixture: "Fixture",
    source: `
        --!strict
        function f(x : { p : { q : number }})
           x.p = { q = 8, r = 5 }
        end
        local t : { p : { q : number, r : string } } = { p = { q = 8, r = "hi" } }
        f(t) -- Shouldn't typecheck
        local x : string = t.p.r -- x is 5
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.tables.test.cpp:678 TEST_CASE_FIXTURE(Fixture, "infer_array")
    name: "infer_array",
    fixture: "Fixture",
    source: `
        local t = {}
        t[1] = 'one'
        t[2] = 'two'
    `,
    expect: [
      { errors: 0 },
      { type: "t", kind: "TableType" },
      { type: "t", path: [{ indexer: "key" }], equals: "number" },
      { type: "t", path: [{ indexer: "result" }], equals: "string" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:706 TEST_CASE_FIXTURE(Fixture, "infer_array_2")
    name: "infer_array_2",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        local buttonVector = {}

        function createButton( actionName, functionInfoTable )
            local position = nil
            for i = 1,#buttonVector do
                if buttonVector[i] == "empty" then
                    position = i
                    break
                end
            end
            return position
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:727 TEST_CASE_FIXTURE(Fixture, "indexers_get_quantified_too")
    name: "indexers_get_quantified_too",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        function swap(p)
            local temp = p[0]
            p[0] = p[1]
            p[1] = temp
        end
    `,
    expect: [{ errors: 0 }, { type: "swap", equals: "<T>({T}) -> ()" }],
  },
  {
    // TypeInfer.tables.test.cpp:765 TEST_CASE_FIXTURE(Fixture, "indexers_quantification_2")
    // Upstream also checks that mergesort takes exactly one argument, and that
    // its argument and result tables are in the same state (sealed or not).
    name: "indexers_quantification_2",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        function mergesort(arr)
            local p = arr[0]
            return arr
        end
    `,
    expect: [
      { errors: 0 },
      { type: "mergesort", kind: "FunctionType" },
      { type: "mergesort", path: [{ argument: 0 }], kind: "TableType" },
      { type: "mergesort", path: [{ result: 0 }], kind: "TableType" },
      { type: "mergesort", path: [{ argument: 0 }], sameAs: { type: "mergesort", path: [{ result: 0 }] } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:797 TEST_CASE_FIXTURE(Fixture, "infer_indexer_from_array_like_table")
    name: "infer_indexer_from_array_like_table",
    fixture: "Fixture",
    source: `
        local t = {"one", "two", "three"}
    `,
    expect: [
      { errors: 0 },
      { type: "t", kind: "TableType" },
      { type: "t", path: [{ indexer: "key" }], equals: "number" },
      { type: "t", path: [{ indexer: "result" }], equals: "string" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:815 TEST_CASE_FIXTURE(Fixture, "infer_indexer_from_value_property_in_literal")
    name: "infer_indexer_from_value_property_in_literal",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        function Symbol(n)
            return { __name=n }
        end

        function f()
            return {
                [Symbol("hello")] = true,
                x = 0,
                y = 0
            }
        end
    `,
    expect: [
      { errors: 0 },
      { type: "f", kind: "FunctionType" },
      { type: "f", path: [{ result: 0 }], kind: "TableType" },
      { type: "f", path: [{ result: 0 }, { indexer: "key" }], equals: "{ __name: string }" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:849 TEST_CASE_FIXTURE(Fixture, "infer_indexer_from_its_variable_type_and_unifiable")
    name: "infer_indexer_from_its_variable_type_and_unifiable",
    fixture: "Fixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        local t1: { [string]: string } = {}
        local t2 = { "bar" }

        t2 = t1
    `,
    expect: [],
  },
  {
    // TypeInfer.tables.test.cpp:875 TEST_CASE_FIXTURE(Fixture, "indexer_mismatch")
    // Upstream also checks that t1 and t2 print differently.
    name: "indexer_mismatch",
    fixture: "Fixture",
    source: `
        local t1: { [string]: string } = {}
        local t2: { [number]: number } = {}

        t2 = t1
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "TypeMismatch", fields: { wantedType: "{number}", givenType: "{ [string]: string }" } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:897 TEST_CASE_FIXTURE(Fixture, "infer_indexer_from_its_function_return_type")
    name: "infer_indexer_from_its_function_return_type",
    fixture: "Fixture",
    source: `
        local function f(): { [number]: string }
            return {}
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:908 TEST_CASE_FIXTURE(Fixture, "infer_indexer_for_left_unsealed_table_from_right_hand_table_with_indexer")
    name: "infer_indexer_for_left_unsealed_table_from_right_hand_table_with_indexer",
    fixture: "Fixture",
    source: `
        local function f(): { [number]: string } return {} end

        local t = {}
        t = f()
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:920 TEST_CASE_FIXTURE(Fixture, "sealed_table_value_can_infer_an_indexer")
    name: "sealed_table_value_can_infer_an_indexer",
    fixture: "Fixture",
    source: `
        local t: { a: string, [number]: string } = { a = "foo" }
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:929 TEST_CASE_FIXTURE(Fixture, "array_factory_function")
    name: "array_factory_function",
    fixture: "Fixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        function empty() return {} end
        local array: {string} = empty()
    `,
    expect: [],
  },
  {
    // TypeInfer.tables.test.cpp:941 TEST_CASE_FIXTURE(Fixture, "sealed_table_indexers_must_unify")
    // Upstream's message for LuauNewTypePathErrorMessages, which is on.
    name: "sealed_table_indexers_must_unify",
    fixture: "Fixture",
    source: `
        function f(a: {number}): {string}
            return a
        end
    `,
    expect: [
      { errors: 1 },
      { error: 0, message: "Expected this to be '{string}', but got '{number}'; \nExpected the indexer result to be exactly `string`, but got `number`" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:966 TEST_CASE_FIXTURE(Fixture, "indexer_on_sealed_table_must_unify_with_free_table")
    name: "indexer_on_sealed_table_must_unify_with_free_table",
    fixture: "Fixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        function F(t): {number}
            t[4] = "hi"
            return t
        end
    `,
    expect: [],
  },
  {
    // TypeInfer.tables.test.cpp:983 TEST_CASE_FIXTURE(Fixture, "infer_type_when_indexing_from_a_table_indexer")
    name: "infer_type_when_indexing_from_a_table_indexer",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        function f(t: {string})
            return t[1]
        end

        local s = f({})
    `,
    expect: [{ errors: 0 }, { type: "s", equals: "string" }],
  },
  {
    // TypeInfer.tables.test.cpp:999 TEST_CASE_FIXTURE(BuiltinsFixture, "indexing_from_a_table_should_prefer_properties_when_possible")
    name: "indexing_from_a_table_should_prefer_properties_when_possible",
    fixture: "BuiltinsFixture",
    source: `
        function f(): { a: string, [string]: number }
            error("e")
        end

        local t = f()

        local a1 = t.a
        local a2 = t["a"]

        local b1 = t.b
        local b2 = t["b"]

        local some_indirection_variable = "foo"
        local c = t[some_indirection_variable]

        local d = t[1]
    `,
    expect: [
      { errors: 1 },
      { type: "a1", equals: "string" },
      { type: "a2", equals: "string" },
      { type: "b1", equals: "number" },
      { type: "b2", equals: "number" },
      { type: "c", equals: "number" },
      { error: 0, code: "TypeMismatch" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:1033 TEST_CASE_FIXTURE(Fixture, "any_when_indexing_into_an_unsealed_table_with_no_indexer_in_nonstrict_mode")
    name: "any_when_indexing_into_an_unsealed_table_with_no_indexer_in_nonstrict_mode",
    fixture: "Fixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        --!nonstrict

        local constants = {
            key1 = "value1",
            key2 = "value2"
        }

        local function getKey()
            return "key1"
        end

        local k1 = constants[getKey()]
    `,
    expect: [],
  },
  {
    // TypeInfer.tables.test.cpp:1057 TEST_CASE_FIXTURE(Fixture, "disallow_indexing_into_an_unsealed_table_with_no_indexer_in_strict_mode")
    name: "disallow_indexing_into_an_unsealed_table_with_no_indexer_in_strict_mode",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        local constants = {
            key1 = "value1",
            key2 = "value2"
        }

        function getConstant(key)
            return constants[key]
        end

        local k1 = getConstant("key1")
    `,
    expect: [{ type: "k1", equals: "unknown" }, { errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:1082 TEST_CASE_FIXTURE(Fixture, "assigning_to_an_unsealed_table_with_string_literal_should_infer_new_properties_over_indexer")
    // Upstream also checks that Luau's builtin string type prints as string,
    // and that t has no indexer.
    name: "assigning_to_an_unsealed_table_with_string_literal_should_infer_new_properties_over_indexer",
    fixture: "Fixture",
    source: `
        local t = {}
        t["a"] = "foo"

        local a = t.a
    `,
    expect: [
      { errors: 0 },
      { type: "t", kind: "TableType" },
      { type: "t", path: [{ property: "a" }], equals: "string" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:1108 TEST_CASE_FIXTURE(BuiltinsFixture, "oop_indexer_works")
    name: "oop_indexer_works",
    fixture: "BuiltinsFixture",
    ignoreMissingAnnotations: true,
    source: `
        local clazz = {}
        clazz.__index = clazz

        function clazz:speak()
            return "hi"
        end

        function clazz.new()
            return setmetatable({}, clazz)
        end

        local me = clazz.new()
        local words = me:speak()
    `,
    expect: [{ errors: 0 }, { type: "words", equals: "string" }],
  },
  {
    // TypeInfer.tables.test.cpp:1132 TEST_CASE_FIXTURE(BuiltinsFixture, "indexer_table")
    name: "indexer_table",
    fixture: "BuiltinsFixture",
    source: `
        local clazz = {a="hello"}
        local instanace = setmetatable({}, {__index=clazz})
        local b = instanace.a
    `,
    expect: [{ errors: 0 }, { type: "b", equals: "string" }],
  },
  {
    // TypeInfer.tables.test.cpp:1145 TEST_CASE_FIXTURE(BuiltinsFixture, "indexer_fn")
    name: "indexer_fn",
    fixture: "BuiltinsFixture",
    source: `
        local instanace = setmetatable({}, {__index=function() return 10 end})
        local b = instanace.somemethodwedonthave
    `,
    expect: [{ errors: 0 }, { type: "b", equals: "number" }],
  },
  {
    // TypeInfer.tables.test.cpp:1156 TEST_CASE_FIXTURE(BuiltinsFixture, "meta_add")
    name: "meta_add",
    fixture: "BuiltinsFixture",
    source: `
        local mt = {
            __add = function(l, r)
                return l
            end
        }
        local a = setmetatable({}, mt)
        local b = setmetatable({}, mt)
        local c = a + b
    `,
    expect: [{ errors: 0 }, { type: "a", sameAs: { type: "c" } }],
  },
  {
    // TypeInfer.tables.test.cpp:1177 TEST_CASE_FIXTURE(BuiltinsFixture, "meta_add_inferred")
    name: "meta_add_inferred",
    fixture: "BuiltinsFixture",
    source: `
        local a = {}
        setmetatable(a, {__add=function(a,b) return b end} )
        local c = a + a
    `,
    expect: [{ errors: 0 }, { type: "a", sameAs: { type: "c" } }],
  },
  {
    // TypeInfer.tables.test.cpp:1190 TEST_CASE_FIXTURE(BuiltinsFixture, "meta_add_both_ways")
    name: "meta_add_both_ways",
    fixture: "BuiltinsFixture",
    source: `
        type VectorMt = { __add: (Vector, number) -> Vector }
        local vectorMt: VectorMt
        type Vector = typeof(setmetatable({}, vectorMt))
        local a: Vector

        local b = a + 2
        local c = 2 + a
    `,
    expect: [
      { errors: 0 },
      { type: "a", equals: "Vector" },
      { type: "a", sameAs: { type: "b" } },
      { type: "a", sameAs: { type: "c" } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:1208 TEST_CASE_FIXTURE(BuiltinsFixture, "meta_add_both_ways_lti")
    name: "meta_add_both_ways_lti",
    fixture: "BuiltinsFixture",
    ignoreMissingAnnotations: true,
    source: `
        local vectorMt = {}

        function vectorMt.__add(self: Vector, other: number)
            return self
        end

        type Vector = typeof(setmetatable({}, vectorMt))
        local a: Vector = setmetatable({}, vectorMt)

        local b = a + 2
        local c = 2 + a
    `,
    expect: [
      { errors: 0 },
      { type: "a", equals: "Vector" },
      { type: "a", sameAs: { type: "b" } },
      { type: "a", sameAs: { type: "c" } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:1236 TEST_CASE_FIXTURE(BuiltinsFixture, "unification_of_unions_in_a_self_referential_type")
    // Upstream also checks that the metatables of a and b are the types of amt
    // and bmt.
    name: "unification_of_unions_in_a_self_referential_type",
    fixture: "BuiltinsFixture",
    source: `
        type A = {}
        type AMT = { __mul: (A, A | number) -> A }
        local a: A
        local amt: AMT
        setmetatable(a, amt)

        type B = {}
        type BMT = { __mul: (B, A | B | number) -> A }
        local b: B
        local bmt: BMT
        setmetatable(b, bmt)

        a = b
    `,
    expect: [
      { errors: 0 },
      { type: "a", kind: "MetatableType" },
      { type: "b", kind: "MetatableType" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:1265 TEST_CASE_FIXTURE(BuiltinsFixture, "oop_polymorphic")
    name: "oop_polymorphic",
    fixture: "BuiltinsFixture",
    ignoreMissingAnnotations: true,
    source: `
        local animal = {}
        animal.__index = animal
        function animal:isAlive() return true end
        function animal:speed() return 10 end

        local pelican = {}
        setmetatable(pelican, animal)
        pelican.__index = pelican
        function pelican:movement() return "fly" end
        function pelican:speed() return 30 end

        function pelican.new(name)
            local s = {}
            setmetatable(s, pelican)
            s.name = name
            return s
        end

        local scoops = pelican.new("scoops")

        local alive = scoops:isAlive()
        local at = scoops.isAlive
        local movement = scoops:movement()
        local name = scoops.name
        local speed = scoops:speed()
    `,
    expect: [
      { errors: 0 },
      { type: "alive", equals: "boolean" },
      { type: "movement", equals: "string" },
      { type: "name", equals: "string" },
      { type: "speed", equals: "number" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:1304 TEST_CASE_FIXTURE(Fixture, "user_defined_table_types_are_named")
    name: "user_defined_table_types_are_named",
    fixture: "Fixture",
    source: `
        type Vector3 = {x: number, y: number}

        local v: Vector3 = {x = 5, y = 7}
    `,
    expect: [{ errors: 0 }, { type: "v", equals: "Vector3" }],
  },
  {
    // TypeInfer.tables.test.cpp:1317 TEST_CASE_FIXTURE(BuiltinsFixture, "result_is_always_any_if_lhs_is_any")
    name: "result_is_always_any_if_lhs_is_any",
    fixture: "BuiltinsFixture",
    source: `
        type Vector3MT = {
            __add: (Vector3MT, Vector3MT) -> Vector3MT,
            __mul: (Vector3MT, Vector3MT|number) -> Vector3MT
        }

        local Vector3: {new: (number?, number?, number?) -> Vector3MT}
        local Vector3MT: Vector3MT
        setmetatable(Vector3, Vector3MT)

        type CFrameMT = {
            __mul: (CFrameMT, Vector3MT|CFrameMT) -> Vector3MT|CFrameMT
        }

        local CFrame: {
            Angles:(number, number, number) -> CFrameMT
        }
        local CFrameMT: CFrameMT
        setmetatable(CFrame, CFrameMT)

        local n: any
        local a = (n + Vector3.new(0, 1.5, 0)) * CFrame.Angles(0, math.pi/2, 0)
    `,
    expect: [{ errors: 0 }, { type: "a", equals: "any" }],
  },
  {
    // TypeInfer.tables.test.cpp:1348 TEST_CASE_FIXTURE(Fixture, "result_is_bool_for_equality_operators_if_lhs_is_any")
    name: "result_is_bool_for_equality_operators_if_lhs_is_any",
    fixture: "Fixture",
    source: `
        function f(): (any, number)
            return 5, 7
        end

        local a: any, b: number = f()

        local c = a < b
    `,
    expect: [{ errors: 0 }, { type: "c", equals: "boolean" }],
  },
  {
    // TypeInfer.tables.test.cpp:1365 TEST_CASE_FIXTURE(Fixture, "inequality_operators_imply_exactly_matching_types")
    name: "inequality_operators_imply_exactly_matching_types",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        function abs(n)
            if n < 0 then
                return -n
            else
                return n
            end
        end
    `,
    expect: [{ errors: 0 }, { type: "abs", equals: "(number) -> number" }],
  },
  {
    // TypeInfer.tables.test.cpp:1382 TEST_CASE_FIXTURE(Fixture, "nice_error_when_trying_to_fetch_property_of_boolean")
    name: "nice_error_when_trying_to_fetch_property_of_boolean",
    fixture: "Fixture",
    source: `
        local a = true
        local b = a.some_prop
    `,
    expect: [{ errors: 1 }, { error: 0, message: "Type 'boolean' does not have key 'some_prop'" }],
  },
  {
    // TypeInfer.tables.test.cpp:1394 TEST_CASE_FIXTURE(BuiltinsFixture, "defining_a_method_for_a_builtin_sealed_table_must_fail")
    name: "defining_a_method_for_a_builtin_sealed_table_must_fail",
    fixture: "BuiltinsFixture",
    source: `
        function string.m() end
    `,
    expect: [{ errors: 1 }],
  },
  {
    // TypeInfer.tables.test.cpp:1403 TEST_CASE_FIXTURE(BuiltinsFixture, "defining_a_self_method_for_a_builtin_sealed_table_must_fail")
    name: "defining_a_self_method_for_a_builtin_sealed_table_must_fail",
    fixture: "BuiltinsFixture",
    source: `
        function string:m() end
    `,
    expect: [{ errors: 1 }],
  },
  {
    // TypeInfer.tables.test.cpp:1412 TEST_CASE_FIXTURE(Fixture, "defining_a_method_for_a_local_sealed_table_must_fail")
    name: "defining_a_method_for_a_local_sealed_table_must_fail",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        function mkt() return {x = 1} end
        local t = mkt()
        function t.m() end
    `,
    expect: [{ errors: 1 }],
  },
  {
    // TypeInfer.tables.test.cpp:1424 TEST_CASE_FIXTURE(Fixture, "defining_a_self_method_for_a_local_sealed_table_must_fail")
    name: "defining_a_self_method_for_a_local_sealed_table_must_fail",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        function mkt() return {x = 1} end
        local t = mkt()
        function t:m() end
    `,
    expect: [{ errors: 1 }],
  },
  {
    // TypeInfer.tables.test.cpp:1436 TEST_CASE_FIXTURE(Fixture, "defining_a_method_for_a_local_unsealed_table_is_ok")
    name: "defining_a_method_for_a_local_unsealed_table_is_ok",
    fixture: "Fixture",
    source: `
        local t = {x = 1}
        function t.m() end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:1446 TEST_CASE_FIXTURE(Fixture, "defining_a_self_method_for_a_local_unsealed_table_is_ok")
    name: "defining_a_self_method_for_a_local_unsealed_table_is_ok",
    fixture: "Fixture",
    source: `
        local t = {x = 1}
        function t:m() end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:1457 TEST_CASE_FIXTURE(Fixture, "pass_incompatible_union_to_a_generic_table_without_crashing")
    name: "pass_incompatible_union_to_a_generic_table_without_crashing",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        -- must be in this specific order, and with (roughly) those exact properties!
        type A = {x: number, [any]: any} | {}

        function f(t)
            t.y = 1
        end

        function g(a: A)
            f(a)
        end
    `,
    expect: [{ errors: 1 }, { error: 0, code: "TypeMismatch" }],
  },
  {
    // TypeInfer.tables.test.cpp:1479 TEST_CASE_FIXTURE(Fixture, "passing_compatible_unions_to_a_generic_table_without_crashing")
    name: "passing_compatible_unions_to_a_generic_table_without_crashing",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        type A = {x: number, y: number, [any]: any} | {y: number}

        function f(t)
            t.y = 1
        end

        function g(a: A)
            f(a)
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:1497 TEST_CASE_FIXTURE(Fixture, "found_like_key_in_table_function_call")
    // Upstream also checks that the error's table prints as t's type does, and
    // that its only candidate is Foo.
    name: "found_like_key_in_table_function_call",
    fixture: "Fixture",
    source: `
        local t = {}
        function t.Foo() end

        t.fOo()
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "UnknownPropButFoundLikeProp", fields: { key: "fOo" } },
      { error: 0, message: "Key 'fOo' not found in table 't'.  Did you mean 'Foo'?" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:1523 TEST_CASE_FIXTURE(BuiltinsFixture, "found_like_key_in_table_property_access")
    // Upstream also checks that the error's table prints as t's type does, and
    // that its only candidate is X.
    name: "found_like_key_in_table_property_access",
    fixture: "BuiltinsFixture",
    source: `
        local t = {X = 1}

        print(t.x)
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "UnknownPropButFoundLikeProp", fields: { key: "x" } },
      { error: 0, message: "Key 'x' not found in table 't'.  Did you mean 'X'?" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:1548 TEST_CASE_FIXTURE(BuiltinsFixture, "found_multiple_like_keys")
    // Upstream also checks that the error's table prints as t's type does, and
    // that its candidates are exactly Foo and foO.
    name: "found_multiple_like_keys",
    fixture: "BuiltinsFixture",
    source: `
        local t = {Foo = 1, foO = 2}

        print(t.foo)
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "UnknownPropButFoundLikeProp", fields: { key: "foo" } },
      { error: 0, message: "Key 'foo' not found in table 't'.  Did you mean one of 'Foo', 'foO'?" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:1574 TEST_CASE_FIXTURE(BuiltinsFixture, "dont_suggest_exact_match_keys")
    name: "dont_suggest_exact_match_keys",
    fixture: "BuiltinsFixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        local t = {}
        t.foO = 1
        print(t.Foo)
        t.Foo = 2
    `,
    expect: [],
  },
  {
    // TypeInfer.tables.test.cpp:1604 TEST_CASE_FIXTURE(BuiltinsFixture, "getmetatable_returns_pointer_to_metatable")
    name: "getmetatable_returns_pointer_to_metatable",
    fixture: "BuiltinsFixture",
    source: `
        local t = {x = 1}
        local mt = {__index = {y = 2}}
        setmetatable(t, mt)

        local returnedMT = getmetatable(t)
    `,
    expect: [{ type: "mt", sameAs: { type: "returnedMT" } }],
  },
  {
    // TypeInfer.tables.test.cpp:1617 TEST_CASE_FIXTURE(BuiltinsFixture, "metatable_mismatch_should_fail")
    name: "metatable_mismatch_should_fail",
    fixture: "BuiltinsFixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        local t1 = {x = 1}
        local mt1 = {__index = {y = 2}}
        setmetatable(t1, mt1)

        local t2 = {x = 1}
        local mt2 = {__index = function() return nil end}
        setmetatable(t2, mt2)

        t1 = t2
    `,
    expect: [],
  },
  {
    // TypeInfer.tables.test.cpp:1642 TEST_CASE_FIXTURE(BuiltinsFixture, "property_lookup_through_tabletypevar_metatable")
    name: "property_lookup_through_tabletypevar_metatable",
    fixture: "BuiltinsFixture",
    source: `
        local t = {x = 1}
        local mt = {__index = {y = 2}}
        setmetatable(t, mt)

        print(t.x)
        print(t.y)
        print(t.z)
    `,
    expect: [{ errors: 1 }, { error: 0, code: "UnknownProperty", fields: { key: "z" } }],
  },
  {
    // TypeInfer.tables.test.cpp:1661 TEST_CASE_FIXTURE(BuiltinsFixture, "missing_metatable_for_sealed_tables_do_not_get_inferred")
    name: "missing_metatable_for_sealed_tables_do_not_get_inferred",
    fixture: "BuiltinsFixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        local t = {x = 1}

        local a = {x = 1}
        local b = {__index = {y = 2}}
        setmetatable(a, b)

        t = a
    `,
    expect: [],
  },
  {
    // TypeInfer.tables.test.cpp:1696 TEST_CASE_FIXTURE(Fixture, "right_table_missing_key")
    // Upstream checks only that there are at least 0 errors, which always
    // holds: the case checks that checking finishes.
    name: "right_table_missing_key",
    fixture: "Fixture",
    source: `
        function _(...)
        end
        local l7 = not _,function(l0)
        _ += _((_) or {function(...)
        end,["z"]=_,} or {},(function(l43,...)
        end))
        _ += 0 < {}
        end
        repeat
        until _
        local l0 = n4,_((_) or {} or {[30976]=_,},({}))
    `,
    expect: [],
  },
  {
    // TypeInfer.tables.test.cpp:1716 TEST_CASE_FIXTURE(Fixture, "right_table_missing_key2")
    name: "right_table_missing_key2",
    fixture: "Fixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        function f(t: {}): { [string]: string, a: string }
            return t
        end
    `,
    expect: [],
  },
  {
    // TypeInfer.tables.test.cpp:1739 TEST_CASE_FIXTURE(Fixture, "casting_unsealed_tables_with_props_into_table_with_indexer")
    name: "casting_unsealed_tables_with_props_into_table_with_indexer",
    fixture: "Fixture",
    source: `
        type StringToStringMap = { [string]: string }
        local rt: StringToStringMap = { ["foo"] = 1 }
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "TypeMismatch", fields: { wantedType: "string", givenType: "number" } },
      { error: 0, location: [2, 50, 2, 51] },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:1768 TEST_CASE_FIXTURE(Fixture, "casting_sealed_tables_with_props_into_table_with_indexer")
    // Upstream prints the wanted and given types exhaustively, and also checks
    // that the wanted type then prints as `{ [string]: string }`; printed by
    // default, as fields are compared, it keeps its alias name.
    name: "casting_sealed_tables_with_props_into_table_with_indexer",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        type StringToStringMap = { [string]: string }
        function mkrt() return { ["foo"] = 1 } end
        local rt: StringToStringMap = mkrt()
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "TypeMismatch", fields: { givenType: "{ foo: number }" } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:1786 TEST_CASE_FIXTURE(Fixture, "casting_tables_with_props_into_table_with_indexer2")
    name: "casting_tables_with_props_into_table_with_indexer2",
    fixture: "Fixture",
    source: `
        local function foo(x: {[string]: number, a: string}) end
        foo({ a = "" })
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:1796 TEST_CASE_FIXTURE(Fixture, "casting_tables_with_props_into_table_with_indexer3")
    name: "casting_tables_with_props_into_table_with_indexer3",
    fixture: "Fixture",
    source: `
        local function foo(a: {[string]: number, a: string}) end
        foo({ a = 1 })
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "TypeMismatch", fields: { wantedType: "string", givenType: "number" } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:1821 TEST_CASE_FIXTURE(Fixture, "casting_tables_with_props_into_table_with_indexer4")
    name: "casting_tables_with_props_into_table_with_indexer4",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        local function foo(a: {[string]: number, a: string}, i: string)
            return a[i]
        end
        local hi: number = foo({ a = "hi" }, "a") -- shouldn't typecheck since at runtime hi is "hi"
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:1835 TEST_CASE_FIXTURE(Fixture, "table_subtyping_with_missing_props_dont_report_multiple_errors")
    name: "table_subtyping_with_missing_props_dont_report_multiple_errors",
    fixture: "Fixture",
    source: `
        function f(vec1: {x: number}): {x: number, y: number, z: number}
            return vec1
        end
    `,
    expect: [
      { errors: 1 },
      { error: 0, message: "Expected this to be\n\t'{ x: number, y: number, z: number }'\nbut got\n\t'{ x: number }'" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:1867 TEST_CASE_FIXTURE(Fixture, "table_subtyping_with_missing_props_dont_report_multiple_errors2")
    name: "table_subtyping_with_missing_props_dont_report_multiple_errors2",
    fixture: "Fixture",
    source: `
        type MixedTable = {[number]: number, x: number}
        local t: MixedTable = {"fail"}
    `,
    expect: [
      { errors: 2 },
      { error: 0, code: "TypeMismatch", fields: { wantedType: "number", givenType: "string" } },
      { error: 1, code: "MissingProperties", fields: { context: "Missing", properties: ["x"] } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:1892 TEST_CASE_FIXTURE(Fixture, "table_subtyping_with_extra_props_dont_report_multiple_errors")
    name: "table_subtyping_with_extra_props_dont_report_multiple_errors",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        function mkvec3() return {x = 1, y = 2, z = 3} end
        function mkvec1() return {x = 1} end

        local vec3: {{x: number, y: number, z: number}} = {mkvec3()}
        local vec1: {{x: number}} = {mkvec1()}

        vec1 = vec3
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "TypeMismatch", fields: { wantedType: "{{ x: number }}", givenType: "{{ x: number, y: number, z: number }}" } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:1914 TEST_CASE_FIXTURE(Fixture, "table_subtyping_with_extra_props_is_ok")
    name: "table_subtyping_with_extra_props_is_ok",
    fixture: "Fixture",
    source: `
        local vec3 = {x = 1, y = 2, z = 3}
        local vec1 = {x = 1}

        vec1 = vec3
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:1926 TEST_CASE_FIXTURE(Fixture, "type_mismatch_on_massive_table_is_cut_short")
    name: "type_mismatch_on_massive_table_is_cut_short",
    fixture: "Fixture",
    limits: { LuauTableTypeMaximumStringifierLength: 40 },
    source: `
        local t: {a: number,b: number, c: number, d: number, e: number, f: number} = nil :: any
        t = 1
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "TypeMismatch", fields: { givenType: "number" } },
      { type: "t", equals: "{ a: number, b: number, c: number, d: number, e: number, ... 1 more ... }" },
      { error: 0, message: "Expected this to be '{ a: number, b: number, c: number, d: number, e: number, ... 1 more ... }', but got 'number'" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:1950 TEST_CASE_FIXTURE(Fixture, "ok_to_set_nil_even_on_non_lvalue_base_expr")
    // Upstream declares the extern type FancyHashtable with loadDefinition
    // before the last two checks.
    name: "ok_to_set_nil_even_on_non_lvalue_base_expr",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local function f(): { [string]: number }
            return { ["foo"] = 1 }
        end

        f()["foo"] = nil
    `,
        expect: [{ errors: 0 }],
      },
      {
        source: `
        local function f(
            t: {known_prop: boolean, [string]: number},
            key: string
        )
            t[key] = nil
            t["hello"] = nil
            t.undefined = nil
        end
    `,
        expect: [{ errors: 0 }],
      },
      {
        source: `
        local function f(t: {known_prop: boolean, [string]: number, })
            t.known_prop = nil
        end
    `,
        expect: [
          { errors: 1 },
          { error: 0, location: [2, 27, 2, 30] },
          { error: 0, message: "Expected this to be 'boolean', but got 'nil'" },
        ],
      },
      {
        notApplicable: "uses an extern type, which a Luau host defines in C++ or a definition file; Sparkdown has neither",
        source: `
        local function removekey(fh: FancyHashtable, other_key: string)
            fh["hmmm"] = nil
            fh[other_key] = nil
            fh.dne = nil
        end
    `,
        expect: [{ errors: 0 }],
      },
      {
        notApplicable: "uses an extern type, which a Luau host defines in C++ or a definition file; Sparkdown has neither",
        source: `
        local function removekey(fh: FancyHashtable)
            fh.real_property = nil
        end
    `,
        expect: [
          { errors: 1 },
          { error: 0, location: [2, 31, 2, 34] },
          { error: 0, message: "Expected this to be 'string', but got 'nil'" },
        ],
      },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:2009 TEST_CASE_FIXTURE(Fixture, "ok_to_set_nil_on_generic_map")
    name: "ok_to_set_nil_on_generic_map",
    fixture: "Fixture",
    source: `
        type MyMap<K, V> = { [K]: V }
        function set<K, V>(m: MyMap<K, V>, k: K, v: V)
            m[k] = v
        end
        function unset<K, V>(m: MyMap<K, V>, k: K)
            m[k] = nil
        end
        local m: MyMap<string, boolean> = {}
        set(m, "foo", true)
        unset(m, "foo")
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:2025 TEST_CASE_FIXTURE(Fixture, "key_setting_inference_given_nil_upper_bound")
    name: "key_setting_inference_given_nil_upper_bound",
    fixture: "Fixture",
    checks: [
      {
        ignoreMissingAnnotations: true,
        source: `
        local function setkey_object(t: { [string]: number }, v)
            t.foo = v
            t.foo = nil
        end
        local function setkey_constindex(t: { [string]: number }, v)
            t["foo"] = v
            t["foo"] = nil
        end
        local function setkey_unknown(t: { [string]: number }, k, v)
            t[k] = v
            t[k] = nil
        end
    `,
        expect: [
          { errors: 0 },
          { type: "setkey_object", equals: "({ [string]: number }, number) -> ()" },
          { type: "setkey_constindex", equals: "({ [string]: number }, number) -> ()" },
          { type: "setkey_unknown", equals: "({ [string]: number }, string, number) -> ()" },
        ],
      },
      {
        ignoreMissingAnnotations: true,
        source: `
        local function on_number(v: number): () end
        local function setkey_object(t: { [string]: number }, v)
            t.foo = v
            on_number(v)
        end
    `,
        expect: [
          { errors: 0 },
          { type: "setkey_object", equals: "({ [string]: number }, number) -> ()" },
        ],
      },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:2060 TEST_CASE_FIXTURE(Fixture, "explicit_nil_indexer")
    name: "explicit_nil_indexer",
    fixture: "Fixture",
    source: `
        local function _(t: { [string]: number? }): number
            return t.hello
        end
    `,
    expect: [
      { errors: 1 },
      { error: 0, location: [2, 19, 2, 26] },
      { error: 0, code: "TypeMismatch" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:2075 TEST_CASE_FIXTURE(Fixture, "ok_to_provide_a_subtype_during_construction")
    name: "ok_to_provide_a_subtype_during_construction",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        local a: string | number = 1
        local t = {a, 1}
    `,
    expect: [
      { errors: 0 },
      { type: "t", equals: "{number | string}", options: { exhaustive: true } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:2086 TEST_CASE_FIXTURE(Fixture, "reasonable_error_when_adding_a_nonexistent_property_to_an_array_like_table")
    name: "reasonable_error_when_adding_a_nonexistent_property_to_an_array_like_table",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        --!strict
        function mkA() return {"value"} end
        local A = mkA()
        A.B = "Hello"
    `,
    expect: [{ errors: 1 }, { error: 0, code: "CannotExtendTable", fields: { prop: "B" } }],
  },
  {
    // TypeInfer.tables.test.cpp:2114 TEST_CASE_FIXTURE(Fixture, "shorter_array_types_actually_work")
    name: "shorter_array_types_actually_work",
    fixture: "Fixture",
    source: `
        --!strict
        local A: {string | number}
    `,
    expect: [{ errors: 0 }, { type: "A", equals: "{number | string}" }],
  },
  {
    // TypeInfer.tables.test.cpp:2125 TEST_CASE_FIXTURE(Fixture, "only_ascribe_synthetic_names_at_module_scope")
    name: "only_ascribe_synthetic_names_at_module_scope",
    fixture: "Fixture",
    source: `
        --!strict
        local TopLevel = {}
        local foo

        for i = 1, 10 do
            local SubScope = { 1, 2, 3 }
            foo = SubScope
        end
    `,
    expect: [
      { errors: 0 },
      { type: "TopLevel", equals: "TopLevel" },
      { type: "foo", equals: "{number}?" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:2148 TEST_CASE_FIXTURE(Fixture, "hide_table_error_properties")
    name: "hide_table_error_properties",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        --!strict

        local function f()
        local function mkt() return { x = 1 } end
        local t = mkt()

        function t.a() end
        function t.b() end

        return t
        end
    `,
    expect: [
      { errors: 2 },
      { error: 0, message: "Cannot add property 'a' to table '{ x: number }'" },
      { error: 1, message: "Cannot add property 'b' to table '{ x: number }'" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:2172 TEST_CASE_FIXTURE(BuiltinsFixture, "builtin_table_names")
    name: "builtin_table_names",
    fixture: "BuiltinsFixture",
    source: `
        os.h = 2
        string.k = 3
    `,
    expect: [
      { errors: 2 },
      { error: 0, message: "Cannot add property 'h' to table 'typeof(os)'" },
      { error: 1, message: "Cannot add property 'k' to table 'typeof(string)'" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:2185 TEST_CASE_FIXTURE(BuiltinsFixture, "persistent_sealed_table_is_immutable")
    // Upstream also checks that os still has no property bad.
    name: "persistent_sealed_table_is_immutable",
    fixture: "BuiltinsFixture",
    source: `
        function os:bad() end
    `,
    expect: [
      { errors: 1 },
      { error: 0, message: "Cannot add property 'bad' to table 'typeof(os)'" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:2199 TEST_CASE_FIXTURE(Fixture, "common_table_element_list")
    name: "common_table_element_list",
    fixture: "Fixture",
    source: `
type Table = {
    a: number,
    b: number?
}

local Test: {Table} = {
    { a = 1 },
    { a = 2, b = 3 }
}
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:2216 TEST_CASE_FIXTURE(Fixture, "common_table_element_general")
    name: "common_table_element_general",
    fixture: "Fixture",
    source: `
        type Table = {
            a: number,
            b: number?
        }

        local Test: {Table} = {
            [2] = { a = 1 },
            [5] = { a = 2, b = 3 }
        }
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:2233 TEST_CASE_FIXTURE(Fixture, "common_table_element_inner_index")
    name: "common_table_element_inner_index",
    fixture: "Fixture",
    source: `
type Table = {
    a: number,
    b: number?
}

local Test: {{Table}} = {{
    { a = 1 },
    { a = 2, b = 3 }
},{
    { a = 3 },
    { a = 4, b = 3 }
}}
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:2253 TEST_CASE_FIXTURE(Fixture, "common_table_element_inner_prop")
    name: "common_table_element_inner_prop",
    fixture: "Fixture",
    source: `
type Table = {
    a: number,
    b: number?
}

local Test: {{x: Table, y: Table}} = {{
    x = { a = 1 },
    y = { a = 2, b = 3 }
},{
    x = { a = 3 },
    y = { a = 4 }
}}
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:2273 TEST_CASE_FIXTURE(Fixture, "common_table_element_union_assignment")
    name: "common_table_element_union_assignment",
    fixture: "Fixture",
    source: `
type Foo = {x: number | string}

local foos: {Foo} = {
    {x = 1234567},
    {x = "hello"},
}
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:2287 TEST_CASE_FIXTURE(BuiltinsFixture, "quantifying_a_bound_var_works")
    // Upstream also checks that new returns exactly one value, and that the
    // table inside its metatable type is sealed.
    name: "quantifying_a_bound_var_works",
    fixture: "BuiltinsFixture",
    ignoreMissingAnnotations: true,
    source: `
        local clazz = {}
        clazz.__index = clazz

        function clazz:speak()
            return "hi"
        end

        function clazz.new()
            return setmetatable({}, clazz)
        end
    `,
    expect: [
      { errors: 0 },
      { type: "clazz", kind: "TableType" },
      { type: "clazz", path: [{ property: "new" }], kind: "FunctionType" },
      { type: "clazz", path: [{ property: "new" }, { result: 0 }], kind: "MetatableType" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:2322 TEST_CASE_FIXTURE(Fixture, "common_table_element_union_in_call")
    name: "common_table_element_union_in_call",
    fixture: "Fixture",
    source: `
local function foo(l: {{x: number | string}}) end

foo({
    {x = 1234567},
    {x = "hello"},
})
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:2336 TEST_CASE_FIXTURE(Fixture, "common_table_element_union_in_call_tail")
    name: "common_table_element_union_in_call_tail",
    fixture: "Fixture",
    source: `
        type Foo = {x: number | string}
        local function foo(l: {Foo}, ...: {Foo}) end

        foo(
            {{x = 1234567}, {x = "hello"}},
            {{x = 1234567}, {x = "hello"}},
            {{x = 1234567}, {x = "hello"}}
        )
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:2352 TEST_CASE_FIXTURE(Fixture, "common_table_element_union_in_prop")
    name: "common_table_element_union_in_prop",
    fixture: "Fixture",
    source: `
type Foo = {x: number | string}
local t: { a: {Foo}, b: number } = {
    a = {
        {x = 1234567},
        {x = "hello"},
    },
    b = 5
}
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:2370 TEST_CASE_FIXTURE(Fixture, "invariant_table_properties_means_instantiating_tables_in_assignment_is_unsound")
    // Upstream sets LuauInstantiateInSubtyping to the opposite of
    // DebugLuauForceOldSolver, so on for the new solver.
    name: "invariant_table_properties_means_instantiating_tables_in_assignment_is_unsound",
    fixture: "Fixture",
    flags: { LuauInstantiateInSubtyping: true },
    ignoreMissingAnnotations: true,
    source: `
        --!strict
        local t = {}
        function t.m(x) return x end
        local a : string = t.m("hi")
        local b : number = t.m(5)
        local u : { m : (number)->number } = t -- This shouldn't typecheck
        u.m = function(x) return 1+x end
        local c : string = t.m("hi")
    `,
    expect: [
      { errors: 2 },
      { anyError: "ExplicitFunctionAnnotationRecommended" },
      { anyError: "TypeMismatch" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:2399 TEST_CASE_FIXTURE(BuiltinsFixture, "table_insert_should_cope_with_optional_properties_in_nonstrict")
    name: "table_insert_should_cope_with_optional_properties_in_nonstrict",
    fixture: "BuiltinsFixture",
    source: `
        --!nonstrict
        local buttons = {}
        table.insert(buttons, { a = 1 })
        table.insert(buttons, { a = 2, b = true })
        table.insert(buttons, { a = 3 })
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:2412 TEST_CASE_FIXTURE(BuiltinsFixture, "table_insert_should_cope_with_optional_properties_in_strict")
    name: "table_insert_should_cope_with_optional_properties_in_strict",
    fixture: "BuiltinsFixture",
    flags: { DebugLuauAssertOnForcedConstraint: true, LuauRemovePrimitiveTypeConstraintAndSubtypingUnifier: true },
    source: `
        --!strict
        local buttons = {}
        table.insert(buttons, { a = 1 })
        table.insert(buttons, { a = 2, b = true })
        table.insert(buttons, { a = 3 })
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:2431 TEST_CASE_FIXTURE(BuiltinsFixture, "cli_186992_accidental_dropping_free_ty_bounds")
    name: "cli_186992_accidental_dropping_free_ty_bounds",
    fixture: "BuiltinsFixture",
    source: `
        local lines = {}
        table.insert(lines, table.concat({}, ""))
        print(table.concat(lines, "\\n"))
    `,
    expect: [{ errors: 0 }, { type: "lines", equals: "{string}", options: { exhaustive: true } }],
  },
  {
    // TypeInfer.tables.test.cpp:2442 TEST_CASE_FIXTURE(Fixture, "error_detailed_prop")
    name: "error_detailed_prop",
    fixture: "Fixture",
    source: `
type A = { x: number, y: number }
type B = { x: number, y: string }

local a: A = { x = 123, y = 456 }
local b: B = a
    `,
    expect: [
      { errors: "some" },
      { error: 0, message: "Expected this to be 'B', but got 'A'; \nExpected property `y` to be exactly `string`, but got `number`" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:2478 TEST_CASE_FIXTURE(Fixture, "error_detailed_prop_nested")
    name: "error_detailed_prop_nested",
    fixture: "Fixture",
    source: `
type AS = { x: number, y: number }
type BS = { x: number, y: string }

type A = { a: boolean, b: AS }
type B = { a: boolean, b: BS }

local a: A = { a = false, b = { x = 123, y = 456 } }
local b: B = a
    `,
    expect: [
      { errors: "some" },
      { error: 0, message: "Expected this to be 'B', but got 'A'; \nExpected property `b.y` to be exactly `string`, but got `number`" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:2520 TEST_CASE_FIXTURE(BuiltinsFixture, "error_detailed_metatable_prop")
    // Upstream's message for LuauNewTypePathErrorMessages, which is on.
    name: "error_detailed_metatable_prop",
    fixture: "BuiltinsFixture",
    flags: { LuauInstantiateInSubtyping: true },
    unparsed: { defect: 919 }, // a ; right after the value of a local
    source: `
local a1 = setmetatable({ x = 2, y = 3 }, { __call = function(s) end });
local b1 = setmetatable({ x = 2, y = "hello" }, { __call = function(s) end });
local c1: typeof(a1) = b1

local a2 = setmetatable({ x = 2, y = 3 }, { __call = function(s) end });
local b2 = setmetatable({ x = 2, y = 4 }, { __call = function(s, t) end });
local c2: typeof(a2) = b2
    `,
    expect: [
      { errors: 1 },
      { error: 0, message: "Expected this to be 'a1', but got 'b1'; \nExpected property `y` of the table portion to be exactly `number`, but got `string`" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:2596 TEST_CASE_FIXTURE(Fixture, "error_detailed_indexer_key")
    name: "error_detailed_indexer_key",
    fixture: "Fixture",
    source: `
        type A = { [number]: string }
        type B = { [string]: string }

        local a: A = { 'a', 'b' }
        local b: B = a
    `,
    expect: [
      { errors: "some" },
      { error: 0, message: "Expected this to be 'B', but got 'A'; \nExpected the indexer key type to be exactly `string`, but got `number`" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:2632 TEST_CASE_FIXTURE(Fixture, "error_detailed_indexer_value")
    name: "error_detailed_indexer_value",
    fixture: "Fixture",
    source: `
        type A = { [number]: number }
        type B = { [number]: string }

        local a: A = { 1, 2, 3 }
        local b: B = a
    `,
    expect: [
      { errors: "some" },
      { error: 0, message: "Expected this to be 'B', but got 'A'; \nExpected the indexer result to be exactly `string`, but got `number`" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:2668 TEST_CASE_FIXTURE(Fixture, "explicitly_typed_table")
    name: "explicitly_typed_table",
    fixture: "Fixture",
    source: `
--!strict
type Super = { x : number }
type Sub = { x : number, y: number }
type HasSuper = { p : Super }
type HasSub = { p : Sub }
local a: HasSuper = { p = { x = 5, y = 7 }}
a.p = { x = 9 }
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:2683 TEST_CASE_FIXTURE(Fixture, "explicitly_typed_table_error")
    name: "explicitly_typed_table_error",
    fixture: "Fixture",
    source: `
--!strict
type Super = { x : number }
type Sub = { x : number, y: number }
type HasSuper = { p : Super }
type HasSub = { p : Sub }
local tmp = { p = { x = 5, y = 7 }}
local a: HasSuper = tmp
a.p = { x = 9 }
-- needs to be an error because
local y: number = tmp.p.y
    `,
    expect: [
      { errors: 1 },
      { error: 0, message: "Expected this to be 'HasSuper', but got 'tmp'; \nExpected property `p` to be exactly `Super`, but got `{ x: number, y: number }`" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:2724 TEST_CASE_FIXTURE(Fixture, "explicitly_typed_table_with_indexer")
    name: "explicitly_typed_table_with_indexer",
    fixture: "Fixture",
    source: `
        --!strict
        type Super = { x : number }
        type Sub = { x : number, y: number }
        type HasSuper = { [string] : Super }
        type HasSub = { [string] : Sub }
        local a: HasSuper = { p = { x = 5, y = 7 }}
        a.p = { x = 9 }
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:2739 TEST_CASE_FIXTURE(BuiltinsFixture, "recursive_metatable_type_call")
    name: "recursive_metatable_type_call",
    fixture: "BuiltinsFixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
local b
b = setmetatable({}, {__call = b})
b()
    `,
    expect: [],
  },
  {
    // TypeInfer.tables.test.cpp:2755 TEST_CASE_FIXTURE(Fixture, "table_subtyping_shouldn't_add_optional_properties_to_sealed_tables")
    name: "table_subtyping_shouldn't_add_optional_properties_to_sealed_tables",
    fixture: "Fixture",
    source: `
        --!strict
        local function setNumber(t: { p: number? }, x:number) t.p = x end
        local function getString(t: { p: string? }):string return t.p or "" end
        -- This shouldn't type-check!
        local function oh(x:number): string
          local t: {} = {}
          setNumber(t, x)
          return getString(t)
        end
        local s: string = oh(37)
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.tables.test.cpp:2773 TEST_CASE_FIXTURE(Fixture, "top_table_type")
    name: "top_table_type",
    fixture: "Fixture",
    source: `
        --!strict
        type Table = { [any] : any }
        type HasTable = { p: Table? }
        type HasHasTable = { p: HasTable? }
        local t : Table = { p = 5 }
        local u : HasTable = { p = { p = 5 } }
        local v : HasHasTable = { p = { p = { p = 5 } } }
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:2788 TEST_CASE_FIXTURE(Fixture, "length_operator_union")
    name: "length_operator_union",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
local x: {number} | {string}
local y = #x
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:2798 TEST_CASE_FIXTURE(Fixture, "length_operator_intersection")
    name: "length_operator_intersection",
    fixture: "Fixture",
    source: `
local x: {number} & {z:string} -- mixed tables are evil
local y = #x
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:2808 TEST_CASE_FIXTURE(Fixture, "length_operator_non_table_union")
    name: "length_operator_non_table_union",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
local x: {number} | any | string
local y = #x
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:2818 TEST_CASE_FIXTURE(Fixture, "length_operator_union_errors")
    name: "length_operator_union_errors",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
local x: {number} | number | string
local y = #x
    `,
    expect: [{ errors: 2 }],
  },
  {
    // TypeInfer.tables.test.cpp:2831 TEST_CASE_FIXTURE(BuiltinsFixture, "dont_hang_when_trying_to_look_up_in_cyclic_metatable_index")
    name: "dont_hang_when_trying_to_look_up_in_cyclic_metatable_index",
    fixture: "BuiltinsFixture",
    ignoreMissingAnnotations: true,
    source: `
        local mt = {}
        local t = setmetatable({}, mt)
        mt.__index = t

        function mt:__tostring()
            return t.p
        end
    `,
    expect: [{ errors: 1 }, { error: 0, message: "Type 't' does not have key 'p'" }],
  },
  {
    // TypeInfer.tables.test.cpp:2849 TEST_CASE_FIXTURE(BuiltinsFixture, "give_up_after_one_metatable_index_look_up")
    name: "give_up_after_one_metatable_index_look_up",
    fixture: "BuiltinsFixture",
    source: `
        local data = { x = 5 }
        local t1 = setmetatable({}, { __index = data })
        local t2 = setmetatable({}, t1) -- note: must be t1, not a new table

        local x1 = t1.x -- ok
        local x2 = t2.x -- nope
    `,
    expect: [{ errors: 1 }, { error: 0, message: "Type 't2' does not have key 'x'" }],
  },
  {
    // TypeInfer.tables.test.cpp:2864 TEST_CASE_FIXTURE(Fixture, "confusing_indexing")
    name: "confusing_indexing",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        type T = {} & {p: number | string}
        local function f(t: T)
            return t.p
        end

        local foo = f({p = "string"})
    `,
    expect: [{ errors: 0 }, { type: "foo", equals: "number | string" }],
  },
  {
    // TypeInfer.tables.test.cpp:2880 TEST_CASE_FIXTURE(Fixture, "pass_a_union_of_tables_to_a_function_that_requires_a_table")
    name: "pass_a_union_of_tables_to_a_function_that_requires_a_table",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        local a: {x: number, y: number, [any]: any} | {y: number}

        function f(t)
            t.y = 1
            return t
        end

        local b = f(a)
    `,
    expect: [{ errors: 0 }, { type: "b", equals: "{ y: number }" }],
  },
  {
    // TypeInfer.tables.test.cpp:2902 TEST_CASE_FIXTURE(Fixture, "pass_a_union_of_tables_to_a_function_that_requires_a_table_2")
    name: "pass_a_union_of_tables_to_a_function_that_requires_a_table_2",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        local a: {y: number} | {x: number, y: number, [any]: any}

        function f(t)
            t.y = 1
            return t
        end

        local b = f(a)
    `,
    expect: [{ errors: 0 }, { type: "b", equals: "{ y: number }" }],
  },
  {
    // TypeInfer.tables.test.cpp:2924 TEST_CASE_FIXTURE(Fixture, "unifying_tables_shouldnt_uaf1")
    name: "unifying_tables_shouldnt_uaf1",
    fixture: "Fixture",
    source: `
-- This example produced a UAF at one point, caused by pointers to table types becoming
-- invalidated by child unifiers. (Calling log.concat can cause pointers to become invalid.)
type _Entry = {
    a: number,

    middle: (self: _Entry) -> (),

    z: number
}

export type AnyEntry = _Entry

local Entry = {}
Entry.__index = Entry

function Entry:dispose()
    self:middle()
    forgetChildren(self) -- unify free with sealed AnyEntry
end

function forgetChildren(parent: AnyEntry)
end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:2954 TEST_CASE_FIXTURE(Fixture, "unifying_tables_shouldnt_uaf2")
    name: "unifying_tables_shouldnt_uaf2",
    fixture: "Fixture",
    source: `
-- Another example that UAFd, this time found by fuzzing.
local _
do
_._ *= (_[{n0=_[{[{[_]=_,}]=_,}],}])[_]
_ = (_.n0)
end
_._ *= (_[false])[_]
_ = (_.cos)
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.tables.test.cpp:2970 TEST_CASE_FIXTURE(Fixture, "cannot_call_tables")
    name: "cannot_call_tables",
    fixture: "Fixture",
    source: `local foo = {}    foo()`,
    expect: [{ errors: 1 }, { error: 0, code: "CannotCallNonFunction" }],
  },
  {
    // TypeInfer.tables.test.cpp:2978 TEST_CASE_FIXTURE(Fixture, "table_length")
    name: "table_length",
    fixture: "Fixture",
    source: `
        local t = {}
        local s = #t
    `,
    expect: [{ errors: 0 }, { type: "t", kind: "TableType" }, { type: "s", equals: "number" }],
  },
  {
    // TypeInfer.tables.test.cpp:2991 TEST_CASE_FIXTURE(Fixture, "nil_assign_doesnt_hit_indexer")
    name: "nil_assign_doesnt_hit_indexer",
    fixture: "Fixture",
    source: `local a = {} a[0] = 7  a[0] = nil`,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:2996 TEST_CASE_FIXTURE(Fixture, "wrong_assign_does_hit_indexer")
    // Upstream compares the given type with Luau's builtin types, ported as
    // printing as their names.
    name: "wrong_assign_does_hit_indexer",
    fixture: "Fixture",
    source: `
        local a = {}
        a[0] = 7
        a[0] = 't'
        a[0] = nil
    `,
    expect: [
      { errors: 1 },
      { error: 0, location: [3, 15, 3, 18] },
      { error: 0, code: "TypeMismatch", fields: { wantedType: "number?", givenType: "string" } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:3015 TEST_CASE_FIXTURE(Fixture, "nil_assign_doesnt_hit_no_indexer")
    // Upstream compares the whole error with one it builds. Upstream compares
    // its wanted and given types with Luau's builtin types, ported as printing
    // as their names.
    name: "nil_assign_doesnt_hit_no_indexer",
    fixture: "Fixture",
    source: `
        local a = {a=1, b=2}
        a['a'] = nil
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "TypeMismatch", location: [2, 17, 2, 20], fields: { wantedType: "number", givenType: "nil" } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:3034 TEST_CASE_FIXTURE(Fixture, "free_rhs_table_can_also_be_bound")
    name: "free_rhs_table_can_also_be_bound",
    fixture: "Fixture",
    source: `
        local o
        local v = o:i()

        function g(u)
            v = u
        end

        o:f(g)
        o:h()
        o:h()
    `,
    expect: [],
  },
  {
    // TypeInfer.tables.test.cpp:3050 TEST_CASE_FIXTURE(BuiltinsFixture, "table_unifies_into_map")
    name: "table_unifies_into_map",
    fixture: "BuiltinsFixture",
    ignoreMissingAnnotations: true,
    unparsed: { defect: 919 }, // a ; right after the value of a local
    source: `
        local Instance: any
        local UDim2: any

        function Create(instanceType)
            return function(data)
                local obj = Instance.new(instanceType)
                for k, v in pairs(data) do
                    if type(k) == 'number' then
                        --v.Parent = obj
                    else
                        obj[k] = v
                    end
                end
                return obj
            end
        end

        local topbarShadow = Create'ImageLabel'{
            Name = "TopBarShadow";
            Size = UDim2.new(1, 0, 0, 3);
            Position = UDim2.new(0, 0, 1, 0);
            Image = "rbxasset://textures/ui/TopBar/dropshadow.png";
            BackgroundTransparency = 1;
            Active = false;
            Visible = false;
        };

    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:3086 TEST_CASE_FIXTURE(Fixture, "tables_get_names_from_their_locals")
    name: "tables_get_names_from_their_locals",
    fixture: "Fixture",
    source: `
        local T = {}
    `,
    expect: [{ errors: 0 }, { type: "T", equals: "T" }],
  },
  {
    // TypeInfer.tables.test.cpp:3097 TEST_CASE_FIXTURE(Fixture, "should_not_unblock_table_type_twice")
    name: "should_not_unblock_table_type_twice",
    fixture: "Fixture",
    source: `
        local timer = peek(timerQueue)
        while timer ~= nil do
            if timer.startTime <= currentTime then
                timer.isQueued = true
            end
            timer = peek(timerQueue)
        end
    `,
    expect: [],
  },
  {
    // TypeInfer.tables.test.cpp:3116 TEST_CASE_FIXTURE(Fixture, "generalize_table_argument")
    // Upstream also checks that the table is sealed.
    name: "generalize_table_argument",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        function foo(arr)
            local work = {}
            for i = 1, #arr do
                work[i] = arr[i]
            end

            return arr
        end
    `,
    expect: [
      { errors: 0 },
      { type: "foo", kind: "FunctionType" },
      { type: "foo", path: [{ argument: 0 }], kind: "TableType" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:3159 TEST_CASE_FIXTURE(BuiltinsFixture, "dont_quantify_table_that_belongs_to_outer_scope")
    // Upstream also checks that the metatable of what new returns has a
    // property incr and is Counter's type.
    name: "dont_quantify_table_that_belongs_to_outer_scope",
    fixture: "BuiltinsFixture",
    ignoreMissingAnnotations: true,
    source: `
        local Counter = {}
        Counter.__index = Counter

        function Counter.new()
            local self = setmetatable({count=0}, Counter)
            return self
        end

        function Counter:incr()
            self.count = 1
            return self.count
        end

        local self = Counter.new()
        print(self:incr())
    `,
    expect: [
      { errors: 0 },
      { type: "Counter", kind: "TableType" },
      { type: "Counter", path: [{ property: "new" }], kind: "FunctionType" },
      { type: "Counter", path: [{ property: "new" }, { result: 0 }], kind: "MetatableType" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:3204 TEST_CASE_FIXTURE(BuiltinsFixture, "instantiate_tables_at_scope_level")
    name: "instantiate_tables_at_scope_level",
    fixture: "BuiltinsFixture",
    ignoreMissingAnnotations: true,
    source: `
        --!strict
        local Option = {}
        Option.__index = Option

        function Option.Is(obj)
            return (type(obj) == "table" and getmetatable(obj) == Option)
        end

        return Option
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:3222 TEST_CASE_FIXTURE(Fixture, "inferring_crazy_table_should_also_be_quick")
    // Upstream checks that the module holds at most 500 internal types, which
    // measures Luau's own allocation.
    name: "inferring_crazy_table_should_also_be_quick",
    fixture: "Fixture",
    source: `
        --!strict
        function f(U)
            U(w:s(an):c()():c():U(s):c():c():U(s):c():U(s):cU()):c():U(s):c():U(s):c():c():U(s):c():U(s):cU()
        end
    `,
    expect: [],
  },
  {
    // TypeInfer.tables.test.cpp:3238 TEST_CASE_FIXTURE(Fixture, "MixedPropertiesAndIndexers")
    name: "MixedPropertiesAndIndexers",
    fixture: "Fixture",
    source: `
local x = {}
x.a = "a"
x[0] = true
x.b = 37
`,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:3250 TEST_CASE_FIXTURE(Fixture, "setmetatable_cant_be_used_to_mutate_global_types")
    // Upstream checks the snippet with a second fixture sharing the first one's
    // globals, then prints every global so that a sanitizer build would catch a
    // type arena freed too early.
    name: "setmetatable_cant_be_used_to_mutate_global_types",
    fixture: "Fixture",
    source: `
--!nonstrict
type MT = typeof(setmetatable)
function wtf(arg: {MT}): typeof(table)
    arg = wtf(arg)
end
`,
    expect: [],
  },
  {
    // TypeInfer.tables.test.cpp:3277 TEST_CASE_FIXTURE(Fixture, "evil_table_unification")
    name: "evil_table_unification",
    fixture: "Fixture",
    source: `
--!nonstrict
_ = ...
_:table(_,string)[_:gsub(_,...,n0)],_,_:gsub(_,string)[""],_:split(_,...,table)._,n0 = nil
do end
`,
    expect: [],
  },
  {
    // TypeInfer.tables.test.cpp:3288 TEST_CASE_FIXTURE(BuiltinsFixture, "dont_crash_when_setmetatable_does_not_produce_a_metatabletypevar")
    name: "dont_crash_when_setmetatable_does_not_produce_a_metatabletypevar",
    fixture: "BuiltinsFixture",
    source: `local x = setmetatable({})`,
    expect: [{ errors: 1 }, { error: 0, code: "UninhabitedTypeFunction" }],
  },
  {
    // TypeInfer.tables.test.cpp:3305 TEST_CASE_FIXTURE(BuiltinsFixture, "instantiate_table_cloning")
    // Upstream also checks that math's table type has no instantiated type
    // parameters, which is Luau's own bookkeeping.
    name: "instantiate_table_cloning",
    fixture: "BuiltinsFixture",
    source: `
--!nonstrict
local l0:any,l61:t0<t32> = _,math
while _ do
_()
end
function _():t0<t0>
end
type t0<t32> = any
`,
    expect: [],
  },
  {
    // TypeInfer.tables.test.cpp:3326 TEST_CASE_FIXTURE(BuiltinsFixture, "instantiate_table_cloning_2")
    // Upstream also checks that math's table type has no instantiated type
    // parameters, which is Luau's own bookkeeping.
    name: "instantiate_table_cloning_2",
    fixture: "BuiltinsFixture",
    source: `
type X<T> = T
type K = X<typeof(math)>
`,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:3343 TEST_CASE_FIXTURE(Fixture, "instantiate_table_cloning_3")
    // Upstream also checks that a's table type has no instantiated type
    // parameters, which is Luau's own bookkeeping.
    name: "instantiate_table_cloning_3",
    fixture: "Fixture",
    source: `
type X<T> = T
local a = {}
a.x = 4
local b: X<typeof(a)>
a.y = 5
local c: X<typeof(a)>
c = b
`,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:3365 TEST_CASE_FIXTURE(Fixture, "record_location_of_inserted_table_properties")
    // Upstream also checks that a's property foo records the location
    // 2:10-2:13.
    name: "record_location_of_inserted_table_properties",
    fixture: "Fixture",
    source: `
        local a = {}
        a.foo = 1234
    `,
    expect: [
      { errors: 0 },
      { type: "a", kind: "TableType" },
      { type: "a", path: [{ property: "foo" }] },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:3383 TEST_CASE_FIXTURE(Fixture, "table_indexing_error_location")
    name: "table_indexing_error_location",
    fixture: "Fixture",
    unparsed: { defect: 1023 }, // a type ending in ? with a word after it, even on the next line
    source: `
local foo = {42}
local bar: number?
local baz = foo[bar]
    `,
    expect: [{ errors: 1 }, { error: 0, location: [3, 16, 3, 19] }],
  },
  {
    // TypeInfer.tables.test.cpp:3396 TEST_CASE_FIXTURE(BuiltinsFixture, "table_call_metamethod_basic")
    // Upstream compares foo's type with Luau's builtin types, ported as
    // printing as their names.
    name: "table_call_metamethod_basic",
    fixture: "BuiltinsFixture",
    source: `
        local a = setmetatable({
            a = 1,
        }, {
            __call = function(self, b: number)
                return self.a * b
            end,
        })

        local foo = a(12)
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "ExplicitFunctionAnnotationRecommended" },
      { type: "foo", equals: "number" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:3423 TEST_CASE_FIXTURE(BuiltinsFixture, "table_call_metamethod_must_be_callable")
    name: "table_call_metamethod_must_be_callable",
    fixture: "BuiltinsFixture",
    source: `
        local a = setmetatable({}, {
            __call = 123,
        })

        local foo = a()
    `,
    expect: [{ errors: 1 }, { error: 0, message: "Cannot call a value of type a" }],
  },
  {
    // TypeInfer.tables.test.cpp:3449 TEST_CASE_FIXTURE(BuiltinsFixture, "table_call_metamethod_generic")
    // Upstream compares the types of foo and bar with Luau's builtin types,
    // ported as printing as their names.
    name: "table_call_metamethod_generic",
    fixture: "BuiltinsFixture",
    source: `
        local a = setmetatable({}, {
            __call = function<T>(self, b: T)
                return b
            end,
        })

        local foo = a(12)
        local bar = a("bar")
    `,
    expect: [{ errors: 0 }, { type: "foo", equals: "number" }, { type: "bar", equals: "string" }],
  },
  {
    // TypeInfer.tables.test.cpp:3467 TEST_CASE_FIXTURE(BuiltinsFixture, "table_simple_call")
    name: "table_simple_call",
    fixture: "BuiltinsFixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    unparsed: { defect: 880 }, // a -- comment after an arithmetic expression
    source: `
        local a = setmetatable({ x = 2 }, {
            __call = function(self)
                return (self.x :: number) * 2 -- should work without annotation in the future
            end
        })
        local b = a()
        local c = a(2) -- too many arguments
    `,
    expect: [],
  },
  {
    // TypeInfer.tables.test.cpp:3486 TEST_CASE_FIXTURE(BuiltinsFixture, "access_index_metamethod_that_returns_variadic")
    name: "access_index_metamethod_that_returns_variadic",
    fixture: "BuiltinsFixture",
    unparsed: { defect: 876 }, // a variadic type written ...T, or T... inside << >>
    source: `
        type Foo = {x: string}
        local t = {}
        setmetatable(t, {
            __index = function(x: string): ...Foo
                return {x = x}
            end
        })

        local foo = t.bar
    `,
    expect: [
      { errors: 0 },
      { type: "foo", equals: "{ x: string }", options: { exhaustive: true } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:3507 TEST_CASE_FIXTURE(Fixture, "dont_invalidate_the_properties_iterator_of_free_table_when_rolled_back")
    name: "dont_invalidate_the_properties_iterator_of_free_table_when_rolled_back",
    fixture: "Fixture",
    checks: [
      {
        module: "Module/Backend/Types",
        source: `
        export type Fiber = {
            return_: Fiber?
        }
        return {}
    `,
        expect: [],
      },
      {
        module: "Module/Backend",
        unparsed: { defect: 879 }, // a call to require
        source: `
        local Types = require(script.Types)
        type Fiber = Types.Fiber
        type ReactRenderer = { findFiberByHostInstance: () -> Fiber? }

        local function attach(renderer): ()
            local function getPrimaryFiber(fiber)
                local alternate = fiber.alternate
                return fiber
            end

            local function getFiberIDForNative()
                local fiber = renderer.findFiberByHostInstance()
                fiber = fiber.return_
                return getPrimaryFiber(fiber)
            end
        end

        function culprit(renderer: ReactRenderer): ()
            attach(renderer)
        end

        return culprit
    `,
        expect: [],
      },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:3544 TEST_CASE_FIXTURE(Fixture, "checked_prop_too_early")
    name: "checked_prop_too_early",
    fixture: "Fixture",
    source: `
        local t: {x: number?}? = {x = nil}
        local u = t.x and t or 5
    `,
    expect: [
      { errors: 1 },
      { error: 0, message: "Value of type '{ x: number? }?' could be nil" },
      { type: "u", equals: "number | { read x: number, write x: number? }" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:3565 TEST_CASE_FIXTURE(Fixture, "accidentally_checked_prop_in_opposite_branch")
    name: "accidentally_checked_prop_in_opposite_branch",
    fixture: "Fixture",
    source: `
        local t: {x: number?}? = {x = nil}
        local u = t and t.x == 5 or t.x == 31337
    `,
    expect: [
      { errors: 1 },
      { error: 0, message: "Value of type '{ x: number? }?' could be nil" },
      { type: "u", equals: "boolean" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:3581 TEST_CASE_FIXTURE(Fixture, "pairs_parameters_are_not_unsealed_tables")
    name: "pairs_parameters_are_not_unsealed_tables",
    fixture: "Fixture",
    source: `
        function _(l0:{n0:any})
            _ = pairs
        end
    `,
    expect: [],
  },
  {
    // TypeInfer.tables.test.cpp:3590 TEST_CASE_FIXTURE(BuiltinsFixture, "table_function_check_use_after_free")
    name: "table_function_check_use_after_free",
    fixture: "BuiltinsFixture",
    ignoreMissingAnnotations: true,
    source: `
local t = {}

function t.x(value)
    for k,v in pairs(t) do end
end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:3608 TEST_CASE_FIXTURE(Fixture, "inferred_properties_of_a_table_should_start_with_the_same_TypeLevel_of_that_table")
    name: "inferred_properties_of_a_table_should_start_with_the_same_TypeLevel_of_that_table",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        --!strict
        local T = {}

        local function f(prop)
            T[1] = {
                prop = prop,
            }
        end

        local function g()
            local l = T[1].prop
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:3630 TEST_CASE_FIXTURE(BuiltinsFixture, "dont_leak_free_table_props")
    // Upstream also checks that the module's return type prints as `(...any) ->
    // ({ read blah: unknown, read gwar: unknown }) -> ()`.
    name: "dont_leak_free_table_props",
    fixture: "BuiltinsFixture",
    ignoreMissingAnnotations: true,
    source: `
        local function a(state)
            print(state.blah)
        end

        local function b(state) -- The bug was that we inferred state: {blah: any, gwar: any}
            print(state.gwar)
        end

        return function()
            return function(state)
                a(state)
                b(state)
            end
        end
    `,
    expect: [
      { errors: 0 },
      { type: "a", equals: "({ read blah: unknown }) -> ()" },
      { type: "b", equals: "({ read gwar: unknown }) -> ()" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:3666 TEST_CASE_FIXTURE(Fixture, "mixed_tables_with_implicit_numbered_keys")
    name: "mixed_tables_with_implicit_numbered_keys",
    fixture: "Fixture",
    source: `
        local t: { [string]: number } = { 5, 6, 7 }
    `,
    expect: [
      { errors: 3 },
      { error: 0, message: "Unexpected array-like table item: the indexer key type of this table is not `number`." },
      { error: 1, message: "Unexpected array-like table item: the indexer key type of this table is not `number`." },
      { error: 2, message: "Unexpected array-like table item: the indexer key type of this table is not `number`." },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:3687 TEST_CASE_FIXTURE(Fixture, "expected_indexer_value_type_extra")
    name: "expected_indexer_value_type_extra",
    fixture: "Fixture",
    source: `
        type X = { { x: boolean?, y: boolean? } }

        local l1: {[string]: X} = { key = { { x = true }, { y = true } } }
        local l2: {[any]: X} = { key = { { x = true }, { y = true } } }
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:3699 TEST_CASE_FIXTURE(Fixture, "expected_indexer_value_type_extra_2")
    name: "expected_indexer_value_type_extra_2",
    fixture: "Fixture",
    source: `
        type X = {[any]: string | boolean}

        local x: X = { key = "str" }
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:3710 TEST_CASE_FIXTURE(Fixture, "expected_indexer_from_table_union")
    name: "expected_indexer_from_table_union",
    fixture: "Fixture",
    checks: [
      {
        source: `local a: {[string]: {number | string}} = {a = {2, 's'}}`,
        expect: [{ errors: 0 }],
      },
      {
        source: `local a: {[string]: {number | string}}? = {a = {2, 's'}}`,
        expect: [{ errors: 0 }],
      },
      {
        source: `local a: {[string]: {[string]: {string?}}?} = {["a"] = {["b"] = {"a", "b"}}}`,
        expect: [{ errors: 0 }],
      },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:3717 TEST_CASE_FIXTURE(Fixture, "prop_access_on_key_whose_types_mismatches")
    name: "prop_access_on_key_whose_types_mismatches",
    fixture: "Fixture",
    source: `
        local t: {number} = {}
        local x = t.x
    `,
    expect: [{ errors: 1 }, { error: 0, message: "Key 'x' not found in table '{number}'" }],
  },
  {
    // TypeInfer.tables.test.cpp:3728 TEST_CASE_FIXTURE(Fixture, "prop_access_on_unions_of_indexers_where_key_whose_types_mismatches")
    name: "prop_access_on_unions_of_indexers_where_key_whose_types_mismatches",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        local t: { [number]: number } | { [boolean]: number } = {}
        local u = t.x
    `,
    expect: [
      { errors: 1 },
      { error: 0, message: "Type '{ [boolean]: number } | {number}' does not have key 'x'" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:3739 TEST_CASE_FIXTURE(BuiltinsFixture, "leaking_bad_metatable_errors")
    name: "leaking_bad_metatable_errors",
    fixture: "BuiltinsFixture",
    source: `
local a = setmetatable({}, 1)
local b = a.x
    `,
    expect: [
      { errors: 2 },
      { error: 0, message: "Metatable was not a table" },
      { error: 1, message: "Type 'a' does not have key 'x'" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:3751 TEST_CASE_FIXTURE(Fixture, "scalar_is_a_subtype_of_a_compatible_polymorphic_shape_type")
    name: "scalar_is_a_subtype_of_a_compatible_polymorphic_shape_type",
    fixture: "Fixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    unparsed: { defect: 877 }, // a :: cast to a type that is not also an expression
    source: `
        local function f(s)
            return s:lower()
        end

        f("foo" :: string)
        f("bar" :: "bar")
        f("baz" :: "bar" | "baz")
    `,
    expect: [],
  },
  {
    // TypeInfer.tables.test.cpp:3769 TEST_CASE_FIXTURE(Fixture, "scalar_is_not_a_subtype_of_a_compatible_polymorphic_shape_type")
    name: "scalar_is_not_a_subtype_of_a_compatible_polymorphic_shape_type",
    fixture: "Fixture",
    flags: { LuauCallErrorReportingRecoversArgumentLocationsForPacks: true },
    ignoreMissingAnnotations: true,
    unparsed: { defect: 877 }, // a :: cast to a type that is not also an expression
    source: `
        local function f(s)
            return s:absolutely_no_scalar_has_this_method()
        end

        f("foo" :: string)
        f("bar" :: "bar")
        f("baz" :: "bar" | "baz")
    `,
    expect: [
      { errors: 4 },
      { error: 0, code: "TypeMismatch", fields: { givenType: "typeof(string)", wantedType: "t1 where t1 = { read absolutely_no_scalar_has_this_method: (t1) -> (T...) }" } },
      { error: 1, code: "TypeMismatch", fields: { givenType: "typeof(string)", wantedType: "t1 where t1 = { read absolutely_no_scalar_has_this_method: (t1) -> (T...) }" } },
      { error: 2, code: "TypeMismatch", fields: { givenType: "\"bar\" | \"baz\"", wantedType: "t1 where t1 = { read absolutely_no_scalar_has_this_method: (t1) -> (T...) }" } },
      { error: 3, code: "TypeMismatch", fields: { givenType: "\"bar\" | \"baz\"", wantedType: "t1 where t1 = { read absolutely_no_scalar_has_this_method: (t1) -> (T...) }" } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:3843 TEST_CASE_FIXTURE(Fixture, "a_free_shape_can_turn_into_a_scalar_if_it_is_compatible")
    name: "a_free_shape_can_turn_into_a_scalar_if_it_is_compatible",
    fixture: "Fixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        local function f(s): string
            local foo = s:lower()
            return s
        end
    `,
    expect: [],
  },
  {
    // TypeInfer.tables.test.cpp:3859 TEST_CASE_FIXTURE(Fixture, "a_free_shape_cannot_turn_into_a_scalar_if_it_is_not_compatible")
    name: "a_free_shape_cannot_turn_into_a_scalar_if_it_is_not_compatible",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        local function f(s): string
            local foo = s:absolutely_no_scalar_has_this_method()
            return s
        end
    `,
    expect: [
      { errors: 3 },
      { error: 0, message: "Parameter 's' has been reduced to never. This function is not callable with any possible value." },
      { error: 1, message: "Parameter 's' is required to be a subtype of '{ read absolutely_no_scalar_has_this_method: (never) -> (unknown, ...unknown) }' here." },
      { error: 2, message: "Parameter 's' is required to be a subtype of 'string' here." },
      { type: "f", equals: "(never) -> string" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:3897 TEST_CASE_FIXTURE(BuiltinsFixture, "a_free_shape_can_turn_into_a_scalar_directly")
    name: "a_free_shape_can_turn_into_a_scalar_directly",
    fixture: "BuiltinsFixture",
    source: `
        local function stringByteList(str)
            local out = {}
            for i = 1, #str do
                table.insert(out, string.byte(str, i))
            end
            return table.concat(out, ",")
        end

        local x = stringByteList("xoo")
    `,
    expect: [{ errors: "some" }, { anyError: "MultipleNonviableOverloads" }],
  },
  {
    // TypeInfer.tables.test.cpp:3928 TEST_CASE_FIXTURE(Fixture, "invariant_table_properties_means_instantiating_tables_in_call_is_unsound")
    // Upstream also checks that the given type prints exhaustively as `{ m:
    // <T>(T) -> T }`; printed by default, as fields are compared, it keeps the
    // name t.
    name: "invariant_table_properties_means_instantiating_tables_in_call_is_unsound",
    fixture: "Fixture",
    flags: { LuauInstantiateInSubtyping: true },
    ignoreMissingAnnotations: true,
    source: `
        --!strict
        local t = {}
        function t.m<T>(x: T) return x end
        local a : string = t.m("hi")
        local b : number = t.m(5)
        function f(x : { m : (number)->number })
            x.m = function(x: number) return 1+x end
        end

        f(t) -- This shouldn't typecheck

        local c : string = t.m("hi")
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "TypeMismatch" },
      { error: 0, location: [10, 10, 10, 11], fields: { wantedType: "{ m: (number) -> number }" } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:3974 TEST_CASE_FIXTURE(BuiltinsFixture, "generic_table_instantiation_potential_regression")
    name: "generic_table_instantiation_potential_regression",
    fixture: "BuiltinsFixture",
    ignoreMissingAnnotations: true,
    source: `
--!strict

function f(x)
  x.p = 5
  return x
end
local g : ({ p : number, q : string }) -> ({ p : number, r : boolean }) = f
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "TypeMismatch", fields: { wantedType: "({ p: number, q: string }) -> { p: number, r: boolean }", givenType: "({ p: number }) -> { p: number }" } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:4007 TEST_CASE_FIXTURE(BuiltinsFixture, "setmetatable_has_a_side_effect")
    name: "setmetatable_has_a_side_effect",
    fixture: "BuiltinsFixture",
    source: `
        local mt = {
            __add = function(x, y)
                return 123
            end,
        }

        local foo = {}
        setmetatable(foo, mt)
    `,
    expect: [{ errors: 0 }, { type: "foo", equals: "setmetatable<foo, mt>" }],
  },
  {
    // TypeInfer.tables.test.cpp:4027 TEST_CASE_FIXTURE(BuiltinsFixture, "tables_should_be_fully_populated")
    name: "tables_should_be_fully_populated",
    fixture: "BuiltinsFixture",
    source: `
        local t = {
            x = 5 :: NonexistingTypeWhichEndsUpReturningAnErrorType,
            y = 5
        }
    `,
    expect: [
      { errors: 1 },
      { type: "t", equals: "{ x: *error-type*, y: number }", options: { exhaustive: true } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:4046 TEST_CASE_FIXTURE(Fixture, "fuzz_table_indexer_unification_can_bound_owner_to_string")
    name: "fuzz_table_indexer_unification_can_bound_owner_to_string",
    fixture: "Fixture",
    source: `
sin,_ = nil
_ = _[_.sin][_._][_][_]._
_[_] = _
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.tables.test.cpp:4057 TEST_CASE_FIXTURE(BuiltinsFixture, "fuzz_table_extra_prop_unification_can_bound_owner_to_string")
    name: "fuzz_table_extra_prop_unification_can_bound_owner_to_string",
    fixture: "BuiltinsFixture",
    source: `
l0,_ = nil
_ = _,_[_.n5]._[_][_][_]._
_._.foreach[_],_ = _[_],_._
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.tables.test.cpp:4068 TEST_CASE_FIXTURE(BuiltinsFixture, "fuzz_typelevel_promote_on_changed_table_type")
    name: "fuzz_typelevel_promote_on_changed_table_type",
    fixture: "BuiltinsFixture",
    source: `
_._,_ = nil
_ = _.foreach[_]._,_[_.n5]._[_.foreach][_][_]._
_ = _._
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.tables.test.cpp:4079 TEST_CASE_FIXTURE(BuiltinsFixture, "fuzz_table_unify_instantiated_table")
    name: "fuzz_table_unify_instantiated_table",
    fixture: "BuiltinsFixture",
    flags: { LuauInstantiateInSubtyping: true },
    source: `
function _(...)
end
local function l0():typeof(_()()[_()()[_]])
end
return _[_()()[_]] <= _
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.tables.test.cpp:4096 TEST_CASE_FIXTURE(Fixture, "fuzz_table_unify_instantiated_table_with_prop_realloc")
    name: "fuzz_table_unify_instantiated_table_with_prop_realloc",
    fixture: "Fixture",
    flags: { LuauInstantiateInSubtyping: true },
    source: `
function _(l0,l0)
do
_ = _().n0
end
l0(_()._,_)
end
_(_,function(...)
end)
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.tables.test.cpp:4116 TEST_CASE_FIXTURE(BuiltinsFixture, "fuzz_table_unify_prop_realloc")
    name: "fuzz_table_unify_prop_realloc",
    fixture: "BuiltinsFixture",
    source: `
n3,_ = nil
_ = _[""]._,_[l0][_._][{[_]=_,_=_,}][_G].number
_ = {_,}
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.tables.test.cpp:4127 TEST_CASE_FIXTURE(Fixture, "when_augmenting_an_unsealed_table_with_an_indexer_apply_the_correct_scope_to_the_indexer_type")
    name: "when_augmenting_an_unsealed_table_with_an_indexer_apply_the_correct_scope_to_the_indexer_type",
    fixture: "Fixture",
    source: `
        local events = {}
        local mockObserveEvent = function(_, key, callback)
            events[key] = callback
        end

        events['FriendshipNotifications']({
            EventArgs = {
                UserId2 = '2'
            },
            Type = 'FriendshipDeclined'
        })
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "OptionalValueAccess" },
      { type: "events", kind: "TableType" },
      { type: "events", properties: 0 },
      { type: "events", path: [{ indexer: "key" }], equals: "unknown" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:4165 TEST_CASE_FIXTURE(Fixture, "dont_extend_unsealed_tables_in_rvalue_position")
    // Upstream also checks that testDictionary has no property named by the
    // empty string.
    name: "dont_extend_unsealed_tables_in_rvalue_position",
    fixture: "Fixture",
    source: `
        local testDictionary = {
            FruitName = "Lemon",
            FruitColor = "Yellow",
            Sour = true
        }

        local print: any

        print(testDictionary[""])
    `,
    expect: [{ errors: 1 }, { type: "testDictionary", kind: "TableType" }],
  },
  {
    // TypeInfer.tables.test.cpp:4191 TEST_CASE_FIXTURE(BuiltinsFixture, "extend_unsealed_table_with_metatable")
    name: "extend_unsealed_table_with_metatable",
    fixture: "BuiltinsFixture",
    source: `
        local T = setmetatable({}, {
            __call = function(_, name: string?)
            end,
        })

        T.for_ = "for_"

        return T
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:4207 TEST_CASE_FIXTURE(BuiltinsFixture, "top_table_type_is_isomorphic_to_empty_sealed_table_type")
    name: "top_table_type_is_isomorphic_to_empty_sealed_table_type",
    fixture: "BuiltinsFixture",
    source: `
        local None = newproxy(true)
        local mt = getmetatable(None)
        mt.__tostring = function()
            return "Object.None"
        end

        function assign(...)
            for index = 1, select("#", ...) do
                local rest = select(index, ...)

                if rest ~= nil and typeof(rest) == "table" then
                    for key, value in pairs(rest) do
                    end
                end
            end
        end
    `,
    expect: [],
  },
  {
    // TypeInfer.tables.test.cpp:4229 TEST_CASE_FIXTURE(BuiltinsFixture, "luau-polyfill.Array.includes")
    name: "luau-polyfill.Array.includes",
    fixture: "BuiltinsFixture",
    source: `
type Array<T> = { [number]: T }

function indexOf<T>(array: Array<T>, searchElement: any, fromIndex: number?): number
	return -1
end

return function<T>(array: Array<T>, searchElement: any, fromIndex: number?): boolean
	return -1 ~= indexOf(array, searchElement, fromIndex)
end

    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:4248 TEST_CASE_FIXTURE(Fixture, "certain_properties_of_table_literal_arguments_can_be_covariant")
    name: "certain_properties_of_table_literal_arguments_can_be_covariant",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        function f(a: {[string]: string | {any} | nil })
            return a
        end

        local x = f({
            title = "Feature.VirtualEvents.EnableNotificationsModalTitle",
            body = "Feature.VirtualEvents.EnableNotificationsModalBody",
            notNow = "Feature.VirtualEvents.NotNowButton",
            getNotified = "Feature.VirtualEvents.GetNotifiedButton",
        })
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:4267 TEST_CASE_FIXTURE(Fixture, "subproperties_can_also_be_covariantly_tested")
    name: "subproperties_can_also_be_covariantly_tested",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        type T = {
            [string]: {[string]: (string | number)?}
        }

        function f(t: T)
            return t
        end

        local x = f({
            subprop={x="hello"}
        })

        local y = f({
            subprop={x=41}
        })

        local z = f({
            subprop={}
        })
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:4295 TEST_CASE_FIXTURE(Fixture, "cyclic_shifted_tables")
    name: "cyclic_shifted_tables",
    fixture: "Fixture",
    source: `
        local function id<a>(x: a): a
          return x
        end

        -- Remove name from cyclic table
        local foo = id({})
        foo.foo = id({})
        foo.foo.foo = id({})
        foo.foo.foo.foo = id({})
        foo.foo.foo.foo.foo = foo

        local almostFoo = id({})
        almostFoo.foo = id({})
        almostFoo.foo.foo = id({})
        almostFoo.foo.foo.foo = id({})
        almostFoo.foo.foo.foo.foo = almostFoo
        -- Shift
        almostFoo = almostFoo.foo.foo
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:4322 TEST_CASE_FIXTURE(Fixture, "cli_84607_missing_prop_in_array_or_dict")
    name: "cli_84607_missing_prop_in_array_or_dict",
    fixture: "Fixture",
    flags: { LuauFixIndexerSubtypingOrdering: true },
    source: `
        type Thing = { name: string, prop: boolean }

        local arrayOfThings : {Thing} = {
            { name = "a" }
        }

        local dictOfThings : {[string]: Thing} = {
            a = { name = "a" }
        }
    `,
    expect: [
      { errors: 2 },
      { error: 0, code: "MissingProperties", fields: { properties: ["prop"] } },
      { error: 1, code: "MissingProperties", fields: { properties: ["prop"] } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:4370 TEST_CASE_FIXTURE(Fixture, "simple_method_definition")
    // Upstream also checks that the module's return type prints as `{ m:
    // (unknown) -> number }` exhaustively.
    name: "simple_method_definition",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        local T = {}

        function T:m()
            return 5
        end

        return T
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:4391 TEST_CASE_FIXTURE(Fixture, "identify_all_problematic_table_fields")
    name: "identify_all_problematic_table_fields",
    fixture: "Fixture",
    source: `
        type T = {
            a: number,
            b: string,
            c: boolean,
        }

        local a: T = {
            a = "foo",
            b = false,
            c = 123,
        }
    `,
    expect: [
      { errors: 3 },
      { error: 0, code: "TypeMismatch" },
      { error: 0, location: [8, 16, 8, 21], fields: { givenType: "string", wantedType: "number" } },
      { error: 1, code: "TypeMismatch" },
      { error: 1, location: [9, 16, 9, 21], fields: { givenType: "boolean", wantedType: "string" } },
      { error: 2, code: "TypeMismatch" },
      { error: 2, location: [10, 16, 10, 19], fields: { givenType: "number", wantedType: "boolean" } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:4430 TEST_CASE_FIXTURE(Fixture, "read_and_write_only_table_properties_are_unsupported")
    name: "read_and_write_only_table_properties_are_unsupported",
    fixture: "Fixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        type W = {read x: number}
        type X = {write x: boolean}

        type Y = {read ["prop"]: boolean}
        type Z = {write ["prop"]: string}
    `,
    expect: [],
  },
  {
    // TypeInfer.tables.test.cpp:4454 TEST_CASE_FIXTURE(Fixture, "read_and_write_only_indexers_are_unsupported")
    name: "read_and_write_only_indexers_are_unsupported",
    fixture: "Fixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        type T = {read [string]: number}
        type U = {write [string]: boolean}
    `,
    expect: [],
  },
  {
    // TypeInfer.tables.test.cpp:4471 TEST_CASE_FIXTURE(Fixture, "infer_write_property")
    name: "infer_write_property",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        function f(t)
            t.y = 1
        end
    `,
    expect: [{ errors: 0 }, { type: "f", equals: "({ y: number }) -> ()" }],
  },
  {
    // TypeInfer.tables.test.cpp:4487 TEST_CASE_FIXTURE(Fixture, "new_solver_supports_read_write_properties")
    name: "new_solver_supports_read_write_properties",
    fixture: "Fixture",
    source: `
        type W = {read x: number}
        type X = {write x: boolean}

        type Y = {read ["prop"]: boolean}
        type Z = {write ["prop"]: string}
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:4502 TEST_CASE_FIXTURE(Fixture, "nested_write_property_mismatch_describes_the_assigned_value")
    // Upstream's message for LuauNewTypePathErrorMessages, which is on.
    name: "nested_write_property_mismatch_describes_the_assigned_value",
    fixture: "Fixture",
    source: `
        type A = { write outer: { read inner: number } }
        type B = { write outer: { read inner: string } }
        local a: A
        local b: B = a
    `,
    expect: [
      { errors: 1 },
      { error: 0, message: "Expected this to be 'B', but got 'A'; \nExpected property `inner` of a value assigned to property `outer` to be a supertype of `string`, but got `number`" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:4525 TEST_CASE_FIXTURE(Fixture, "table_subtyping_error_suppression")
    name: "table_subtyping_error_suppression",
    fixture: "Fixture",
    source: `
        function one(tbl: {x: any}) end
        function two(tbl: {x: string}) one(tbl) end -- ok, string <: any and any <: string

        function three(tbl: {x: any, y: string}) end
        function four(tbl: {x: string, y: string}) three(tbl) end -- ok, string <: any, any <: string, string <: string
        function five(tbl: {x: string, y: number}) three(tbl) end -- error, string <: any, any <: string, but number </: string
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "TypeMismatch", fields: { wantedType: "{ x: any, y: string }", givenType: "{ x: string, y: number }" } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:4548 TEST_CASE_FIXTURE(Fixture, "write_to_read_only_property")
    // Upstream prints the error's table exhaustively.
    name: "write_to_read_only_property",
    fixture: "Fixture",
    source: `
        function f(t: {read x: number})
            t.x = 5
        end
    `,
    expect: [
      { errors: 1 },
      { error: 0, message: "Property x of table '{ read x: number }' is read-only" },
      { error: 0, code: "PropertyAccessViolation", fields: { table: "{ read x: number }", key: "x", context: "CannotWrite" } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:4570 TEST_CASE_FIXTURE(Fixture, "write_to_write_only_property")
    name: "write_to_write_only_property",
    fixture: "Fixture",
    source: `
        function f(t: {write x: number})
            t.x = 5
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:4583 TEST_CASE_FIXTURE(Fixture, "bidirectional_typechecking_with_write_only_property")
    name: "bidirectional_typechecking_with_write_only_property",
    fixture: "Fixture",
    source: `
        function f(t: {write x: number})
            t.x = 5
        end

        f({ x = 2 })
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:4598 TEST_CASE_FIXTURE(Fixture, "read_from_write_only_property")
    // Upstream prints the error's table exhaustively.
    name: "read_from_write_only_property",
    fixture: "Fixture",
    source: `
        function f(t: {write x: number})
            local foo = t.x
        end
    `,
    expect: [
      { errors: 1 },
      { error: 0, message: "Property x of table '{ write x: number }' is write-only" },
      { error: 0, code: "PropertyAccessViolation", fields: { table: "{ write x: number }", key: "x", context: "CannotRead" } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:4620 TEST_CASE_FIXTURE(Fixture, "write_to_unusually_named_read_only_property")
    name: "write_to_unusually_named_read_only_property",
    fixture: "Fixture",
    source: `
        function f(t: {read ["hello world"]: number})
            t["hello world"] = 5
        end
    `,
    expect: [
      { errors: 1 },
      { error: 0, message: "Property \"hello world\" of table '{ read [\"hello world\"]: number }' is read-only" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:4635 TEST_CASE_FIXTURE(Fixture, "read_only_property_with_type_mismatch_reports_both_errors")
    // Upstream also checks that the message contains both "Expected property
    // `woof` to be `number`, but got `string`" and "`woof` is a read-only
    // property in the latter type, but the former type requires a read-write
    // property".
    name: "read_only_property_with_type_mismatch_reports_both_errors",
    fixture: "Fixture",
    flags: { LuauPropertyModifierMismatchErrors: true },
    source: `
        local function f(t: { read woof: string }): { woof: number }
            return t
        end
    `,
    expect: [{ errors: 1 }],
  },
  {
    // TypeInfer.tables.test.cpp:4658 TEST_CASE_FIXTURE(Fixture, "read_only_property_subtype_mismatch_error_message")
    name: "read_only_property_subtype_mismatch_error_message",
    fixture: "Fixture",
    flags: { LuauPropertyModifierMismatchErrors: true },
    source: `
        local function f(t: { read woof: number }): { woof: number }
            return t
        end
    `,
    expect: [
      { errors: 1 },
      { error: 0, message: "Expected this to be\n\t'{ woof: number }'\nbut got\n\t'{ read woof: number }'; \n`woof` is a read-only property in the latter type, but the former type requires a read-write property" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:4680 TEST_CASE_FIXTURE(Fixture, "write_only_property_subtype_mismatch_error_message")
    name: "write_only_property_subtype_mismatch_error_message",
    fixture: "Fixture",
    flags: { LuauPropertyModifierMismatchErrors: true },
    source: `
        local function f(t: { write woof: number }): { woof: number }
            return t
        end
    `,
    expect: [
      { errors: 1 },
      { error: 0, message: "Expected this to be\n\t'{ woof: number }'\nbut got\n\t'{ write woof: number }'; \n`woof` is a write-only property in the latter type, but the former type requires a read-write property" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:4702 TEST_CASE_FIXTURE(Fixture, "write_annotations_are_supported_with_the_new_solver")
    name: "write_annotations_are_supported_with_the_new_solver",
    fixture: "Fixture",
    source: `
        function f(t: {write foo: number})
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:4714 TEST_CASE_FIXTURE(Fixture, "read_and_write_only_table_properties_are_unsupported")
    name: "read_and_write_only_table_properties_are_unsupported",
    fixture: "Fixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        type W = {read x: number}
        type X = {write x: boolean}

        type Y = {read ["prop"]: boolean}
        type Z = {write ["prop"]: string}
    `,
    expect: [],
  },
  {
    // TypeInfer.tables.test.cpp:4738 TEST_CASE_FIXTURE(Fixture, "read_only_indexer_basic")
    name: "read_only_indexer_basic",
    fixture: "Fixture",
    source: `
        type T = {read [string]: number}
        type A = {read number}
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:4751 TEST_CASE_FIXTURE(Fixture, "read_only_indexer_write_rejected")
    name: "read_only_indexer_write_rejected",
    fixture: "Fixture",
    source: `
        local t: {read [string]: number} = {}
        t["k"] = 1
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "PropertyAccessViolation", fields: { context: "CannotWrite" } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:4767 TEST_CASE_FIXTURE(Fixture, "read_only_indexer_covariance")
    name: "read_only_indexer_covariance",
    fixture: "Fixture",
    source: `
        local rw: {[string]: number} = {}
        local ro: {read [string]: number} = rw
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:4780 TEST_CASE_FIXTURE(Fixture, "read_only_indexer_not_subtype_of_readwrite")
    name: "read_only_indexer_not_subtype_of_readwrite",
    fixture: "Fixture",
    source: `
        local ro: {read [string]: number} = {}
        local rw: {[string]: number} = ro
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "TypeMismatch", fields: { wantedType: "{ [string]: number }", givenType: "{ read [string]: number }" } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:4798 TEST_CASE_FIXTURE(Fixture, "read_only_indexer_value_covariance")
    name: "read_only_indexer_value_covariance",
    fixture: "Fixture",
    source: `
        local narrow: {read [string]: number} = {}
        local wide: {read [string]: number | string} = narrow
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:4811 TEST_CASE_FIXTURE(Fixture, "read_only_array_shorthand")
    name: "read_only_array_shorthand",
    fixture: "Fixture",
    source: `
        local t: {read number} = {1, 2, 3}
        local x: number = t[1]
        t[1] = 4
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "PropertyAccessViolation", fields: { context: "CannotWrite" } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:4829 TEST_CASE_FIXTURE(Fixture, "read_only_indexer_value_not_contravariant")
    name: "read_only_indexer_value_not_contravariant",
    fixture: "Fixture",
    source: `
        local wide: {read [string]: number | string} = {}
        local narrow: {read [string]: number} = wide
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "TypeMismatch", fields: { wantedType: "{ read [string]: number }", givenType: "{ read [string]: number | string }" } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:4847 TEST_CASE_FIXTURE(Fixture, "read_only_indexer_tostring")
    name: "read_only_indexer_tostring",
    fixture: "Fixture",
    source: `
        local t: {read [string]: number} = {}
    `,
    expect: [{ errors: 0 }, { type: "t", equals: "{ read [string]: number }" }],
  },
  {
    // TypeInfer.tables.test.cpp:4859 TEST_CASE_FIXTURE(Fixture, "read_only_indexer_read_allowed")
    name: "read_only_indexer_read_allowed",
    fixture: "Fixture",
    source: `
        local t: {read [string]: number} = {}
        local x: number = t["k"]
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:4871 TEST_CASE_FIXTURE(Fixture, "read_only_indexer_cannot_cover_readwrite_property")
    name: "read_only_indexer_cannot_cover_readwrite_property",
    fixture: "Fixture",
    source: `
        local ro: {read [string]: number} = {}
        local t: {foo: number} = ro
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "TypeMismatch", fields: { wantedType: "{ foo: number }", givenType: "{ read [string]: number }" } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:4890 TEST_CASE_FIXTURE(Fixture, "intersection_of_read_only_indexers_is_read_only")
    name: "intersection_of_read_only_indexers_is_read_only",
    fixture: "Fixture",
    source: `
        local function readOk(t: {read [string]: number} & {read [string]: number | string})
            local _x: number = t["k"]
        end
        local function writeFails(t: {read [string]: number} & {read [string]: number | string})
            t["k"] = 1
        end
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "PropertyAccessViolation", fields: { table: "{ read [string]: number | string } & { read [string]: number }", key: "k", context: "CannotWrite" } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:4913 TEST_CASE_FIXTURE(Fixture, "intersection_of_read_only_and_read_write_indexer_allows_writes")
    name: "intersection_of_read_only_and_read_write_indexer_allows_writes",
    fixture: "Fixture",
    source: `
        local function readOk(t: {read [string]: number} & {[string]: number | string})
            local _x: number = t["k"]
        end
        local function writeOk(t: {read [string]: number} & {[string]: number | string})
            t["k"] = 1
        end
        local function writeFails(t: {read [string]: number} & {[string]: number | string})
            t["k"] = "hello"
        end
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "TypeMismatch", fields: { wantedType: "number", givenType: "string" } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:4938 TEST_CASE_FIXTURE(Fixture, "table_writes_introduce_write_properties")
    name: "table_writes_introduce_write_properties",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        function oc(player, speaker)
            local head = speaker.Character:FindFirstChild('Head')
            speaker.Character = player[1].Character
        end
    `,
    expect: [
      { errors: 0 },
      { type: "oc", equals: "<T>({{ read Character: t1 }}, { Character: t1 }) -> () where t1 = { read FindFirstChild: (t1, string) -> (T, ...unknown) }" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:4960 TEST_CASE_FIXTURE(BuiltinsFixture, "tables_can_have_both_metatables_and_indexers")
    name: "tables_can_have_both_metatables_and_indexers",
    fixture: "BuiltinsFixture",
    source: `
        local a = {}
        a[1] = 5
        a[2] = 17

        local t = {}
        setmetatable(a, t)

        local c = a[1]
        print(a[1])
    `,
    expect: [{ errors: 0 }, { type: "c", equals: "number" }],
  },
  {
    // TypeInfer.tables.test.cpp:4979 TEST_CASE_FIXTURE(Fixture, "refined_thing_can_be_an_array")
    name: "refined_thing_can_be_an_array",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        function foo(x, y)
            if x then
                return x[1]
            else
                return y
            end
        end
    `,
    expect: [{ errors: 0 }, { type: "foo", equals: "<T>({T}, T) -> T" }],
  },
  {
    // TypeInfer.tables.test.cpp:4996 TEST_CASE_FIXTURE(Fixture, "parameter_was_set_an_indexer_and_bounded_by_string")
    name: "parameter_was_set_an_indexer_and_bounded_by_string",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        function f(t)
            local s: string = t
            t[5] = 7
        end
    `,
    expect: [
      { errors: 3 },
      { error: 0, message: "Parameter 't' has been reduced to never. This function is not callable with any possible value." },
      { error: 1, message: "Parameter 't' is required to be a subtype of 'string' here." },
      { error: 2, message: "Parameter 't' is required to be a subtype of '{number}' here." },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:5016 TEST_CASE_FIXTURE(Fixture, "parameter_was_set_an_indexer_and_bounded_by_another_parameter")
    name: "parameter_was_set_an_indexer_and_bounded_by_another_parameter",
    fixture: "Fixture",
    flags: { LuauTraverseScopeToFunction: true },
    ignoreMissingAnnotations: true,
    source: `
        function f(t1, t2)
            t1[5] = 7 -- 't1 <: {number}
            t2 = t1   -- 't1 <: 't2
            t1[5] = 7 -- 't1 <: {number}
        end
    `,
    expect: [
      { errors: 0 },
      { type: "f", equals: "(unknown & {number} & {number}, unknown) -> ()" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:5038 TEST_CASE_FIXTURE(Fixture, "write_to_union_property_not_all_present")
    // Upstream compares the assigned type with Luau's builtin types, ported as
    // printing as their names.
    name: "write_to_union_property_not_all_present",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        type Animal = {tag: "Cat", meow: boolean} | {tag: "Dog", woof: boolean}
        function f(t: Animal)
            t.tag = "Dog"
        end
    `,
    expect: [
      { errors: "some" },
      { error: 0, code: "CannotAssignToNever", fields: { rhsType: "string", reason: "PropertyNarrowed", cause: ["\"Cat\"", "\"Dog\""] } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:5062 TEST_CASE_FIXTURE(Fixture, "mymovie_read_write_tables_bug")
    name: "mymovie_read_write_tables_bug",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        type MockedResponseBody = string | (() -> MockedResponseBody)
        type MockedResponse = { type: 'body', body: MockedResponseBody } | { type: 'error' }

        local function mockedResponseToHttpResponse(mockedResponse: MockedResponse)
            assert(mockedResponse.type == 'body', 'Mocked response is not a body')
            if typeof(mockedResponse.body) == 'string' then
            else
                return mockedResponseToHttpResponse(mockedResponse)
            end
        end
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.tables.test.cpp:5081 TEST_CASE_FIXTURE(Fixture, "mymovie_read_write_tables_bug_2")
    name: "mymovie_read_write_tables_bug_2",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        type MockedResponse = { type: 'body' } | { type: 'error' }

        local function mockedResponseToHttpResponse(mockedResponse: MockedResponse)
            assert(mockedResponse.type == 'body', 'Mocked response is not a body')

            if typeof(mockedResponse.body) == 'string' then
            elseif typeof(mockedResponse.body) == 'table' then
            else
                return mockedResponseToHttpResponse(mockedResponse)
            end
        end
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.tables.test.cpp:5101 TEST_CASE_FIXTURE(BuiltinsFixture, "instantiated_metatable_frozen_table_clone_mutation")
    name: "instantiated_metatable_frozen_table_clone_mutation",
    fixture: "BuiltinsFixture",
    checks: [
      {
        module: "game/worker",
        unparsed: { defect: 877 }, // a :: cast to a type that is not also an expression
        source: `
type WorkerImpl<T..., R...> = {
    destroy: (self: Worker<T..., R...>) -> boolean,
}

type WorkerProps = { id: number }

export type Worker<T..., R...> = typeof(setmetatable({} :: WorkerProps, {} :: WorkerImpl<T..., R...>))

return {}
    `,
        expect: [],
      },
      {
        module: "game/library",
        unparsed: { defect: 879 }, // a call to require
        source: `
local Worker = require(game.worker)

export type Worker<T..., R...> = Worker.Worker<T..., R...>

return {}
    `,
        expect: [{ errors: 0 }],
      },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:5127 TEST_CASE_FIXTURE(Fixture, "setprop_on_a_mutating_local_in_both_loops_and_functions")
    name: "setprop_on_a_mutating_local_in_both_loops_and_functions",
    fixture: "Fixture",
    source: `
        local _ = 5

        while (_) do
            _._ = nil
            function _()
                _ = nil
            end
        end
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.tables.test.cpp:5143 TEST_CASE_FIXTURE(Fixture, "cant_index_this")
    name: "cant_index_this",
    fixture: "Fixture",
    source: `
        local a: number = 9
        a[18] = "tomfoolery"
    `,
    expect: [{ errors: 1 }, { error: 0, code: "NotATable", fields: { ty: "number" } }],
  },
  {
    // TypeInfer.tables.test.cpp:5158 TEST_CASE_FIXTURE(Fixture, "setindexer_multiple_tables_intersection")
    name: "setindexer_multiple_tables_intersection",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        local function f(t: { [string]: number } & { [thread]: boolean }, x)
            local k = "a"
            t[k] = x
        end
    `,
    expect: [
      { errors: 2 },
      { type: "f", equals: "({ [string]: number } & { [thread]: boolean }, never) -> ()" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:5174 TEST_CASE_FIXTURE(Fixture, "insert_a_and_f_of_a_into_table_res_in_a_loop")
    name: "insert_a_and_f_of_a_into_table_res_in_a_loop",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        local function f(t)
            local res = {}

            for k, a in t do
                res[k] = f(a)
                res[k] = a
            end
        end
    `,
    expect: [{ errors: 1 }, { error: 0, code: "FunctionExitsWithoutReturning" }],
  },
  {
    // TypeInfer.tables.test.cpp:5198 TEST_CASE_FIXTURE(BuiltinsFixture, "ipairs_adds_an_unbounded_indexer")
    name: "ipairs_adds_an_unbounded_indexer",
    fixture: "BuiltinsFixture",
    source: `
        --!strict

        local a = {}
        ipairs(a)
    `,
    expect: [{ type: "a", equals: "{unknown}", options: { exhaustive: true } }],
  },
  {
    // TypeInfer.tables.test.cpp:5215 TEST_CASE_FIXTURE(BuiltinsFixture, "index_results_compare_to_nil")
    name: "index_results_compare_to_nil",
    fixture: "BuiltinsFixture",
    source: `
        --!strict

        function foo(tbl: {number})
            if tbl[2] == nil then
                print("foo")
            end

            if tbl[3] ~= nil then
                print("bar")
            end
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:5234 TEST_CASE_FIXTURE(BuiltinsFixture, "fuzzer_normalization_preserves_tbl_scopes")
    name: "fuzzer_normalization_preserves_tbl_scopes",
    fixture: "BuiltinsFixture",
    malformed: "the fuzzer's `Module 'l0':` headers are not Luau, and `if if nil then _ then` has an if expression with no else",
    source: `
Module 'l0':
do end

Module 'l1':
local _ = {n0=nil,}
if if nil then _ then
if nil and (_)._ ~= (_)._ then
do end
while _ do
_ = _
do end
end
end
do end
end
local l0
while _ do
_ = nil
(_[_])._ %= \`{# _}{bit32.extract(# _,1)}\`
end

`,
    expect: [],
  },
  {
    // TypeInfer.tables.test.cpp:5261 TEST_CASE_FIXTURE(BuiltinsFixture, "table_literal_inference_assert")
    name: "table_literal_inference_assert",
    fixture: "BuiltinsFixture",
    unparsed: { defect: 1020 }, // a qualified type name such as types.Button
    source: `
        local buttons = {
            buttons = {};
        }

        buttons.Button = {
            call = nil;
            lightParts = nil;
            litPropertyOverrides = nil;
            model = nil;
            pivot = nil;
            unlitPropertyOverrides = nil;
        }
        buttons.Button.__index = buttons.Button

        local lightFuncs: { (self: types.Button, lit: boolean) -> nil } = {
            ['\\x00'] = function(self: types.Button, lit: boolean)
        end;
        }
    `,
    expect: [],
  },
  {
    // TypeInfer.tables.test.cpp:5285 TEST_CASE_FIXTURE(BuiltinsFixture, "metatable_table_assertion_crash")
    name: "metatable_table_assertion_crash",
    fixture: "BuiltinsFixture",
    source: `
        local NexusInstance = {}
        function NexusInstance:__InitMetaMethods(): ()
            local Metatable = {}
            local OriginalIndexTable = getmetatable(self).__index
            setmetatable(self, Metatable)

            Metatable.__newindex = function(_, Index: string, Value: any): ()
                --Return if the new and old values are the same.
                if self[Index] == Value then
                end
            end
        end
    `,
    expect: [],
  },
  {
    // TypeInfer.tables.test.cpp:5303 TEST_CASE_FIXTURE(BuiltinsFixture, "table::insert_should_not_report_errors_when_correct_overload_is_picked")
    name: "table::insert_should_not_report_errors_when_correct_overload_is_picked",
    fixture: "BuiltinsFixture",
    source: `
type cs = { GetTagged : (cs, string) -> any}
local destroyQueue: {any} = {} -- pair of (time, coin)
local tick : () -> any
local CS : cs
local DESTROY_DELAY
local function SpawnCoin()
	local spawns = CS:GetTagged('CoinSpawner')
	local n : any
	local StartPos = spawns[n].CFrame
	local Coin = script.Coin:Clone()
	Coin.CFrame = StartPos
	Coin.Parent = workspace.Coins

	table.insert(destroyQueue, {tick() + DESTROY_DELAY, Coin})
end
`,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:5327 TEST_CASE_FIXTURE(Fixture, "indexing_branching_table")
    name: "indexing_branching_table",
    fixture: "Fixture",
    flags: { LuauRemoveConstraintSolverEmplace: true },
    source: `
        local test = if true then { "meow", "woof" } else { 4, 81 }
        local test2 = test[1]
    `,
    expect: [{ errors: 0 }, { type: "test2", equals: "number | string | string" }],
  },
  {
    // TypeInfer.tables.test.cpp:5351 TEST_CASE_FIXTURE(BuiltinsFixture, "indexing_branching_table2")
    name: "indexing_branching_table2",
    fixture: "BuiltinsFixture",
    source: `
        local test = if true then {} else {}
        local test2 = test[1]
    `,
    expect: [{ errors: 0 }, { type: "test2", equals: "unknown | unknown" }],
  },
  {
    // TypeInfer.tables.test.cpp:5367 TEST_CASE_FIXTURE(BuiltinsFixture, "length_of_array_is_number")
    name: "length_of_array_is_number",
    fixture: "BuiltinsFixture",
    source: `
        local function TestFunc(ranges: {number}): number
            if true then
                ranges = {} :: {number}
            end
            local numRanges: number = #ranges
            return numRanges
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:5382 TEST_CASE_FIXTURE(BuiltinsFixture, "subtyping_with_a_metatable_table_path")
    name: "subtyping_with_a_metatable_table_path",
    fixture: "BuiltinsFixture",
    source: `
        type self = {} & {}
        type Class = typeof(setmetatable())
        local function _(): Class
            return setmetatable({}::self, {})
        end
    `,
    expect: [
      { errors: 4 },
      { error: 0, location: [2, 21, 2, 43] },
      { error: 0, message: "Type function instance setmetatable<unknown, unknown> is uninhabited" },
      { error: 1, location: [2, 28, 2, 40] },
      { error: 1, message: "Argument count mismatch. Function expects 2 arguments, but none are specified" },
      { error: 2, location: [3, 8, 5, 11] },
      { error: 2, message: "Type function instance setmetatable<unknown, unknown> is uninhabited" },
      { error: 3, message: "Expected this to be 'setmetatable<unknown, unknown>', but got 'setmetatable<{  } & {  }, {  }>'; \nthe 1st type pack entry is `setmetatable<{  } & {  }, {  }>` and the reduced form of the 1st type pack entry is `never`, and `setmetatable<{  } & {  }, {  }>` is not a subtype of `never`" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:5420 TEST_CASE_FIXTURE(BuiltinsFixture, "metatable_union_type")
    name: "metatable_union_type",
    fixture: "BuiltinsFixture",
    ignoreMissingAnnotations: true,
    source: `
        local function set(key, value)
            local Message = {}
            function Message.new(message)
                local self = message or {}
                setmetatable(self, Message)
                return self
            end
            local self = Message.new(nil)
            self[key] = value
        end
    `,
    expect: [
      { errors: 1 },
      { error: 0, message: "Cannot add indexer to table 'setmetatable<(nil & ~(false?)) | {  }, t1> where t1 = { new: <T>(T) -> setmetatable<(T & ~(false?)) | {  }, t1> }'" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:5448 TEST_CASE_FIXTURE(Fixture, "function_check_constraint_too_eager")
    name: "function_check_constraint_too_eager",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local function doTheThing(_: { [string]: unknown }) end
        doTheThing({
            ['foo'] = 5,
            ['bar'] = 'heyo',
        })
    `,
        expect: [{ errors: 0 }],
      },
      {
        source: `
        type Input = { [string]: unknown }

        local i : Input = {
            [('%s'):format('3.14')]=5,
            ['stringField']='Heyo'
        }
    `,
        expect: [{ errors: 0 }],
      },
      {
        source: `
        type Input = { [string]: unknown }

        local function doTheThing(_: Input) end

        doTheThing({
            [('%s'):format('3.14')]=5,
            ['stringField']='Heyo'
        })
    `,
        expect: [{ errors: 0 }],
      },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:5488 TEST_CASE_FIXTURE(BuiltinsFixture, "magic_functions_bidirectionally_inferred")
    name: "magic_functions_bidirectionally_inferred",
    fixture: "BuiltinsFixture",
    checks: [
      {
        source: `
        local function getStuff(): (string, number, string)
            return "hello", 42, "world"
        end
        local t: { [string]: number } = {
            [select(1, getStuff())] = select(2, getStuff()),
            [select(3, getStuff())] = select(2, getStuff())
        }
    `,
        expect: [{ errors: 0 }],
      },
      {
        source: `
        local function getStuff(): (string, number, string)
            return "hello", 42, "world"
        end
        local t: { [string]: number } = {
            [select(1, getStuff())] = select(2, getStuff()),
            [select(3, getStuff())] = select(3, getStuff())
        }
    `,
        expect: [
          { errors: 1 },
          { error: 0, code: "TypeMismatch" },
          { error: 0, location: [6, 38, 6, 59], fields: { givenType: "string", wantedType: "number" } },
        ],
      },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:5523 TEST_CASE_FIXTURE(BuiltinsFixture, "read_only_property_reads")
    name: "read_only_property_reads",
    fixture: "BuiltinsFixture",
    source: `
        --!strict
        type readonlyTable = {read id: number}
        local t:readonlyTable = {id = 1}

        local _:{number} = {[t.id] = 1}
        local _:{number} = {[t.id::number] = 1}

        local arr:{number} = {}
        arr[t.id] = 1
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:5543 TEST_CASE_FIXTURE(BuiltinsFixture, "multiple_fields_in_literal")
    name: "multiple_fields_in_literal",
    fixture: "BuiltinsFixture",
    source: `
        type Foo = {
            [string]: {
                Min: number,
                Max: number
            }
        }
        local Foos: Foo = {
            ["Foo"] = {
                Min = -1,
                Max = 1
            },
            ["Foo"] = {
                Min = -1,
                Max = 1
            }
        }
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:5571 TEST_CASE_FIXTURE(BuiltinsFixture, "multiple_fields_from_fuzzer")
    name: "multiple_fields_from_fuzzer",
    fixture: "BuiltinsFixture",
    malformed: "the if expression has no else, and the function has no end",
    source: `
        function _(l0,l0) _(_,{n0=_,n0=_,},if l0:n0()[_] then _)
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.tables.test.cpp:5582 TEST_CASE_FIXTURE(BuiltinsFixture, "write_only_table_field_duplicate")
    name: "write_only_table_field_duplicate",
    fixture: "BuiltinsFixture",
    source: `
        type WriteOnlyTable = { write x: number }
        local wo: WriteOnlyTable = {
            x = 42,
            x = 13,
        }
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:5597 TEST_CASE_FIXTURE(BuiltinsFixture, "table_freeze_musnt_assert")
    name: "table_freeze_musnt_assert",
    fixture: "BuiltinsFixture",
    source: `
        local m = {}
        function m.foo()
           local self = { entries = entries, _caches = {}}
           local self = setmetatable(self, {})
           table.freeze(self)
        end
    `,
    expect: [],
  },
  {
    // TypeInfer.tables.test.cpp:5613 TEST_CASE_FIXTURE(Fixture, "optional_property_with_call")
    name: "optional_property_with_call",
    fixture: "Fixture",
    source: `
        type t = {
            key: boolean?,
            time: number,
        }

        local function num(): number
            return 0
        end

        local _: t = {
            time = num(),
        }
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:5631 TEST_CASE_FIXTURE(Fixture, "empty_union_container_overflow")
    name: "empty_union_container_overflow",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        --!strict
        local CellRenderer = {}
        function CellRenderer:init(props)
            self._separators = {
                unhighlight = function()
                    local cellKey, prevCellKey = self.props.cellKey, self.props.prevCellKey
                    self.props.onUpdateSeparators({ cellKey, prevCellKey })
                end,
                updateProps = function (select, newProps)
                    local cellKey, prevCellKey = self.props.cellKey, self.props.prevCellKey
                    self.props.onUpdateSeparators({ if select == 'leading' then prevCellKey else cellKey })
                end
            }
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:5653 TEST_CASE_FIXTURE(Fixture, "inference_in_constructor")
    name: "inference_in_constructor",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        local function new(y)
            local t: { x: number } = { x = y }
            return t
        end
    `,
    expect: [{ errors: 0 }, { type: "new", equals: "(number) -> { x: number }" }],
  },
  {
    // TypeInfer.tables.test.cpp:5666 TEST_CASE_FIXTURE(Fixture, "returning_optional_in_table")
    name: "returning_optional_in_table",
    fixture: "Fixture",
    source: `
        local Numbers = { zero = 0 }
        local function FuncA(): { Value: number? }
            return { Value = Numbers.zero }
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:5676 TEST_CASE_FIXTURE(Fixture, "returning_mismatched_optional_in_table")
    name: "returning_mismatched_optional_in_table",
    fixture: "Fixture",
    source: `
        local Numbers = { str = ( "" :: string ) }
        local function FuncB(): { Value: number? }
            return {
                Value = Numbers.str
            }
        end
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "TypeMismatch", fields: { givenType: "string", wantedType: "number?" } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:5695 TEST_CASE_FIXTURE(Fixture, "optional_function_in_table")
    name: "optional_function_in_table",
    fixture: "Fixture",
    checks: [
      {
        source: `
        local t: { (() -> ())? } = {
            function() end,
        }
    `,
        expect: [{ errors: 0 }],
      },
      {
        source: `
        local t: { ((number) -> ())? } = {
            function(_: string) end,
        }
    `,
        expect: [
          { errors: 1 },
          { error: 0, code: "TypeMismatch" },
          { error: 0, location: [2, 12, 2, 35], fields: { givenType: "(string) -> ()", wantedType: "((number) -> ())?" } },
        ],
      },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:5719 TEST_CASE_FIXTURE(Fixture, "oss_1596_expression_in_table")
    name: "oss_1596_expression_in_table",
    fixture: "Fixture",
    source: `
        type foo = {abc: number?}
        local x: foo = {abc = 100}
        local y: foo = {abc = 10 * 10}
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:5728 TEST_CASE_FIXTURE(Fixture, "oss_1615_parametrized_type_alias")
    name: "oss_1615_parametrized_type_alias",
    fixture: "Fixture",
    source: `
        type Pair<Node> = { sep: {}? }
        local a: Pair<{}> = {
            sep = nil,
        }
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:5738 TEST_CASE_FIXTURE(Fixture, "oss_1543_optional_generic_param")
    name: "oss_1543_optional_generic_param",
    fixture: "Fixture",
    source: `
        type foo<T> = { bar: T? }

        local foo: foo<any> = { bar = "foobar" }
        local foo: foo<any> = { }
        local foo: foo<nil> = { }
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:5749 TEST_CASE_FIXTURE(Fixture, "missing_fields_bidirectional_inference")
    name: "missing_fields_bidirectional_inference",
    fixture: "Fixture",
    source: `
        type Book = { title: string, author: string }
        local b: Book = { title = "The Odyssey" }
        local t: { Book } = {
            { title = "The Illiad", author = "Homer" },
            { title = "Inferno", author = "Virgil" },
            { author = "Virgil" },
        }
    `,
    expect: [
      { errors: 2 },
      { error: 0, code: "MissingProperties", fields: { properties: ["author"] } },
      { error: 0, location: [2, 24, 2, 49] },
      { error: 1, code: "MissingProperties", fields: { properties: ["title"] } },
      { error: 1, location: [6, 12, 6, 33] },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:5776 TEST_CASE_FIXTURE(Fixture, "generic_index_syntax_bidirectional_infer_with_tables")
    name: "generic_index_syntax_bidirectional_infer_with_tables",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        local function getStatus(): string
            return "Yeah can you look in returned books?"
        end
        local function getPratchettStatus()
            return { isLate = true }
        end
        type Status = { isLate: boolean, daysLate: number? }
        local key1 = "Great Expecations"
        local key2 = "The Outsiders"
        local key3 = "Guards! Guards!"
        local books: { [string]: Status } = {
            [key1] = { isLate = true, daysLate = "coconut" },
            [key2] = getStatus(),
            [key3] = getPratchettStatus()
        }
    `,
    expect: [
      { errors: 3 },
      { error: 0, code: "TypeMismatch", fields: { givenType: "string", wantedType: "number?" } },
      { error: 0, location: [12, 49, 12, 58] },
      { error: 1, code: "TypeMismatch", fields: { givenType: "string", wantedType: "Status" } },
      { error: 1, location: [13, 21, 13, 32] },
      { error: 2, code: "TypeMismatch", fields: { givenType: "{ isLate: boolean }", wantedType: "Status" } },
      { error: 2, location: [14, 21, 14, 41] },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:5817 TEST_CASE_FIXTURE(Fixture, "deeply_nested_classish_inference")
    name: "deeply_nested_classish_inference",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        local function f(part, flag, params)
            local humanoid = part.Parent:FindFirstChild("Humanoid") or part.Parent.Parent:FindFirstChild("Humanoid")
            if humanoid.Parent:GetAttribute("Blocking") then
                if flag then
                    params.Found = { humanoid }
                else
                    humanoid:Think(1)
                end
            else
                humanoid:Think(2)
            end
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:5841 TEST_CASE_FIXTURE(Fixture, "bigger_nested_table_causes_big_type_error")
    name: "bigger_nested_table_causes_big_type_error",
    fixture: "Fixture",
    source: `
        type File = {
            type: "file",
            name: string,
            content: string?,
        }

        type Dir = {
            type: "dir",
            name: string,
            children: { File | Dir }?,
        }


        type DirectoryChildren = { File | Dir }

        local newtree: DirectoryChildren = {
            {
                type = "dir",
                name = "src",
                children = {
                    {
                        type = "file",
                        path = "main.luau", -- I accidentally assign "path" instead of "name", causing a huge scary TypeError
                    }
                }
            }
        }
    `,
    expect: [
      { errors: 1 },
      { error: 0, message: "Table type '{ path: string, type: \"file\" }' not compatible with type 'File' because the former is missing field 'name'" },
      { error: 0, location: [21, 20, 24, 21] },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:5882 TEST_CASE_FIXTURE(Fixture, "unsafe_bidirectional_mutation")
    name: "unsafe_bidirectional_mutation",
    fixture: "Fixture",
    source: `
        type F = {
            _G: () -> ()
        }
        function _()
            return
        end
        local function h(f: F) end
        h({
            _G = {},
            _G = _,
        })
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:5903 TEST_CASE_FIXTURE(BuiltinsFixture, "function_call_in_indexer_with_compound_assign")
    name: "function_call_in_indexer_with_compound_assign",
    fixture: "BuiltinsFixture",
    source: `
        --!strict
        local _ = 7143424
        _[
            setfenv(
                ...,
                {
                    n0 = _,
                }
            )
        ] *= _
    `,
    expect: [],
  },
  {
    // TypeInfer.tables.test.cpp:5921 TEST_CASE_FIXTURE(Fixture, "stop_refining_new_table_indices_for_non_primitive_tables")
    name: "stop_refining_new_table_indices_for_non_primitive_tables",
    fixture: "Fixture",
    source: `
        local foo:{val:number} = {val = 1}
        if foo.vall then
            local bar = foo.vall
        end
    `,
    expect: [{ errors: 1 }, { anyError: "UnknownProperty" }],
  },
  {
    // TypeInfer.tables.test.cpp:5936 TEST_CASE_FIXTURE(Fixture, "fuzz_match_literal_type_crash_again")
    name: "fuzz_match_literal_type_crash_again",
    fixture: "Fixture",
    source: `
        function f(_: { [string]: {unknown}} ) end
        f(
            {
                _ = { 42 },
                _ = { x = "foo" },
            }
        )
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:5951 TEST_CASE_FIXTURE(Fixture, "type_mismatch_in_dict")
    // Upstream prints the wanted and given types exhaustively.
    name: "type_mismatch_in_dict",
    fixture: "Fixture",
    source: `
        --!strict
        local dict: {[string]: boolean} = {
            code1 = true,
            code2 = 123,
        }
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "TypeMismatch", fields: { wantedType: "boolean", givenType: "number" } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:5968 TEST_CASE_FIXTURE(Fixture, "narrow_table_literal_check")
    name: "narrow_table_literal_check",
    fixture: "Fixture",
    source: `
        --!strict
        local dict: { code1: boolean } = {
            code1 = 123,
        }
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "TypeMismatch", fields: { givenType: "number", wantedType: "boolean" } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:5985 TEST_CASE_FIXTURE(Fixture, "narrow_table_literal_check_regression")
    name: "narrow_table_literal_check_regression",
    fixture: "Fixture",
    source: `
        --!strict
        local d1: { code1: boolean } = {
            code1 = true,
        }
        local d2: { [string]: number } = d1
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "TypeMismatch", fields: { givenType: "{ code1: boolean }", wantedType: "{ [string]: number }" } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:6003 TEST_CASE_FIXTURE(Fixture, "narrow_table_literal_check_assignment")
    name: "narrow_table_literal_check_assignment",
    fixture: "Fixture",
    source: `
        --!strict
        local d1: { code1: boolean } = {
            code1 = true,
        }
        d1 = { code1 = 42 }
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "TypeMismatch" },
      { error: 0, location: [5, 23, 5, 25], fields: { givenType: "number", wantedType: "boolean" } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:6022 TEST_CASE_FIXTURE(Fixture, "disable_singleton_inference_on_large_tables")
    name: "disable_singleton_inference_on_large_tables",
    fixture: "Fixture",
    limits: { LuauPrimitiveInferenceInTableLimit: 2 },
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        type Word = "foo" | "bar"
        local words: { Word } = { "foo", "bar", "foo" }
    `,
    expect: [{ errors: 3 }],
  },
  {
    // TypeInfer.tables.test.cpp:6036 TEST_CASE_FIXTURE(Fixture, "disable_singleton_inference_on_large_nested_tables")
    name: "disable_singleton_inference_on_large_nested_tables",
    fixture: "Fixture",
    limits: { LuauPrimitiveInferenceInTableLimit: 2 },
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        type Word = "foo" | "bar"
        local words: {{ Word }} = {{ "foo", "bar", "foo" }}
    `,
    expect: [{ errors: 3 }],
  },
  {
    // TypeInfer.tables.test.cpp:6048 TEST_CASE_FIXTURE(Fixture, "large_table_inference_does_not_bleed")
    name: "large_table_inference_does_not_bleed",
    fixture: "Fixture",
    limits: { LuauPrimitiveInferenceInTableLimit: 2 },
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        type Word = "foo" | "bar"
        local words: { Word } = { "foo", "bar", "foo" }
        local otherWords: { Word } = {"foo"}
    `,
    expect: [{ errors: 3 }, { error: 0, line: 2 }, { error: 1, line: 2 }, { error: 2, line: 2 }],
  },
  {
    // TypeInfer.tables.test.cpp:6064 TEST_CASE_FIXTURE(Fixture, "extremely_large_table" * doctest::timeout(LUAU_TIMEOUT))
    // The source lists "foo" 10,000 times, as upstream builds it.
    name: "extremely_large_table",
    fixture: "Fixture",
    source: "local res = {\n" + "\"foo\",\n".repeat(10_000) + "}",
    expect: [{ errors: 0 }, { type: "res", equals: "{string}", options: { exhaustive: true } }],
  },
  {
    // TypeInfer.tables.test.cpp:6073 TEST_CASE_FIXTURE(Fixture, "oss_1838")
    name: "oss_1838",
    fixture: "Fixture",
    source: `
        local myTable = {}
        myTable.foo = {}
        myTable.foo.bar = {}
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:6082 TEST_CASE_FIXTURE(Fixture, "oss_1859")
    name: "oss_1859",
    fixture: "Fixture",
    source: `
        --!strict

        type Cat = {
            name: string,
            age: number,
            actions: {
                otherfield: string,
                meow: () -> string,
            }
        }

        local function new(): Cat
            local self = {}
            self.name = "Taz"
            self.age = 12
            self.actions = {}
            self.actions.meow = function() return "meow" end
            -- We're missing \`otherfield\` here so we should complain.
            return self
        end
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "TypeMismatch", fields: { wantedType: "Cat", givenType: "{ actions: { meow: (...any) -> string }, age: number, name: string }" } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:6116 TEST_CASE_FIXTURE(BuiltinsFixture, "oss_1797_intersection_of_tables_arent_disjoint")
    name: "oss_1797_intersection_of_tables_arent_disjoint",
    fixture: "BuiltinsFixture",
    unparsed: { defect: 876 }, // a variadic type written ...T, or T... inside << >>
    source: `
        --!strict

        export type Foo = {
            foo: string,
        }

        export type Bar = Foo & {
            copy: (...any) -> any
        }

        local function _test(nd: { bar: Bar? })
            local bar = nd.bar
            if not bar then
                return
            end
            print(bar)
        end
    `,
    expect: [{ errors: 0 }, { typeAt: [16, 20], equals: "Foo & { copy: (...any) -> any }" }],
  },
  {
    // TypeInfer.tables.test.cpp:6145 TEST_CASE_FIXTURE(Fixture, "oss_1344")
    name: "oss_1344",
    fixture: "Fixture",
    source: `
        --!strict
        type t = {
        	value: string?,
        }

        local t: t = {}

        if not t.value then
        	t.value = ""
        end

        local s: string? = nil

        if not s then
        	s = ""
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:6167 TEST_CASE_FIXTURE(BuiltinsFixture, "oss_1651")
    name: "oss_1651",
    fixture: "BuiltinsFixture",
    source: `
        --!strict
        local MyModule = {}
        MyModule._isEnabled = true :: boolean

        assert(MyModule._isEnabled, \`type solver\`)
        MyModule._isEnabled = false
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:6179 TEST_CASE_FIXTURE(Fixture, "narrow_table_literal_check_call")
    name: "narrow_table_literal_check_call",
    fixture: "Fixture",
    source: `
        local function take(_: { foo: string? }) end

        take({ foo = "bar" })
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:6190 TEST_CASE_FIXTURE(Fixture, "narrow_table_literal_check_call_incorrect")
    name: "narrow_table_literal_check_call_incorrect",
    fixture: "Fixture",
    source: `
        local function take(_: { foo: string?, bing: number }) end

        take({ foo = "bar", bing = true })
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "TypeMismatch" },
      { error: 0, location: [3, 35, 3, 39], fields: { givenType: "boolean", wantedType: "number" } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:6208 TEST_CASE_FIXTURE(Fixture, "narrow_table_literal_check_call_singleton")
    name: "narrow_table_literal_check_call_singleton",
    fixture: "Fixture",
    source: `
        local function take(_: { foo: "foo" }) end

        take({ foo = "foo" })
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:6221 TEST_CASE_FIXTURE(BuiltinsFixture, "oss_1450")
    name: "oss_1450",
    fixture: "BuiltinsFixture",
    source: `
        local keycodes = {
            Alt = 2,
            Space = 3,
            Tab = 4,
        }

        type Keycode = keyof<typeof(keycodes)>
        local function sendInput(keycodes: { Keycode })
            print(keycodes)
        end

        sendInput({"Alt"}) -- shouldn't error
        sendInput(
            {
                "Alt",
                "Space",
                "Ctrl", -- should error
            }
        )
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "TypeMismatch" },
      { error: 0, location: [17, 16, 17, 22], fields: { wantedType: "\"Alt\" | \"Space\" | \"Tab\"", givenType: "\"Ctrl\"" } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:6256 TEST_CASE_FIXTURE(Fixture, "oss_1888_and_or_subscriptable")
    name: "oss_1888_and_or_subscriptable",
    fixture: "Fixture",
    source: `
        export type CachedValue<T> = {
            future: any,
            timestamp: number,
            ttl: number?,
        }

        type Cache<T> = { [string]: CachedValue<T> }
        type CacheMap = { [string]: Cache<any> }

        local _caches: CacheMap = {}

        local CacheManager = {}

        function CacheManager:has(cacheName: string, id: string): boolean
            local cache = _caches[cacheName]
            local entry = cache and cache[id]
            return entry ~= nil
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:6280 TEST_CASE_FIXTURE(Fixture, "cli_119126_regression")
    name: "cli_119126_regression",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        type literals = "foo" | "bar" | "foobar"

        local exampleA: {[literals]: string} = {
            foo = '1',
            bar = 2,
            foobar = 3,
        }
    `,
    expect: [
      { errors: 2 },
      { error: 0, code: "TypeMismatch", fields: { wantedType: "string", givenType: "number" } },
      { error: 1, code: "TypeMismatch", fields: { wantedType: "string", givenType: "number" } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:6304 TEST_CASE_FIXTURE(BuiltinsFixture, "oss_1914_access_after_assignment_with_assertion")
    name: "oss_1914_access_after_assignment_with_assertion",
    fixture: "BuiltinsFixture",
    unparsed: { defect: 1023 }, // a type ending in ? with a word after it, even on the next line
    source: `
        --!strict

        type WallHolder = {
            __type: "Model",
            Wall: {
                __type: "BasePart",
                age: number,
            },
        }

        local walls = {
            { name = "Part1" },
            { name = "Part2" },
            { name = "Wall" },
        }

        local baseWall: WallHolder?
        for _, wall in walls do
            if wall.name == "Wall" then
                baseWall = wall :: WallHolder
            end
        end
        assert(baseWall, "Failed to get base wall when creating room props")

        local myAge = baseWall.Wall.age
    `,
    expect: [{ errors: 0 }, { type: "myAge", equals: "number" }],
  },
  {
    // TypeInfer.tables.test.cpp:6339 TEST_CASE_FIXTURE(BuiltinsFixture, "cli_162179_avoid_exponential_blowup_in_normalization" * doctest::timeout(LUAU_TIMEOUT))
    // The source lists "foo" 100 times in res, as upstream builds it.
    name: "cli_162179_avoid_exponential_blowup_in_normalization",
    fixture: "BuiltinsFixture",
    source: `
        local res = { ${'"foo",'.repeat(100)} }

        local function check(index: number)
            if res[index] == "foo" then
                print("found a foo!")
            end
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:6357 TEST_CASE_FIXTURE(Fixture, "free_types_with_sealed_table_upper_bounds_can_still_be_expanded")
    name: "free_types_with_sealed_table_upper_bounds_can_still_be_expanded",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        function bar(a: {x: number}) end

        function foo(a)
            bar(a)

            -- Here, a : A where A = never <: A <: {x: number}
            -- The upper bound of A is a sealed table, but we nevertheless want to extend it.
            a.nope()
        end
    `,
    expect: [
      { errors: 0 },
      { type: "foo", equals: "({ read nope: () -> (...unknown) } & { x: number }) -> ()" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:6380 TEST_CASE_FIXTURE(Fixture, "mixed_tables_are_ok_when_explicit")
    name: "mixed_tables_are_ok_when_explicit",
    fixture: "Fixture",
    source: `
        local foo: { [number | string]: unknown } = {
            Key = "sorry",
            "A",
            "B",
        }
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:6391 TEST_CASE_FIXTURE(Fixture, "mixed_tables_are_ok_for_any_key")
    name: "mixed_tables_are_ok_for_any_key",
    fixture: "Fixture",
    source: `
        local foo: { [any]: unknown } = {
            Key = "sorry",
            "A",
            "B",
        }
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:6402 TEST_CASE_FIXTURE(BuiltinsFixture, "oss_1935")
    name: "oss_1935",
    fixture: "BuiltinsFixture",
    source: `
        --!strict
        type Drawing = {
            update: (() -> boolean)?,
        }

        type Counter = {
            count: number,
        }

        function update(): boolean
            return true
        end

        return function(): Drawing & Counter
            return {
                count = 34,
                update = update,
            }
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:6427 TEST_CASE_FIXTURE(Fixture, "result_like_tagged_union")
    name: "result_like_tagged_union",
    fixture: "Fixture",
    unparsed: { defect: 876 }, // a variadic type written ...T, or T... inside << >>
    source: `
--!strict
local function retry(func: (...any) -> ...any): { type: "ok", value: any } | { type: "failed" }
    local success: boolean, result: any = func()

    if success then
        return { type = "ok", value = result }
    else
        return { type = "failed" }
    end
end

return retry
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:6445 TEST_CASE_FIXTURE(Fixture, "oss_1924")
    name: "oss_1924",
    fixture: "Fixture",
    source: `
        local t: { [string]: "s" } = {
            key = "s",
            other_key = "t",
        }
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "TypeMismatch", fields: { wantedType: "\"s\"", givenType: "\"t\"" } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:6462 TEST_CASE_FIXTURE(BuiltinsFixture, "cli_167052")
    name: "cli_167052",
    fixture: "BuiltinsFixture",
    source: `
        local Children = newproxy()
        local Macro: { [ string | typeof(Children) ]: true } = {
            ["_exec"] = true;
            ["_run"] = true;
            ["_init"] = true;
            ["_base"] = true;
            ["Class"] = true;
            ["_count"] = true;
            [Children] = true;
        }
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:6478 TEST_CASE_FIXTURE(Fixture, "duplicate_prop_references_share_same_result_type_and_constraint")
    name: "duplicate_prop_references_share_same_result_type_and_constraint",
    fixture: "Fixture",
    source: `
local tbl = {}
function f(x : number) : () end
function tbl:updateAmmoText()
    f(self.leadingZeros)
    local y = self.leadingZeros - 3
end
`,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:6491 TEST_CASE_FIXTURE(BuiltinsFixture, "table_insert_any_and_true")
    name: "table_insert_any_and_true",
    fixture: "BuiltinsFixture",
    source: `
        table.insert({} :: any, true)
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:6500 TEST_CASE_FIXTURE(BuiltinsFixture, "table_insert_array_of_any")
    name: "table_insert_array_of_any",
    fixture: "BuiltinsFixture",
    source: `
        table.insert({} :: { any }, 42)
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:6509 TEST_CASE_FIXTURE(BuiltinsFixture, "bad_insert_type_mismatch")
    name: "bad_insert_type_mismatch",
    fixture: "BuiltinsFixture",
    source: `
        local function doInsert(t: { string })
            table.insert(t, true)
        end
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "TypeMismatch", fields: { givenType: "boolean", wantedType: "string" } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:6527 TEST_CASE_FIXTURE(Fixture, "string_indexer_satisfies_read_only_property")
    name: "string_indexer_satisfies_read_only_property",
    fixture: "Fixture",
    source: `
        local function foo(t: { [string]: number }): { read X: number }
            return t
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:6540 TEST_CASE_FIXTURE(Fixture, "bidirectional_inference_works_through_intersections")
    name: "bidirectional_inference_works_through_intersections",
    fixture: "Fixture",
    source: `
        type x = {} & ({ state: "1" } | { state: "2" })
        local x: x = { state = "2" }
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:6550 TEST_CASE_FIXTURE(Fixture, "bidirectional_inference_intersection_other_intersection_example")
    name: "bidirectional_inference_intersection_other_intersection_example",
    fixture: "Fixture",
    source: `
        type A = { foo: "a" }
        type B = { bar: "b" }
        type AB = A & B
        local t: AB = {
            foo = "a",
            bar = "b",
        }
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:6565 TEST_CASE_FIXTURE(Fixture, "do_not_force_on_simple_bidirectional_inference")
    name: "do_not_force_on_simple_bidirectional_inference",
    fixture: "Fixture",
    flags: { DebugLuauAssertOnForcedConstraint: true },
    source: `
        type Role = "Citizen"

        local function getRoles(): { Role }
            return { 'Citizen' }
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:6578 TEST_CASE_FIXTURE(Fixture, "oss_2017")
    name: "oss_2017",
    fixture: "Fixture",
    flags: { DebugLuauAssertOnForcedConstraint: true },
    source: `
        --!strict
        local class = {}
        class.__index = class

        type Role = string
        local ROLES_PLAYERS_REQUIRED: {[Role]: number} = {}

        function class.distributeRoles()
            for _, role: Role in class.getAllRoles() do
                local _ = ROLES_PLAYERS_REQUIRED[role]
            end
        end

        function class.getAllRoles(): { Role }
            return { 'Citizen', 'Mafia', 'Detective', 'Bodyguard', 'Jester' }
        end

        return class
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:6604 TEST_CASE_FIXTURE(Fixture, "oss_1953")
    name: "oss_1953",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        type A = { kind: "a" }
        type B = { kind: "b" }

        local function foo<T>(fn: () -> A | B | T)
            local v = fn()
            return v and v.kind
        end
    `,
    expect: [{ errors: 1 }, { error: 0, code: "MissingUnionProperty", fields: { key: "kind" } }],
  },
  {
    // TypeInfer.tables.test.cpp:6624 TEST_CASE_FIXTURE(Fixture, "array_of_callbacks_bidirectionally_inferred")
    name: "array_of_callbacks_bidirectionally_inferred",
    fixture: "Fixture",
    flags: { DebugLuauAssertOnForcedConstraint: true },
    source: `
        local Actions : { [string]: (string?) -> number? } = {
            Foo = function (input)
                if input then
                    return 42
                else
                    return nil
                end
            end
        }
    `,
    expect: [{ errors: 0 }, { typeAt: [3, 21], equals: "string?" }],
  },
  {
    // TypeInfer.tables.test.cpp:6646 TEST_CASE_FIXTURE(BuiltinsFixture, "oss_1483")
    name: "oss_1483",
    fixture: "BuiltinsFixture",
    flags: { DebugLuauAssertOnForcedConstraint: true },
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        type Form = "do-not-register" | (() -> ())

        local function observer(register: () -> Form) end

        observer(function()
            if math.random() > 0.5 then
                return "do-not-register"
            end
            return function() end
        end)
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:6667 TEST_CASE_FIXTURE(Fixture, "oss_1910")
    name: "oss_1910",
    fixture: "Fixture",
    flags: { DebugLuauAssertOnForcedConstraint: true },
    source: `
        type Implementation = {
            on_thing: (something: boolean) -> (),
        }

        local a: Implementation = {
            on_thing = function(something)
                local _ = something
            end,
        }
    `,
    expect: [{ errors: 0 }, { typeAt: [7, 29], equals: "boolean" }],
  },
  {
    // TypeInfer.tables.test.cpp:6688 TEST_CASE_FIXTURE(BuiltinsFixture, "bidirectional_inference_variadic_type_pack")
    name: "bidirectional_inference_variadic_type_pack",
    fixture: "BuiltinsFixture",
    flags: { DebugLuauAssertOnForcedConstraint: true },
    unparsed: { defect: 876 }, // a variadic type written ...T, or T... inside << >>
    source: `
        local foo: { (...string) -> () } = {
            function (foobar)
                print(foobar)
            end
        }
    `,
    expect: [{ errors: 0 }, { typeAt: [3, 24], equals: "string" }],
  },
  {
    // TypeInfer.tables.test.cpp:6711 TEST_CASE_FIXTURE(Fixture, "table_with_intersection_containing_lambda")
    name: "table_with_intersection_containing_lambda",
    fixture: "Fixture",
    flags: { DebugLuauAssertOnForcedConstraint: true },
    source: `
        type Arg = { foo: string }

        type TypeA = { foo: string, method: (arg: Arg) -> any }

        type TypeB = TypeA & {}

        local bar: TypeB = {
            foo = "wow!",
            method = function(arg)
                local _ = arg
                return nil
            end,
        }
    `,
    expect: [
      { errors: 0 },
      { typeAt: [10, 28], equals: "{ foo: string }", options: { exhaustive: true } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:6737 TEST_CASE_FIXTURE(BuiltinsFixture, "cli_174304_allow_getmetatable_error_and_table")
    name: "cli_174304_allow_getmetatable_error_and_table",
    fixture: "BuiltinsFixture",
    source: `
        local function instanceof(tbl: any, class: any): boolean
            if typeof(tbl) ~= "table" then
                return false
            end

            local ok, hasNew = pcall(function()
                return class.new ~= nil and tbl.new == class.new
            end)
            if ok and hasNew then
                return true
            end

            while typeof(tbl) == "table" do
                tbl = getmetatable(tbl)
                if typeof(tbl) == "table" then
                    tbl = tbl.__index
                end
            end

            return false
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:6764 TEST_CASE_FIXTURE(BuiltinsFixture, "allow_indexing_into_error_or_not_nil")
    name: "allow_indexing_into_error_or_not_nil",
    fixture: "BuiltinsFixture",
    ignoreMissingAnnotations: true,
    source: `
        --!strict
        local function f(i: number, ...)
            local value = select(i, ...)
            local valueType = typeof(value)
            if value == nil then
            elseif valueType == "table" then
                for k = 1, #value do
                    local _ = value[k]
                end
            end
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:6783 TEST_CASE_FIXTURE(BuiltinsFixture, "show_not_a_table_error_when_indexing_into_non_table")
    name: "show_not_a_table_error_when_indexing_into_non_table",
    fixture: "BuiltinsFixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        --!strict
        local function f(t: number | boolean)
            t[0] = "huh"
        end
    `,
    expect: [{ errors: 1 }, { error: 0, code: "NotATable" }],
  },
  {
    // TypeInfer.tables.test.cpp:6795 TEST_CASE_FIXTURE(BuiltinsFixture, "oss_1684")
    name: "oss_1684",
    fixture: "BuiltinsFixture",
    flags: { DebugLuauAssertOnForcedConstraint: true },
    source: `
        --!strict
        local targetConfig = { ["Bag of coins"] = {}, }

        type TargetConfig = typeof(targetConfig)
        type Targets = keyof<TargetConfig>

        type QuestConfig = { target: Targets, }

        -- All of the table members that aren't "Bag of coins" should
        -- have errors.
        local questConfig: { [string]: QuestConfig  } = {
            ["Works as intended"] = { target = "Bag of coins" },
            ["Also works as intended "] = { target = "Not bag of coins" },
            ["Should warn 1"] = { target = "Also not a bag of coins" },
            ["Should warn 2"] = { target = "Still not a bag of coins" },
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
    // TypeInfer.tables.test.cpp:6826 TEST_CASE_FIXTURE(BuiltinsFixture, "oss_2094_push_type_constraint_should_always_complete")
    name: "oss_2094_push_type_constraint_should_always_complete",
    fixture: "BuiltinsFixture",
    flags: { DebugLuauAssertOnForcedConstraint: true },
    unparsed: { defect: 1021 }, // a type function declaration
    source: `
        type Interface<T> = {
            _t: T,
        }

        type function TypeFn(t: type): type
            return t
        end

        local function new<T>(t: T): Interface<TypeFn<T>>
            return {
                _t = nil :: any,
            }
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:6850 TEST_CASE_FIXTURE(Fixture, "table_access_indexer_via_name_expr")
    name: "table_access_indexer_via_name_expr",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        --!strict
        type List = "Val1" | "Val2" | "Val3"
        local Table: { [List]: boolean }
        local _ = Table.Val1
    `,
    expect: [{ errors: 0 }, { type: "_", equals: "boolean" }],
  },
  {
    // TypeInfer.tables.test.cpp:6865 TEST_CASE_FIXTURE(Fixture, "table_access_indexer_fails_with_missing_key")
    name: "table_access_indexer_fails_with_missing_key",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        --!strict
        type List = "Val2" | "Val3"
        local Table: { [List]: boolean }
        local _ = Table.Val1
    `,
    expect: [{ errors: 1 }, { error: 0, code: "UnknownProperty" }, { type: "_", equals: "any" }],
  },
  {
    // TypeInfer.tables.test.cpp:6881 TEST_CASE_FIXTURE(Fixture, "cli_184926_bidi_inference_pushes_into_lambda_return_type")
    name: "cli_184926_bidi_inference_pushes_into_lambda_return_type",
    fixture: "Fixture",
    flags: { DebugLuauAssertOnForcedConstraint: true },
    source: `
        type MyType = { Func: (transformFunction: () -> ({number})) -> () }

        local myValue = {} :: MyType

        myValue.Func(function() return {} end)
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:6897 TEST_CASE_FIXTURE(BuiltinsFixture, "do_not_allow_laundering")
    name: "do_not_allow_laundering",
    fixture: "BuiltinsFixture",
    flags: { LuauSubtypingMissingPropertiesAsNil: true },
    source: `
        --!strict
        local function foo(t: {}): { x: nil }
            return t
        end

        local t: { x: number } = { x = 42 }
        local laundered = foo(t) -- via width subtyping
        laundered.x = nil
        assert(type(t) == "number")
    `,
    expect: [{ errors: 1 }],
  },
  {
    // TypeInfer.tables.test.cpp:6919 TEST_CASE_FIXTURE(Fixture, "table_inference_one_incorrect_member")
    name: "table_inference_one_incorrect_member",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        local function makeTable(x): { x: number, y: string }
            return { x = x, y = true }
        end
    `,
    expect: [{ errors: 1 }, { type: "makeTable", equals: "(number) -> { x: number, y: string }" }],
  },
  {
    // TypeInfer.tables.test.cpp:6932 TEST_CASE_FIXTURE(Fixture, "basic_data_like_array_1")
    name: "basic_data_like_array_1",
    fixture: "Fixture",
    flags: { LuauRelateIndexersTypo: true },
    source: `
        local t = {
            {1, 2, 3},
            {4, 5, 6}
        }
    `,
    expect: [{ errors: 0 }, { type: "t", equals: "{{number}}", options: { exhaustive: true } }],
  },
  {
    // TypeInfer.tables.test.cpp:6947 TEST_CASE_FIXTURE(Fixture, "basic_data_like_array_2")
    name: "basic_data_like_array_2",
    fixture: "Fixture",
    flags: { LuauRelateIndexersTypo: true },
    source: `
        local t = {
            {1, 2, 3},
            {"foo", "bar", "baz"}
        }
    `,
    expect: [
      { errors: 0 },
      { type: "t", equals: "{{number} | {string}}", options: { exhaustive: true } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:6962 TEST_CASE_FIXTURE(Fixture, "basic_data_like_array_3")
    name: "basic_data_like_array_3",
    fixture: "Fixture",
    flags: { LuauRelateIndexersTypo: true },
    unparsed: { defect: 1023 }, // a type ending in ? with a word after it, even on the next line
    source: `
        local v: number?
        local t1 = {
            {1, 2, 3},
            {v}
        }
        local t2 = {
            {v},
            {1, 2, 3}
        }
    `,
    expect: [
      { errors: 0 },
      { type: "t1", equals: "{{number?} | {number}}", options: { exhaustive: true } },
      { type: "t2", equals: "{{number?} | {number}}", options: { exhaustive: true } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:6985 TEST_CASE_FIXTURE(Fixture, "basic_data_like_array_4")
    name: "basic_data_like_array_4",
    fixture: "Fixture",
    flags: { LuauRelateIndexersTypo: true },
    unparsed: { defect: 1023 }, // a type ending in ? with a word after it, even on the next line
    source: `
        local v: number?
        local s: string?
        local t = {
            {s},
            {v}
        }
    `,
    expect: [
      { errors: 0 },
      { type: "t", equals: "{{number?} | {string?}}", options: { exhaustive: true } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:7003 TEST_CASE_FIXTURE(Fixture, "basic_data_like_array_5")
    name: "basic_data_like_array_5",
    fixture: "Fixture",
    flags: { LuauRelateIndexersTypo: true },
    unparsed: { defect: 1023 }, // a type ending in ? with a word after it, even on the next line
    source: `
        local v: number?
        local t = {
            { entry = 42 },
            { entry = v }
        }
    `,
    expect: [
      { errors: 0 },
      { type: "t", equals: "{{ entry: number } | { entry: number? }}", options: { exhaustive: true } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:7020 TEST_CASE_FIXTURE(Fixture, "large_data_like_array_can_simplify")
    // The source returns 200 array-like and 200 record-like tables, as upstream
    // builds it.
    name: "large_data_like_array_can_simplify",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: "local function get()\n\treturn { \n" +
      Array.from({ length: 200 }, (_, i) =>
        `\t\t{${i}, ${i + 1}, ${i + 2}},\n` + (i % 2 !== 0 ? `\t\t{ foo = ${i} },\n` : `\t\t{ bar = ${i} },\n`),
      ).join("") +
      "\t}\nend\n",
    expect: [
      { errors: 0 },
      { type: "get", equals: "() -> {{ bar: number } | { foo: number } | {number}}" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:7044 TEST_CASE_FIXTURE(Fixture, "cmpeq_any_with_nil_ok")
    name: "cmpeq_any_with_nil_ok",
    fixture: "Fixture",
    source: `
type A = {
    foo : { [string] : string}
}

type B = {
	parsed: A,
}

local x : B = (nil :: any)
local found = x.parsed.foo["any"] == nil -- errors
`,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:7066 TEST_CASE_FIXTURE(Fixture, "cmpneq_any_with_nil_ok")
    name: "cmpneq_any_with_nil_ok",
    fixture: "Fixture",
    source: `
type A = {
    foo : { [string] : string}
}

type B = {
	parsed: A,
}

local x : B = (nil :: any)
local found = x.parsed.foo["any"] ~= nil -- errors
`,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:7088 TEST_CASE_FIXTURE(Fixture, "cmpneq_any_with_nil_ok_in_if")
    name: "cmpneq_any_with_nil_ok_in_if",
    fixture: "Fixture",
    source: `
type A = {
    foo : { [string] : string}
}

type B = {
	parsed: A,
}

local x : B = (nil :: any)

if x.parsed.foo["any"] ~= nil then
end

`,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:7113 TEST_CASE_FIXTURE(Fixture, "cmpeq_any_with_nil_ok_in_if")
    name: "cmpeq_any_with_nil_ok_in_if",
    fixture: "Fixture",
    source: `
type A = {
    foo : { [string] : string}
}

type B = {
	parsed: A,
}

local x : B = (nil :: any)

if x.parsed.foo["any"] == nil then
end

`,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:7139 TEST_CASE_FIXTURE(Fixture, "oss_1986")
    name: "oss_1986",
    fixture: "Fixture",
    source: `
        type A<T> = { s: T, n: number? }

        local function f<T>(_a: A<T>)
            return
        end

        f({ s = "hello", n = 1 })
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:7152 TEST_CASE_FIXTURE(Fixture, "oss_1947_partial")
    name: "oss_1947_partial",
    fixture: "Fixture",
    source: `
        local function foo<T>(bar: { qux: T, baz: string? }) end
        foo { qux = "string", baz = "a" }
        foo { qux = "string", baz = nil }
        foo { qux = "string" }
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:7164 TEST_CASE_FIXTURE(Fixture, "oss_1890")
    name: "oss_1890",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        type ListConfig<T> = {
            items: T,
            each: (item: T) -> any,
            a: string?,
        }

        local function test_fn<T>(p: ListConfig<T>)
            return nil :: any
        end

        local a = test_fn {
            items = "a",
            each = function(item: string)
                return item
            end,
            a = "a",
        }

        a = test_fn {
            items = "a",
            each = function(item: string)
                return item
            end,
        }

    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:7197 TEST_CASE_FIXTURE(Fixture, "compound_assignment_writes_lhs")
    name: "compound_assignment_writes_lhs",
    fixture: "Fixture",
    source: `
        type T = {
            read x: number
        }

        local foo: T = { x = 5 }
        foo.x += 5
    `,
    expect: [{ errors: 1 }, { error: 0, code: "PropertyAccessViolation" }],
  },
  {
    // TypeInfer.tables.test.cpp:7215 TEST_CASE_FIXTURE(Fixture, "error_supression_of_union_of_tables_should_work")
    name: "error_supression_of_union_of_tables_should_work",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        --!strict
        type Foo<T> = { kind: "foo", foo: T }
        type Bar<T> = { kind: "bar", bar: T }
        type FooBar<T> = Foo<T> | Bar<T>

        local function f(x: Foo<number>): FooBar<any>
            return x
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:7229 TEST_CASE_FIXTURE(Fixture, "no_error_suppression_for_single_bad_type_mismatch")
    name: "no_error_suppression_for_single_bad_type_mismatch",
    fixture: "Fixture",
    source: `
        local function f(t: { a: string, b: number }): { a: any, b: boolean }
            return t
        end
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "TypeMismatch", fields: { givenType: "{ a: string, b: number }", wantedType: "{ a: any, b: boolean }" } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:7244 TEST_CASE_FIXTURE(Fixture, "error_suppression_on_all_table_properties")
    name: "error_suppression_on_all_table_properties",
    fixture: "Fixture",
    source: `
        local function f(t: { a: string, b: number }): { a: any, b: any }
            return t
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:7255 TEST_CASE_FIXTURE(Fixture, "one_correct_one_suppressed_table_property")
    name: "one_correct_one_suppressed_table_property",
    fixture: "Fixture",
    source: `
        local function f(t: { a: string, b: number }): { a: any, b: number }
            return t
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:7266 TEST_CASE_FIXTURE(Fixture, "error_suppression_for_read_write")
    name: "error_suppression_for_read_write",
    fixture: "Fixture",
    source: `
        local function f(t: { [string]: string }): { read foo: any, write foo: number }
            return t
        end
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "TypeMismatch", fields: { givenType: "{ [string]: string }", wantedType: "{ read foo: any, write foo: number }" } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:7283 TEST_CASE_FIXTURE(Fixture, "table_read_any_counts_as_read_nil")
    name: "table_read_any_counts_as_read_nil",
    fixture: "Fixture",
    flags: { LuauSubtypingMissingPropertiesAsNil: true },
    source: `
        local function f(t: {}): { read foo: any }
            return t
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:7299 TEST_CASE_FIXTURE(Fixture, "tables_routing_bidirectional_inference")
    name: "tables_routing_bidirectional_inference",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        export type ReceivedRequest = {
            method: string,
            path: string,
            body: string,
            query: { [string]: string },
            headers: { [string]: string },
            params: { [string]: string },
        }

        export type ServerResponse = string | {
            status: number?,
            body: string?,
            headers: { [string]: string }?,
        }

        export type RouteHandler = Handler | ServerResponse

        export type MethodRoutes = {
            GET: RouteHandler?,
            POST: RouteHandler?,
            PUT: RouteHandler?,
            DELETE: RouteHandler?,
            PATCH: RouteHandler?,
            HEAD: RouteHandler?,
            OPTIONS: RouteHandler?,
        }

        export type RouteEntry = RouteHandler | MethodRoutes

        export type Routes = { [string]: RouteEntry }

        export type Server = {
            hostname: string,
            port: number,
            close: () -> (),
            upgrade: (self: Server, req: ReceivedRequest) -> boolean,
        }

        export type Handler = (request: ReceivedRequest, server: Server) -> ServerResponse?

        local routes: Routes? = {
            ["/health"] = "ok",
            ["/json"] = {
                status = 200,
                headers = { ["Content-Type"] = "application/json" },
                body = '{"ok":true}',
            },
            ["/hello"] = function(req)
                local _ = req
                return { status = 200, body = "hello" }
            end,
        }

    `,
    expect: [{ errors: 0 }, { typeAt: [49, 28], equals: "ReceivedRequest" }],
  },
  {
    // TypeInfer.tables.test.cpp:7364 TEST_CASE_FIXTURE(Fixture, "bidirectional_union_non_singleton_discrimination")
    name: "bidirectional_union_non_singleton_discrimination",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        type NumericRecord = { value: number, label: string }
        type StringRecord = { value: string, flag: boolean }
        type Record = NumericRecord | StringRecord

        local r1: Record = { value = 42, label = "hello" }
        local r2: Record = { value = "hmmm", flag = true }
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:7378 TEST_CASE_FIXTURE(Fixture, "bidirectional_union_mixed_table_and_non_table")
    name: "bidirectional_union_mixed_table_and_non_table",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        type Response = string | { status: number, body: string }

        local r: Response = { status = 200, body = "ok" }
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:7389 TEST_CASE_FIXTURE(BuiltinsFixture, "bidirectional_union_via_type_function")
    name: "bidirectional_union_via_type_function",
    fixture: "BuiltinsFixture",
    unparsed: { defect: 1021 }, // a type function declaration
    source: `
        type function Optional(t)
            return types.unionof(t, types.singleton(nil))
        end

        type Config = {
            host: string,
            port: number,
            verbose: boolean?,
        }

        local cfg: Optional<Config> = {
            host = "localhost",
            port = 8080,
            verbose = true,
        }
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:7412 TEST_CASE_FIXTURE(BuiltinsFixture, "bidirectional_union_function_vs_primitive_property_discrimination")
    name: "bidirectional_union_function_vs_primitive_property_discrimination",
    fixture: "BuiltinsFixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        type FnRecord = { handler: (number) -> string, label: string? }
        type StrRecord = { handler: string, label: string? }
        type Record = FnRecord | StrRecord

        local r: Record = {
            handler = function(input)
                return tostring(input)
            end,
            label = "test"
        }
    `,
    expect: [{ errors: 0 }, { typeAt: [7, 34], equals: "number" }],
  },
  {
    // TypeInfer.tables.test.cpp:7432 TEST_CASE_FIXTURE(BuiltinsFixture, "indexer_and_subsequent_constraint")
    name: "indexer_and_subsequent_constraint",
    fixture: "BuiltinsFixture",
    ignoreMissingAnnotations: true,
    source: `
        local function getnumberandabs(tbl, key: string)
            local x = tbl[key]
            return math.abs(x)
        end
    `,
    expect: [
      { errors: 0 },
      { type: "getnumberandabs", equals: "({ [string]: number }, string) -> number" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:7448 TEST_CASE_FIXTURE(BuiltinsFixture, "intersection_of_indexers_1")
    name: "intersection_of_indexers_1",
    fixture: "BuiltinsFixture",
    flags: { LuauRemoveConstraintSolverEmplace: true },
    source: `
        local tbl: { [string | number]: string } & { [string | number]: unknown }
        local key: string
        local val = tbl[key]
    `,
    expect: [{ errors: 0 }, { type: "val", equals: "string" }],
  },
  {
    // TypeInfer.tables.test.cpp:7464 TEST_CASE_FIXTURE(BuiltinsFixture, "intersection_of_indexers_2")
    name: "intersection_of_indexers_2",
    fixture: "BuiltinsFixture",
    flags: { LuauRemoveConstraintSolverEmplace: true },
    source: `
        local tbl: { [string | number]: never } & { [string | number]: string }
        local key: string
        local val = tbl[key]
    `,
    expect: [{ errors: 0 }, { type: "val", equals: "never" }],
  },
  {
    // TypeInfer.tables.test.cpp:7480 TEST_CASE_FIXTURE(BuiltinsFixture, "intersection_of_indexers_3")
    name: "intersection_of_indexers_3",
    fixture: "BuiltinsFixture",
    flags: { LuauRemoveConstraintSolverEmplace: true },
    source: `
        local tbl: { good: boolean } & { [string]: string }
        local key: string
        local val = tbl[key]
    `,
    expect: [{ errors: 0 }, { type: "val", equals: "string" }],
  },
  {
    // TypeInfer.tables.test.cpp:7496 TEST_CASE_FIXTURE(BuiltinsFixture, "union_of_indexers_1")
    name: "union_of_indexers_1",
    fixture: "BuiltinsFixture",
    flags: { LuauRemoveConstraintSolverEmplace: true },
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        local tbl: { [string | number]: never } | { [string | number]: string }
        local key: string
        local val = tbl[key]
    `,
    expect: [{ errors: 0 }, { type: "val", equals: "string" }],
  },
  {
    // TypeInfer.tables.test.cpp:7512 TEST_CASE_FIXTURE(BuiltinsFixture, "union_of_indexers_2")
    name: "union_of_indexers_2",
    fixture: "BuiltinsFixture",
    flags: { LuauRemoveConstraintSolverEmplace: true },
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        local tbl: { [string | number]: unknown } | { [string | number]: string }
        local key: string
        local val = tbl[key]
    `,
    expect: [{ errors: 0 }, { type: "val", equals: "unknown" }],
  },
  {
    // TypeInfer.tables.test.cpp:7528 TEST_CASE_FIXTURE(BuiltinsFixture, "union_of_indexers_3")
    name: "union_of_indexers_3",
    fixture: "BuiltinsFixture",
    flags: { LuauRemoveConstraintSolverEmplace: true },
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        local tbl: { [string | number]: boolean | string } | { [string | number]: boolean | number }
        local key: string
        local val = tbl[key]
    `,
    expect: [{ errors: 0 }, { type: "val", equals: "boolean | number | string" }],
  },
  {
    // TypeInfer.tables.test.cpp:7544 TEST_CASE_FIXTURE(Fixture, "read_only_indexer_mismatch")
    name: "read_only_indexer_mismatch",
    fixture: "Fixture",
    flags: { LuauNewTypePathErrorMessages: true, LuauPropertyModifierMismatchErrors: true },
    source: `
        local x: { read string } = {}
        local y: { string } = x
    `,
    expect: [
      { errors: 1 },
      { error: 0, message: "Expected this to be '{string}', but got '{read string}'; \nthe indexer is read-only in the latter type, but the former type requires a read-write indexer" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:7564 TEST_CASE_FIXTURE(Fixture, "test_indexing_into_unsealed_table")
    name: "test_indexing_into_unsealed_table",
    fixture: "Fixture",
    flags: { LuauRemoveConstraintSolverEmplace: true },
    source: `
        local key1: string, key2: number
        local tbl = {}
        tbl[key1] = 42
        local val = tbl[key2]
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "TypeMismatch", fields: { wantedType: "string", givenType: "number" } },
      { type: "tbl", equals: "{ [string]: number }", options: { exhaustive: true } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:7586 TEST_CASE_FIXTURE(BuiltinsFixture, "table_insert_strings_and_then_concat")
    name: "table_insert_strings_and_then_concat",
    fixture: "BuiltinsFixture",
    source: `
        export type Glob = { string }

        local function parseGlob(): Glob
            local lua_parts = {}
            table.insert(lua_parts, "")
            table.insert(lua_parts, "")

            return {
                table.concat(lua_parts)
            }
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:7603 TEST_CASE_FIXTURE(BuiltinsFixture, "normalization_always_intersects_table")
    name: "normalization_always_intersects_table",
    fixture: "BuiltinsFixture",
    flags: { LuauAlwaysIntersectTablesWithTables: true },
    ignoreMissingAnnotations: true,
    source: `
        local tbl = {}

        function tbl:hmm(occlusionMode)
            if self.activeOcclusionModule and self.activeOcclusionModule:GetOcclusionMode() == occlusionMode then
            end

            if self.activeOcclusionModule then
                local newModuleOcclusionMode = self.activeOcclusionModule:GetOcclusionMode()
                error("CameraScript ActivateOcclusionModule mismatch: ",self.activeOcclusionModule:GetOcclusionMode())
            end
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:7624 TEST_CASE_FIXTURE(BuiltinsFixture, "oss_2597_constraint_forcing_bad_refinement")
    name: "oss_2597_constraint_forcing_bad_refinement",
    fixture: "BuiltinsFixture",
    flags: { LuauDontBlockRefinementUnconditionally: true, DebugLuauAssertOnForcedConstraint: true },
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        const MyClass = {
            __index = {},
        }

        type MyClass<T> = setmetatable<{ _t: T }, typeof(MyClass)>

        type MyFunction<T> = (class: MyClass<T>) -> () | {
            fn: ((class: MyClass<T>) -> ())?,
        }

        function MyClass.__index.call<T>(self: MyClass<T>, f: MyFunction<T>): ()
            if type(f) == "function" then
                f(self)
            elseif f.fn then
                const thevalue = f.fn
                local _ = thevalue
                f.fn(self)
            end
        end
    `,
    expect: [
      { errors: 0 },
      { typeAt: [16, 28], equals: "(setmetatable<{ _t: T }, MyClass>) -> ()" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:7658 TEST_CASE_FIXTURE(BuiltinsFixture, "test_inferring_generalized_iteration_1")
    name: "test_inferring_generalized_iteration_1",
    fixture: "BuiltinsFixture",
    flags: { LuauIterableConstraintMutatesIterator: true, DebugLuauAssertOnForcedConstraint: true },
    ignoreMissingAnnotations: true,
    source: `
        local function setupRootMappingMove(rootMapping)
            -- Prior, the new solver would eagerly generalize \`rootMapping.RootToDescendantCountMap\`
            -- to unknown, which is clearly not correct.
            for root, childCount in rootMapping.RootToDescendantCountMap do
                   string.len(root)
                   math.abs(childCount)
            end
        end
    `,
    expect: [
      { errors: 0 },
      { type: "setupRootMappingMove", equals: "({ read RootToDescendantCountMap: { [string]: number } }) -> ()" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:7681 TEST_CASE_FIXTURE(BuiltinsFixture, "test_inferring_generalized_iteration_2")
    name: "test_inferring_generalized_iteration_2",
    fixture: "BuiltinsFixture",
    flags: { LuauIterableConstraintMutatesIterator: true, DebugLuauAssertOnForcedConstraint: true },
    ignoreMissingAnnotations: true,
    source: `
        local function setupRootMappingMove(rootMapping)
            for root, childCount in rootMapping.RootToDescendantCountMap do
            end
        end
    `,
    expect: [
      { errors: 0 },
      { type: "setupRootMappingMove", equals: "<T, U>({ read RootToDescendantCountMap: { [T]: U } }) -> ()" },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:7700 TEST_CASE_FIXTURE(Fixture, "function_calls_preserve_potential_mutations_1")
    name: "function_calls_preserve_potential_mutations_1",
    fixture: "Fixture",
    flags: { LuauRemovePrimitiveTypeConstraintAndSubtypingUnifier: true, LuauTraverseScopeToFunction: true },
    ignoreMissingAnnotations: true,
    source: `
        local function f(s)
            local _ = s:g()
            local n: number? = s:g()
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:7718 TEST_CASE_FIXTURE(Fixture, "function_calls_preserve_potential_mutations_2")
    name: "function_calls_preserve_potential_mutations_2",
    fixture: "Fixture",
    flags: { LuauRemovePrimitiveTypeConstraintAndSubtypingUnifier: true, LuauTraverseScopeToFunction: true },
    ignoreMissingAnnotations: true,
    source: `
        local function f(s)
            local _ = s.g()
            local n: number? = s.g()
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:7736 TEST_CASE_FIXTURE(Fixture, "function_calls_preserve_potential_mutations_3")
    name: "function_calls_preserve_potential_mutations_3",
    fixture: "Fixture",
    flags: { LuauRemovePrimitiveTypeConstraintAndSubtypingUnifier: true, LuauTraverseScopeToFunction: true },
    ignoreMissingAnnotations: true,
    source: `
        local function f(g)
            local _ = g()
            local n: number? = g()
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.tables.test.cpp:7754 TEST_CASE_FIXTURE(Fixture, "oss_2669_infer_read_only_indexers_1")
    name: "oss_2669_infer_read_only_indexers_1",
    fixture: "Fixture",
    flags: { LuauInferReadOnlyIndexers: true },
    source: `
        local function combine<T>(a: { read T }, b: { read T }): { T }
            return {}
        end

        local x: { number }
        local y: { boolean }
        local z = combine(x, y)
    `,
    expect: [
      { errors: 0 },
      { type: "z", equals: "{boolean | number}", options: { exhaustive: true } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:7773 TEST_CASE_FIXTURE(Fixture, "oss_2669_infer_read_only_indexers_2")
    name: "oss_2669_infer_read_only_indexers_2",
    fixture: "Fixture",
    flags: { LuauInferReadOnlyIndexers: true },
    source: `
        local function combine<T>(a: { T }): { read T }
            return {}
        end

        local x: { number }
        local z = combine(x)
    `,
    expect: [{ errors: 0 }, { type: "z", equals: "{read number}", options: { exhaustive: true } }],
  },
  {
    // TypeInfer.tables.test.cpp:7791 TEST_CASE_FIXTURE(Fixture, "oss_2669_infer_read_only_indexers_3")
    name: "oss_2669_infer_read_only_indexers_3",
    fixture: "Fixture",
    source: `
        local function combine<T>(a: { T }, b: { T }): { read T }
            return {}
        end

        local x: { number }
        local y: { boolean }
        local z = combine(x, y)
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "GenericBoundsMismatch" },
      { type: "z", equals: "{read never}", options: { exhaustive: true } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:7811 TEST_CASE_FIXTURE(Fixture, "oss_2669_infer_read_only_indexers_4")
    name: "oss_2669_infer_read_only_indexers_4",
    fixture: "Fixture",
    source: `
        local function combine<T>(a: { T }): { T }
            return {}
        end

        local x: { read number }
        local z = combine(x)
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "TypeMismatch", fields: { givenType: "{read number}", wantedType: "{number}" } },
      { type: "z", equals: "{number}", options: { exhaustive: true } },
    ],
  },
  {
    // TypeInfer.tables.test.cpp:7834 TEST_CASE_FIXTURE(Fixture, "oss_2669_infer_read_only_indexers_5")
    name: "oss_2669_infer_read_only_indexers_5",
    fixture: "Fixture",
    flags: { LuauInferReadOnlyIndexers: true },
    source: `
        local function combine<T>(a: { T }, b: { T }): { T }
            return {}
        end

        local x: { read number }
        local y: { read boolean }
        local z = combine(x, y)
    `,
    expect: [
      { errors: 2 },
      { error: 0, code: "TypeMismatch", fields: { wantedType: "{boolean | number}", givenType: "{read number}" } },
      { error: 1, code: "TypeMismatch", fields: { wantedType: "{boolean | number}", givenType: "{read boolean}" } },
      { type: "z", equals: "{boolean | number}", options: { exhaustive: true } },
    ],
  },
]);
