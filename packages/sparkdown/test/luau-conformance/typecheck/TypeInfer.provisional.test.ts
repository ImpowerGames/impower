import { NEW_SOLVER_GUARD_REASON, portUpstreamFile } from "./portedCases";

portUpstreamFile("TypeInfer.provisional.test.cpp", [
  {
    name: "typeguard_inference_incomplete",
    fixture: "Fixture",
    source: `
        function f(a)
            if type(a) == "boolean" then
                local a1 = a
            elseif a.fn() then
                local a2 = a
            end
        end
    `,
    expect: [{ decoratedSource: `
        function f(a:{fn:()->(unknown,...unknown)}): ()
            if type(a) == 'boolean' then
                local a1:{fn:()->(unknown,...unknown)}&boolean=a
            elseif a.fn() then
                local a2:{fn:()->(unknown,...unknown)}&(userdata|function|nil|number|integer|string|thread|buffer|table)=a
            end
        end
    ` }],
  },
  {
    name: "luau-polyfill.Array.filter",
    fixture: "BuiltinsFixture",
    source: `
--!strict
-- Implements Javascript's \`Array.prototype.filter\` as defined below
-- https://developer.cmozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter
type Array<T> = { [number]: T }
type callbackFn<T> = (element: T, index: number, array: Array<T>) -> boolean
type callbackFnWithThisArg<T, U> = (thisArg: U, element: T, index: number, array: Array<T>) -> boolean
type Object = { [string]: any }
return function<T, U>(t: Array<T>, callback: callbackFn<T> | callbackFnWithThisArg<T, U>, thisArg: U?): Array<T>

	local len = #t
	local res = {}
	if thisArg == nil then
		for i = 1, len do
			local kValue = t[i]
			if kValue ~= nil then
				if (callback :: callbackFn<T>)(kValue, i, t) then
					res[i] = kValue
				end
			end
		end
	else
	end

	return res
end
    `,
    expect: [{ errors: 0 }],
  },
  {
    name: "xpcall_returns_what_f_returns",
    fixture: "BuiltinsFixture",
    source: `
        local a, b, c = xpcall(function() return 1, "foo" end, function() return "foo", 1 end)
    `,
    expect: [
      { type: "a", equals: "boolean" },
      { type: "b", equals: "number" },
      { type: "c", equals: "string" },
      { decoratedSource: `
        local a:boolean,b:number,c:string=xpcall(function(): (number,string)return 1,'foo'end,function(): (string,number)return'foo',1 end)
    ` },
      { errors: 0 },
    ],
  },
  {
    name: "weirditer_should_not_loop_forever",
    fixture: "Fixture",
    limits: { LuauTypeInferTypePackLoopLimit: 50 },
    ignoreMissingAnnotations: true,
    source: `
        local function toVertexList(vertices, x, y, ...)
            if not (x and y) then return vertices end  -- no more arguments
            vertices[#vertices + 1] = {x = x, y = y}   -- set vertex
            return toVertexList(vertices, ...)         -- recurse
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    name: "it_should_be_agnostic_of_actual_size",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        local function f(x, y, ...)
            if not y then return x end
            return f(x, ...)
        end

        f(3, 2, 1, 0)
    `,
    expect: [{ errors: 0 }],
  },
  {
    name: "setmetatable_constrains_free_type_into_free_table",
    fixture: "BuiltinsFixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        local a = {}
        local b
        setmetatable(a, b)
        b = 1
    `,
    expect: [],
  },
  {
    name: "while_body_are_also_refined",
    fixture: "Fixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        type Node<T> = { value: T, child: Node<T>? }

        local function visitor<T>(node: Node<T>, f: (T) -> ())
            local current = node

            while current do
                f(current.value)
                current = current.child -- TODO: Can't work just yet. It thinks 'current' can never be nil. :(
            end
        end
    `,
    expect: [],
  },
  {
    name: "error_on_eq_metamethod_returning_a_type_other_than_boolean",
    fixture: "BuiltinsFixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        local tab = {a = 1}
        setmetatable(tab, {__eq = function(a, b): number
            return 1
        end})
        local tab2 = tab

        local a = tab2 == tab
    `,
    expect: [],
  },
  {
    name: "lvalue_equals_another_lvalue_with_no_overlap",
    fixture: "Fixture",
    source: `
        local function f(a: string, b: boolean?)
            if a == b then
                local foo, bar = a, b
            else
                local foo, bar = a, b
            end
        end
    `,
    expect: [
      { errors: 1 },
      { typeAt: [3, 33], equals: "string" },
      { typeAt: [3, 36], equals: "boolean?" },
      { typeAt: [5, 33], equals: "string" },
      { typeAt: [5, 36], equals: "boolean?" },
    ],
  },
  {
    name: "discriminate_from_x_not_equal_to_nil",
    fixture: "Fixture",
    source: `
        type T = {x: string, y: number} | {x: nil, y: nil}

        local function f(t: T)
            if t.x ~= nil then
                local foo = t
            else
                local bar = t
            end
        end
    `,
    expect: [
      { errors: 0 },
      { typeAt: [5, 28], equals: "{ x: string, y: number }" },
      { typeAt: [7, 28], equals: "{ x: nil, y: nil }" },
    ],
  },
  {
    name: "bail_early_if_unification_is_too_complicated",
    fixture: "BuiltinsFixture",
    limits: { LuauTarjanChildLimit: 1, LuauTypeInferIterationLimit: 1 },
    source: `
        local Result
        Result = setmetatable({}, {})
        Result.__index = Result
        function Result.new(okValue)
            local self = setmetatable({}, Result)
            self:constructor(okValue)
            return self
        end
        function Result:constructor(okValue)
            self.okValue = okValue
        end
        function Result:ok(val) return Result.new(val) end
        function Result:a(p0, p1, p2, p3, p4) return Result.new((self.okValue)) or p0 or p1 or p2 or p3 or p4 end
        function Result:b(p0, p1, p2, p3, p4) return Result:ok((self.okValue)) or p0 or p1 or p2 or p3 or p4 end
        function Result:c(p0, p1, p2, p3, p4) return Result:ok((self.okValue)) or p0 or p1 or p2 or p3 or p4 end
        function Result:transpose(a)
            return a and self.okValue:z(function(some)
                return Result:ok(some)
            end) or Result:ok(self.okValue)
        end
    `,
    expect: [{ anyError: "UnificationTooComplex" }],
  },
  {
    name: "do_not_ice_when_trying_to_pick_first_of_generic_type_pack",
    fixture: "Fixture",
    source: `
        local function f() end

        local g = function() return f() end

        local x = (f()) -- should error: no return values to assign from the call to f
    `,
    expect: [
      { errors: 0 },
      { type: "f", equals: "() -> ()" },
      { type: "g", equals: "() -> ()" },
      { type: "x", equals: "nil" },
    ],
  },
  {
    name: "specialization_binds_with_prototypes_too_early",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        local function id(x) return x end
        local n2n: (number) -> number = id
        local s2s: (string) -> string = id
    `,
    expect: [{ errors: 0 }],
  },
  {
    name: "weird_fail_to_unify_type_pack",
    fixture: "Fixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        local function f() return end
        local g = function() return f() end
    `,
    expect: [],
  },
  {
    name: "choose_the_right_overload_for_pcall",
    fixture: "BuiltinsFixture",
    source: `
        local function f(): number
            if math.random() > 0.5 then
                return 5
            else
                error("something")
            end
        end

        local ok, res = pcall(f)
    `,
    expect: [{ errors: 0 }, { type: "ok", equals: "boolean" }, { type: "res", equals: "number" }],
  },
  {
    name: "function_returns_many_things_but_first_of_it_is_forgotten",
    fixture: "BuiltinsFixture",
    source: `
        local function f(): (number, string, boolean)
            if math.random() > 0.5 then
                return 5, "hello", true
            else
                error("something")
            end
        end

        local ok, res, s, b = pcall(f)
    `,
    expect: [
      { errors: 0 },
      { type: "ok", equals: "boolean" },
      { type: "res", equals: "number" },
      { type: "s", equals: "string" },
      { type: "b", equals: "boolean" },
    ],
  },
  {
    name: "free_is_not_bound_to_any",
    fixture: "Fixture",
    source: `
        local function foo(f: (any) -> (), x)
            f(x)
        end
    `,
    expect: [{ type: "foo", equals: "((any) -> (), any) -> ()" }],
  },
  {
    name: "dcr_can_partially_dispatch_a_constraint",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        local function hasDivisors(value: number)
        end

        function prime_iter(state, index)
            hasDivisors(index)
            index += 1
        end
    `,
    expect: [{ errors: 0 }, { type: "prime_iter", equals: "(unknown, number) -> ()" }],
  },
  {
    name: "free_options_cannot_be_unified_together",
    fixture: "Fixture",
    skip: { notApplicable: "a unit test of the old solver's Unifier on types built in C++, with no Luau source to check" },
    checks: [],
  },
  {
    name: "for_in_loop_with_zero_iterators",
    fixture: "BuiltinsFixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        function no_iter() end
        for key in no_iter() do end -- This should not be ok
    `,
    expect: [],
  },
  {
    name: "generic_type_leak_to_module_interface",
    fixture: "BuiltinsFixture",
    checks: [
      {
        module: "game/A",
        source: `
local wrapStrictTable

local metatable = {
    __index = function(self, key)
        local value = self.__tbl[key]
        if type(value) == "table" then
            -- unification of the free 'wrapStrictTable' with this function type causes generics of this function to leak out of scope
            return wrapStrictTable(value, self.__name .. "." .. key)
        end
        return value
    end,
}

return wrapStrictTable
    `,
        expect: [],
      },
      {
        module: "game/B",
        source: `
local wrapStrictTable = require(game.A)

local Constants = {}

return wrapStrictTable(Constants, "Constants")
    `,
        expect: [{ moduleReturn: true, equals: "*error-type*" }],
      },
    ],
  },
  {
    name: "generic_type_leak_to_module_interface_variadic",
    fixture: "BuiltinsFixture",
    checks: [
      {
        module: "game/A",
        source: `
local wrapStrictTable

local metatable = {
    __index = function<T>(self, key, ...: T)
        local value = self.__tbl[key]
        if type(value) == "table" then
            -- unification of the free 'wrapStrictTable' with this function type causes generics of this function to leak out of scope
            return wrapStrictTable(value, self.__name .. "." .. key)
        end
        return ...
    end,
}

return wrapStrictTable
    `,
        expect: [],
      },
      {
        module: "game/B",
        source: `
local wrapStrictTable = require(game.A)

local Constants = {}

return wrapStrictTable(Constants, "Constants")
    `,
        expect: [{ moduleReturn: true, equals: "*error-type*" }],
      },
    ],
  },
  {
    name: "intersection_of_functions_of_different_arities",
    fixture: "IsSubtypeFixture",
    source: `
        type A = (any) -> ()
        type B = (any, any) -> ()
        type T = A & B

        local a: A
        local b: B
        local t: T
    `,
    expect: [{ type: "t", equals: "((any) -> ()) & ((any, any) -> ())" }],
  },
  {
    name: "functions_with_mismatching_arity",
    fixture: "IsSubtypeFixture",
    source: `
        local a: (number) -> ()
        local b: () -> ()

        local c: () -> number
    `,
    expect: [
      { type: "a", subtypeOf: { type: "b" }, isSubtype: false },
      { type: "a", subtypeOf: { type: "c" }, isSubtype: false },
      { type: "b", subtypeOf: { type: "c" }, isSubtype: false },
    ],
  },
  {
    name: "functions_with_mismatching_arity_but_optional_parameters",
    fixture: "IsSubtypeFixture",
    source: `
        local a: (number?) -> ()
        local b: (number) -> ()
        local c: (number, number?) -> ()
    `,
    expect: [
      { type: "b", subtypeOf: { type: "a" }, isSubtype: false },
      { type: "c", subtypeOf: { type: "a" }, isSubtype: false },
      { type: "a", subtypeOf: { type: "b" }, isSubtype: true },
    ],
  },
  {
    name: "functions_with_mismatching_arity_but_any_is_an_optional_param",
    fixture: "IsSubtypeFixture",
    source: `
        local a: (number?) -> ()
        local b: (number) -> ()
        local c: (number, any) -> ()
    `,
    expect: [
      { type: "b", subtypeOf: { type: "a" }, isSubtype: false },
      { type: "c", subtypeOf: { type: "a" }, isSubtype: false },
      { type: "a", subtypeOf: { type: "b" }, isSubtype: true },
    ],
  },
  {
    name: "assign_table_with_refined_property_with_a_similar_type_is_illegal",
    fixture: "Fixture",
    source: `
        local t: {x: number?} = {x = nil}

        if t.x then
            local u: {x: number} = t
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    name: "table_insert_with_a_singleton_argument",
    fixture: "BuiltinsFixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        local function foo(t, x)
            if x == "hi" or x == "bye" then
                table.insert(t, x)
            end

            return t
        end

        local t = foo({}, "hi")
        table.insert(t, "totally_unrelated_type" :: "totally_unrelated_type")
    `,
    expect: [],
  },
  {
    name: "lookup_prop_of_intersection_containing_unions_of_tables_that_have_the_prop",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        local function mergeOptions<T>(options: T & ({variable: string} | {variable: number}))
            return options.variable
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    name: "expected_type_should_be_a_helpful_deduction_guide_for_function_calls",
    fixture: "Fixture",
    source: `
        type Ref<T> = { val: T }

        local function useRef<T>(x: T): Ref<T?>
            return { val = x }
        end

        local x: Ref<number?> = useRef(nil)
    `,
    expect: [{ errors: 1 }],
  },
  {
    name: "floating_generics_should_not_be_allowed",
    fixture: "Fixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        local assign : <T, U, V, W>(target: T, source0: U?, source1: V?, source2: W?, ...any) -> T & U & V & W = (nil :: any)

        -- We have a big problem here: The generics U, V, and W are not bound to anything!
        -- Things get strange because of this.
        local benchmark = assign({})
        local options = benchmark.options
        do
            local resolve2: any = nil
            options.fn({
                resolve = function(...)
                    resolve2(...)
                end,
            })
        end
    `,
    expect: [],
  },
  {
    name: "free_options_can_be_unified_together",
    fixture: "Fixture",
    skip: { notApplicable: "a unit test of the old solver's Unifier on types built in C++, with no Luau source to check" },
    checks: [],
  },
  {
    name: "unify_more_complex_unions_that_include_nil",
    fixture: "Fixture",
    source: `
        type Record = {prop: (string | boolean)?}

        function concatPagination(prop: (string | boolean | nil)?): Record
            return {prop = prop}
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    name: "optional_class_instances_are_invariant_old_solver",
    fixture: "Fixture",
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    source: `
        function foo(ref: {current: Parent?})
        end

        function bar(ref: {current: Child?})
            foo(ref)
        end
    `,
    expect: [],
  },
  {
    name: "optional_class_instances_are_invariant_new_solver",
    fixture: "Fixture",
    skip: { notApplicable: "declares extern types, which a Luau host defines in C++ or a definition file; Sparkdown has neither" },
    source: `
        function foo(ref: {read current: Parent?})
        end

        function bar(ref: {read current: Child?})
            foo(ref)
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    name: "luau-polyfill.Map.entries",
    fixture: "BuiltinsFixture",
    module: "Module/Map",
    ignoreMissingAnnotations: true,
    source: `
--!strict

type Object = { [any]: any }
type Array<T> = { [number]: T }
type Table<T, V> = { [T]: V }
type Tuple<T, V> = Array<T | V>

local Map = {}

export type Map<K, V> = {
	size: number,
	-- method definitions
	set: (self: Map<K, V>, K, V) -> Map<K, V>,
	get: (self: Map<K, V>, K) -> V | nil,
	clear: (self: Map<K, V>) -> (),
	delete: (self: Map<K, V>, K) -> boolean,
	has: (self: Map<K, V>, K) -> boolean,
	keys: (self: Map<K, V>) -> Array<K>,
	values: (self: Map<K, V>) -> Array<V>,
	entries: (self: Map<K, V>) -> Array<Tuple<K, V>>,
	ipairs: (self: Map<K, V>) -> any,
	[K]: V,
	_map: { [K]: V },
	_array: { [number]: K },
}

function Map:entries()
	return {}
end

local function coerceToTable(mapLike: Map<any, any> | Table<any, any>): Array<Tuple<any, any>>
    local e = mapLike:entries();
    return e
end

    `,
    expect: [{ errors: 0 }],
  },
  {
    name: "table_unification_infinite_recursion",
    fixture: "BuiltinsFixture",
    limits: { LuauTypeInferRecursionLimit: 100 },
    skip: { newSolver: NEW_SOLVER_GUARD_REASON },
    checks: [
      {
        module: "game/A",
        source: `
local tbl = {}

function tbl:f1(state)
    self.someNonExistentvalue2 = state
end

function tbl:f2()
    self.someNonExistentvalue:Dc()
end

function tbl:f3()
    self:f2()
    self:f1(false)
end
return tbl
    `,
        expect: [],
      },
      {
        module: "game/B",
        source: `
local tbl = require(game.A)
tbl:f3()
    `,
        expect: [],
      },
    ],
  },
  {
    name: "normalization_limit_in_unify_with_any",
    fixture: "BuiltinsFixture",
    limits: { LuauNormalizeCacheLimit: 1000 },
    source: Array.from({ length: 100 }, (_, i) => `type T${i} = { f${i}: number }\n`).join("") +
      "type Instance = { new: (('s0', extra: Instance?) -> T0)" +
      Array.from({ length: 99 }, (_, i) => ` & (('s${i + 1}', extra: Instance?) -> T${i + 1})`).join("") +
      " }\n" +
      `
local Instance: Instance = {} :: any

local function foo(a: typeof(Instance.new)) return if a then 2 else 3 end

foo(1 :: any)
`,
    expect: [{ errors: "some" }],
  },
  {
    name: "luau_roact_useState_nilable_state_1",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        type Dispatch<A> = (A) -> ()
        type BasicStateAction<S> = ((S) -> S) | S

        type ScriptConnection = { Disconnect: (ScriptConnection) -> () }

        local blah = nil :: any

        local function useState<S>(
            initialState: (() -> S) | S,
            ...
        ): (S, Dispatch<BasicStateAction<S>>)
            return blah, blah
        end

        local a, b = useState(nil :: ScriptConnection?)

        if a then
            a:Disconnect()
            b(nil :: ScriptConnection?)
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    name: "luau_roact_useState_minimization",
    fixture: "BuiltinsFixture",
    source: `
        type BasicStateAction<S> = ((S) -> S) | S
        type Dispatch<A> = (A) -> ()

        local function useState<S>(
            initialState: (() -> S) | S
        ): (S, Dispatch<BasicStateAction<S>>)
            -- fake impl that obeys types
            local val = if type(initialState) == "function" then initialState() else initialState
            return val, function(value)
                return value
            end
        end

        local test, setTest = useState(nil :: string?)

        setTest(nil) -- this line causes the type to be narrowed in the old solver!!!

        local function update(value: string)
            print(test)
            setTest(value)
        end

        update("hello")
    `,
    expect: [{ errors: "some" }],
  },
  {
    name: "bin_prov",
    fixture: "BuiltinsFixture",
    source: `
        local Bin = {}

        function Bin:add(item)
            self.head = { item = item}
            return item
        end

        function Bin:destroy()
            while self.head do
                local item = self.head.item
                if type(item) == "function" then
                    item()
                elseif item.Destroy ~= nil then
                end
                self.head = self.head.next
            end
        end
    `,
    expect: [],
  },
  {
    name: "update_phonemes_minimized",
    fixture: "BuiltinsFixture",
    malformed: "an anonymous `function(response)` is not a statement",
    source: `
        local video
        function(response)
            for index = 1, #response do
                video = video
            end
            return video
        end
    `,
    expect: [{ errors: "some" }],
  },
  {
    name: "table_containing_non_final_type_is_erroneously_cached",
    fixture: "Fixture",
    skip: { notApplicable: "a unit test of Luau's Normalizer on types built in C++, with no Luau source to check" },
    checks: [],
  },
  {
    name: "we_cannot_infer_functions_that_return_inconsistently",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        function find_first<T>(tbl: {T}, el)
            for i, e in tbl do
                if e == el then
                    return i
                end
            end
            return nil
        end
    `,
    expect: [{ errors: 1 }, { type: "find_first", equals: "<T>({T}, unknown) -> number" }],
  },
  {
    name: "loop_unsoundness",
    fixture: "Fixture",
    source: `
        local f = function () return 42 end
        while true do
            f = f()
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    name: "refine_unknown_to_table_and_test_two_props",
    fixture: "BuiltinsFixture",
    source: `
        local function f(x: unknown): string
            if typeof(x) == 'table' then
                if typeof(x.foo) == 'string' and typeof(x.bar) == 'string' then
                    return x.foo .. x.bar
                end
            end
            return ''
        end
    `,
    expect: [{ errors: 1 }, { error: 0, code: "UnknownProperty", location: [3, 56, 3, 61] }],
  },
  {
    name: "function_indexer_satisfies_reading_property",
    fixture: "BuiltinsFixture",
    source: `
        local t = setmetatable({}, {
            __index = function (_, _prop: string): number
                return 42
            end
        })

        local function readX(tbl: { read X: number })
            print(tbl.X)
        end

        -- This should work as \`__index\` being a function should semantically
        -- be the same as having an indexer.
        readX(t)
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "TypeMismatch", fields: { givenType: "setmetatable<{  }, { __index: (unknown, string) -> number }>", wantedType: "{ read X: number }" } },
    ],
  },
  {
    name: "unification_inferring_never_for_refined_param",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        local function __remove(__: number?) end

        function __removeItem(self, itemId: number)
            local index = self.getItem(itemId)
            if index then
               __remove(index)
            end
        end
    `,
    expect: [
      { errors: 0 },
      { type: "__removeItem", equals: "({ read getItem: (number) -> (never, ...unknown) }, number) -> ()" },
    ],
  },
  {
    name: "assert_and_many_nested_typeof_contexts",
    fixture: "BuiltinsFixture",
    source: `
        local foo: unknown = nil :: any
        assert(typeof(foo) == "table")
        if typeof(typeof(foo.x)) == "string" then
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    name: "indexing_union_of_indexers",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        local function foo(
            t: { [string]: number } | { [number]: number }
        )
            return t[true]
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    name: "unions_should_work_with_bidirectional_typechecking",
    fixture: "BuiltinsFixture",
    ignoreMissingAnnotations: true,
    source: `
        type dog = { name: string }
        local function bark(arg: { [dog]: dog | { left: dog?, right: dog? } })
            -- do something
            return arg
        end

        local molly: dog = { name = "molly" }
        local draco: dog = { name = "draco" }
        local cindy: dog = { name = "cindy" }
        local laika: dog = { name = "laika" }

        -- this should work because they should match with the left-right dog variant with optionals!
        bark{ [molly] = { left = laika }, [draco] = { right = cindy } }
    `,
    expect: [{ errors: 2 }, { error: 0, code: "TypeMismatch" }, { error: 1, code: "TypeMismatch" }],
  },
  {
    name: "while_loops_fail_to_apply_refinements_1",
    fixture: "Fixture",
    source: `
type walkoptions = {
	recursive: boolean?,
}

function bing(path : string  | walkoptions, opts: walkoptions?)
    return function ()
        while opts and opts.recursive do
        end
    end
end
    `,
    expect: [{ anyError: "OptionalValueAccess" }],
  },
  {
    name: "while_loops_fail_to_apply_refinements_2",
    fixture: "Fixture",
    source: `
type walkoptions = {
	recursive: boolean?,
}

function bing(path : string  | walkoptions, opts: walkoptions?)
    return function ()
        while true do
            if opts and opts.recursive then
            end
        end
    end
end
    `,
    expect: [{ anyError: "OptionalValueAccess" }],
  },
  {
    name: "oss_2305_keyof_index_example",
    fixture: "BuiltinsFixture",
    flags: { LuauRemoveConstraintSolverEmplace: true },
    source: `
        local settingsTable = {}

        type Settings = typeof(settingsTable)

        local settings = {}

        function settings.getTopic<T>(topic: keyof<Settings> & T): { setting: <U>(setting: keyof<index<Settings, T>> & U) -> (index<index<Settings, T>, U>) }
            return {
                setting = function<U>(setting: keyof<index<Settings, T>> & U): index<index<Settings, T>, U>
                    return settingsTable[topic][setting]
                end
            }
        end

        return settings
    `,
    expect: [{ errors: 1 }, { error: 0, code: "UninhabitedTypeFunction" }],
  },
  {
    name: "pcall_calling_pcall",
    fixture: "BuiltinsFixture",
    source: `
        --!strict
        pcall(pcall)
    `,
    expect: [{ errors: 0 }],
  },
  {
    name: "union_super_with_multiple_free_members_over_constrains_lower_bounds",
    fixture: "BuiltinsFixture",
    source: `
        local function f<T, U>(x: T | U, y: T): T
            return y
        end
        local a = f(true, 1)
    `,
    expect: [{ errors: 0 }, { type: "a", equals: "boolean | number" }],
  },
  {
    name: "cli_181248_intersection_of_indexers_should_error",
    fixture: "BuiltinsFixture",
    source: `
        local tbl: { good: boolean } & { bad: boolean }
        local key: string
        local val = tbl[key]
    `,
    expect: [{ errors: 0 }, { type: "val", equals: "*error-type*" }],
  },
  {
    name: "cli_181248_union_of_indexers_should_error",
    fixture: "BuiltinsFixture",
    source: `
        local tbl: { good: boolean } | { bad: boolean }
        local key: string
        local val = tbl[key]
    `,
    expect: [{ errors: 0 }, { type: "val", equals: "*error-type*" }],
  },
  {
    name: "cli_181248_union_of_indexers_with_one_good_option_should_error",
    fixture: "BuiltinsFixture",
    source: `
        local tbl: { good: boolean } | { [string]: string }
        local key: string
        local val = tbl[key]
    `,
    expect: [{ errors: 0 }, { type: "val", equals: "*error-type* | string" }],
  },
  {
    name: "cli_181248_unreduced_intersection_of_indexers",
    fixture: "BuiltinsFixture",
    source: `
        local tbl: { [string]: string | number } & { [string]: string | boolean }
        local key: string
        local val = tbl[key]
    `,
    expect: [{ errors: 0 }, { type: "val", equals: "(boolean | string) & (number | string)" }],
  },
  {
    name: "cli_181248_unreduced_union_of_indexers",
    fixture: "BuiltinsFixture",
    source: `
        local tbl: { [string]: "hi" } | { [string]: string}
        local key: string
        local val = tbl[key]
    `,
    expect: [{ errors: 0 }, { type: "val", equals: "\"hi\" | string" }],
  },
]);
