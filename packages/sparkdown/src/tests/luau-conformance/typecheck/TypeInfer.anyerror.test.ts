import { portUpstreamFile } from "./portedCases";

portUpstreamFile("TypeInfer.anyerror.test.cpp", [
  {
    name: "for_in_loop_iterator_returns_any",
    fixture: "Fixture",
    source: `
        function bar(): any
            return true
        end

        local a
        for b in bar do
            a = b
        end
    `,
    expect: [{ errors: 0 }, { type: "a", equals: "(*error-type* | ~nil)?" }],
  },
  {
    name: "for_in_loop_iterator_returns_any2",
    fixture: "Fixture",
    source: `
        function bar(): any
            return true
        end

        local a
        for b in bar() do
            a = b
        end
    `,
    expect: [{ errors: 0 }, { type: "a", equals: "(*error-type* | ~nil)?" }],
  },
  {
    name: "for_in_loop_iterator_is_any",
    fixture: "Fixture",
    source: `
        local bar = nil :: any

        local a
        for b in bar do
            a = b
        end
    `,
    expect: [{ errors: 0 }, { type: "a", equals: "(*error-type* | ~nil)?" }],
  },
  {
    name: "for_in_loop_iterator_is_any2",
    fixture: "Fixture",
    source: `
        local bar = nil :: any

        local a
        for b in bar() do
            a = b
        end
    `,
    expect: [{ type: "a", equals: "(*error-type* | ~nil)?" }],
  },
  {
    name: "for_in_loop_iterator_is_any_pack",
    fixture: "Fixture",
    source: `
        function bar(): ...any end

        local a
        for b in bar() do
            a = b
        end
    `,
    expect: [{ errors: 0 }, { type: "a", equals: "(*error-type* | ~nil)?" }],
  },
  {
    name: "for_in_loop_iterator_is_error",
    fixture: "Fixture",
    source: `
        local a
        for b in bar do
            a = b
        end
    `,
    expect: [{ errors: 1 }, { type: "a", equals: "*error-type*?" }],
  },
  {
    name: "for_in_loop_iterator_is_error2",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        function bar(c) return c end

        local a
        for b in bar() do
            a = b
        end
    `,
    expect: [{ errors: 2 }, { type: "a", equals: "*error-type*?" }],
  },
  {
    name: "length_of_error_type_does_not_produce_an_error",
    fixture: "Fixture",
    source: `
        local l = #this_is_not_defined
    `,
    expect: [{ errors: 1 }],
  },
  {
    name: "indexing_error_type_does_not_produce_an_error",
    fixture: "Fixture",
    source: `
        local originalReward = unknown.Parent.Reward:GetChildren()[1]
    `,
    expect: [{ errors: 1 }],
  },
  {
    name: "dot_on_error_type_does_not_produce_an_error",
    fixture: "Fixture",
    source: `
        local foo = (true).x
        foo.x = foo.y
    `,
    expect: [{ errors: 1 }],
  },
  {
    name: "any_type_propagates",
    fixture: "Fixture",
    source: `
        local foo: any
        local bar = foo:method("argument")
    `,
    expect: [{ errors: 0 }, { type: "bar", equals: "any" }],
  },
  {
    name: "can_subscript_any",
    fixture: "Fixture",
    source: `
        local foo: any
        local bar = foo[5]
    `,
    expect: [{ errors: 0 }, { type: "bar", equals: "any" }],
  },
  {
    name: "can_get_length_of_any",
    fixture: "Fixture",
    source: `
        local foo = ({} :: any)
        local bar = #foo
    `,
    expect: [{ errors: 0 }, { type: "bar", equals: "number" }],
  },
  {
    name: "assign_prop_to_table_by_calling_any_yields_any",
    fixture: "Fixture",
    source: `
        local f: any
        local T = {}

        T.prop = f()

        return T
    `,
    expect: [
      { errors: 0 },
      { type: "T", kind: "TableType" },
      { type: "T", path: [{ property: "prop" }], equals: "any" },
    ],
  },
  {
    name: "quantify_any_does_not_bind_to_itself",
    fixture: "Fixture",
    source: `
        local A : any
        function A.B() end
        A:C()
    `,
    expect: [{ errors: 0 }, { type: "A", equals: "any" }],
  },
  {
    name: "calling_error_type_yields_error",
    fixture: "Fixture",
    source: `
        local a = unknown.Parent.Reward.GetChildren()
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "UnknownSymbol", fields: { name: "unknown" } },
      { type: "a", equals: "*error-type*" },
    ],
  },
  {
    name: "chain_calling_error_type_yields_error",
    fixture: "Fixture",
    source: `
        local a = Utility.Create "Foo" {}
    `,
    expect: [{ type: "a", equals: "*error-type*" }],
  },
  {
    name: "replace_every_free_type_when_unifying_a_complex_function_with_any",
    fixture: "BuiltinsFixture",
    source: `
        local a: any
        local b
        for _, i in pairs(a) do
            b = i
        end
    `,
    expect: [{ errors: 0 }, { type: "b", equals: "any" }],
  },
  {
    name: "call_to_any_yields_any",
    fixture: "Fixture",
    source: `
        local a: any
        local b = a()
    `,
    expect: [{ type: "b", equals: "any" }],
  },
  {
    name: "CheckMethodsOfAny",
    fixture: "Fixture",
    source: `
local x: any = {}
function x:y(z: number)
    local s: string = z
end
`,
    expect: [{ errors: 1 }],
  },
  {
    name: "CheckMethodsOfError",
    fixture: "Fixture",
    source: `
local x = (true).foo
function x:y(z: number)
    local s: string = z
end
`,
    expect: [{ errors: "some" }],
  },
  {
    name: "metatable_of_any_can_be_a_table",
    fixture: "BuiltinsFixture",
    ignoreMissingAnnotations: true,
    source: `
--!strict
local T: any
T = {}
T.__index = T
function T.new(...)
    local self = {}
    setmetatable(self, T)
    self:construct(...)
    return self
end
function T:construct(index)
end
`,
    expect: [{ errors: 0 }],
  },
  {
    name: "type_error_addition",
    fixture: "Fixture",
    source: `
--!strict
local foo = makesandwich()
local bar = foo.nutrition + 100
    `,
    expect: [
      { errors: 1 },
      { error: 0, message: "Unknown global 'makesandwich'; consider assigning to it first" },
    ],
  },
  {
    name: "prop_access_on_any_with_other_options",
    fixture: "Fixture",
    source: `
        local function f(thing: any | string)
            local foo = thing.SomeRandomKey
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    name: "union_of_types_regression_test",
    fixture: "BuiltinsFixture",
    source: `
--!strict
local stat
stat = stat and tonumber(stat) or stat
    `,
    expect: [{ errors: 0 }],
  },
  {
    name: "table_of_any_calls",
    fixture: "BuiltinsFixture",
    source: `
        local function testFunc(input: {any})
        end

        local v = {true}

        testFunc(v)
    `,
    expect: [{ errors: 0 }],
  },
  {
    name: "intersection_of_any_can_have_props",
    fixture: "Fixture",
    source: `
function foo(x: any, y)
    if x then
        return x._status
    end
    return y
end
`,
    expect: [{ type: "foo", equals: "(any, *error-type*) -> *error-type*" }],
  },
  {
    name: "cast_to_table_of_any",
    fixture: "Fixture",
    source: `
        local v = {true} :: {any}
    `,
    expect: [{ errors: 0 }],
  },
]);
