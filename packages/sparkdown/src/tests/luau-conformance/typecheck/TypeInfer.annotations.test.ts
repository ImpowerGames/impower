import { portUpstreamFile } from "./portedCases";

portUpstreamFile("TypeInfer.annotations.test.cpp", [
  {
    name: "initializers_are_checked_against_annotations",
    fixture: "Fixture",
    source: `local a: number = "Hello Types!"`,
    expect: [{ errors: 1 }],
  },
  {
    name: "check_multi_initialize",
    fixture: "Fixture",
    source: `
        local a: number, b: string = "one", 2
    `,
    expect: [{ errors: 2 }, { error: 0, code: "TypeMismatch" }, { error: 1, code: "TypeMismatch" }],
  },
  {
    name: "successful_check",
    fixture: "Fixture",
    source: `
        local a: number, b: string = 1, "two"
    `,
    expect: [{ errors: 0 }],
  },
  {
    name: "assignments_are_checked_against_annotations",
    fixture: "Fixture",
    source: `
        local x: number = 1
        x = "two"
    `,
    expect: [{ errors: 1 }],
  },
  {
    name: "multi_assign_checks_against_annotations",
    fixture: "Fixture",
    source: `
        local a: number, b: string = 1, "two"
        a, b = "one", 2
    `,
    expect: [
      { errors: 2 },
      { error: 0, location: [2, 15, 2, 20] },
      { error: 1, location: [2, 22, 2, 23] },
    ],
  },
  {
    name: "assignment_cannot_transform_a_table_property_type",
    fixture: "Fixture",
    source: `
        local a = {x=0}
        a.x = "one"
    `,
    expect: [{ errors: 1 }, { error: 0, location: [2, 14, 2, 19] }],
  },
  {
    name: "assignments_to_unannotated_parameters_can_transform_the_type",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        function f(x)
            x = 0
            return x
        end
    `,
    expect: [{ errors: 0 }, { type: "f", equals: "(unknown) -> number" }],
  },
  {
    name: "assignments_to_annotated_parameters_are_checked",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        function f(x: string)
            x = 0
            return x
        end
    `,
    expect: [
      { errors: 1 },
      { error: 0, location: [2, 16, 2, 17] },
      { type: "f", equals: "(string) -> number" },
    ],
  },
  {
    name: "variable_type_is_supertype",
    fixture: "Fixture",
    source: `
        local x: number = 1
        local y: number? = x
    `,
    expect: [{ errors: 0 }],
  },
  {
    name: "assignment_also_checks_subtyping",
    fixture: "Fixture",
    source: `
        function f(): number?
            return nil
        end
        local x: number = 1
        local y: number? = f()
        x = y
        y = x
    `,
    expect: [{ errors: 1 }, { error: 0, location: [6, 12, 6, 13] }],
  },
  {
    name: "function_parameters_can_have_annotations",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        function double(x: number)
            return 2
        end

        local four = double(2)
    `,
    expect: [{ errors: 0 }],
  },
  {
    name: "function_parameter_annotations_are_checked",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        function double(x: number)
            return 2
        end

        local four = double("two")
    `,
    expect: [{ errors: 1 }],
  },
  {
    name: "function_return_annotations_are_checked",
    fixture: "Fixture",
    source: `
        function fifty(): any
            return 55
        end
    `,
    expect: [
      { errors: 0 },
      { type: "fifty", kind: "FunctionType" },
      { type: "fifty", results: ["any"] },
    ],
  },
  {
    name: "function_return_multret_annotations_are_checked",
    fixture: "Fixture",
    source: `
        function foo(): (number, string)
            return 1, 2
        end
    `,
    expect: [{ errors: 1 }],
  },
  {
    name: "function_return_annotation_should_disambiguate_into_function_type_return_and_checked",
    fixture: "Fixture",
    source: `
        function foo(): (number, string) -> nil
            return function(a: number, b: string): number return 1 end
        end
    `,
    expect: [{ errors: 1 }],
  },
  {
    name: "function_return_annotation_should_continuously_parse_return_annotation_and_checked",
    fixture: "Fixture",
    source: `
        function foo(): (number, string) -> (number) -> nil
            return function(a: number, b: string): (number) -> nil
                return function(a: number): nil
                    return 1
                end
            end
        end
    `,
    expect: [{ errors: 1 }],
  },
  {
    name: "unknown_type_reference_generates_error",
    fixture: "Fixture",
    source: `
        local x: IDoNotExist
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "UnknownSymbol", location: [1, 17, 1, 28], fields: { name: "IDoNotExist", context: "Type" } },
    ],
  },
  {
    name: "unknown_generic_type_pack_reference_generates_one_error",
    fixture: "Fixture",
    flags: { LuauStrictVisitInstantiatedType: true },
    source: `
        --!strict
        type F = (IDoNotExist...) -> ()
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "UnknownSymbol", fields: { name: "IDoNotExist", context: "Type" } },
    ],
  },
  {
    name: "unknown_generic_type_pack_vararg_generates_one_error",
    fixture: "Fixture",
    flags: { LuauStrictVisitInstantiatedType: true },
    source: `
        --!strict
        function f(...: IDoNotExist...) end
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "UnknownSymbol", fields: { name: "IDoNotExist", context: "Type" } },
    ],
  },
  {
    name: "unknown_generic_type_pack_in_explicit_instantiation_generates_one_error",
    fixture: "Fixture",
    flags: { LuauStrictVisitInstantiatedType: true },
    checks: [
      {
        source: `
                --!strict
                local function f<T...>() end
                f<<IDoNotExist...>>()
            `,
        expect: [
          { errors: 1 },
          { error: 0, code: "UnknownSymbol", fields: { name: "IDoNotExist", context: "Type" } },
        ],
      },
      {
        source: `
                --!strict
                local t = {}
                function t:f<T...>() end
                t:f<<IDoNotExist...>>()
            `,
        expect: [
          { errors: 1 },
          { error: 0, code: "UnknownSymbol", fields: { name: "IDoNotExist", context: "Type" } },
        ],
      },
      {
        source: `
                --!nonstrict
                local t = {}
                function t:f<T...>() end
                t:f<<IDoNotExist...>>()
            `,
        expect: [
          { errors: 1 },
          { error: 0, code: "UnknownSymbol", fields: { name: "IDoNotExist", context: "Type" } },
        ],
      },
    ],
  },
  {
    name: "typeof_variable_type_annotation_should_return_its_type",
    fixture: "Fixture",
    source: `
        local foo = { bar = "baz" }

        type Foo = typeof(foo)

        local foo2: Foo
    `,
    expect: [{ errors: 0 }, { type: "foo2", sameAs: { type: "foo" } }],
  },
  {
    name: "infer_type_of_value_a_via_typeof_with_assignment",
    fixture: "Fixture",
    source: `
        local a
        local b: typeof(a) = 1

        a = "foo"
    `,
    expect: [
      { type: "a", equals: "string?" },
      { type: "b", equals: "nil" },
      { errors: 1 },
      { error: 0, code: "TypeMismatch", location: [2, 29, 2, 30], fields: { wantedType: "nil", givenType: "number" } },
    ],
  },
  {
    name: "table_annotation",
    fixture: "Fixture",
    source: `
        local x: {a: number, b: string} = {a=2, b="three"}
        local y = x.a
        local z = x.b
    `,
    expect: [{ errors: 0 }, { type: "y", equals: "number" }, { type: "z", equals: "string" }],
  },
  {
    name: "function_annotation",
    fixture: "Fixture",
    source: `
        local f: (number, string) -> number
    `,
    expect: [{ errors: 0 }, { type: "f", kind: "FunctionType" }],
  },
  {
    name: "function_annotation_with_a_defined_function",
    fixture: "Fixture",
    source: `
        local f: (number, number) -> string = function(a: number, b: number) return "" end
    `,
    expect: [{ type: "f", kind: "FunctionType" }, { errors: 0 }],
  },
  {
    name: "type_assertion_expr",
    fixture: "Fixture",
    source: `local a = 55 :: any`,
    expect: [{ type: "a", equals: "any" }],
  },
  {
    name: "as_expr_does_not_propagate_type_info",
    fixture: "Fixture",
    source: `
        local a = 55 :: any
        local b = a :: number
    `,
    expect: [{ errors: 0 }, { type: "a", equals: "any" }, { type: "b", equals: "number" }],
  },
  {
    name: "as_expr_is_bidirectional",
    fixture: "Fixture",
    source: `
        local a = 55 :: number?
        local b = a :: number
    `,
    expect: [{ errors: 0 }, { type: "a", equals: "number?" }, { type: "b", equals: "number" }],
  },
  {
    name: "as_expr_warns_on_unrelated_cast",
    fixture: "Fixture",
    source: `
        local a = 55 :: string
    `,
    expect: [
      { errors: 1 },
      { error: 0, message: "Cannot cast 'number' into 'string' because the types are unrelated" },
      { type: "a", equals: "string" },
    ],
  },
  {
    name: "type_annotations_inside_function_bodies",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        function get_message()
            local message = 'That smarts!' :: string
            return message
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    name: "for_loop_counter_annotation",
    fixture: "Fixture",
    source: ` for i: number = 0, 50 do end `,
    expect: [{ errors: 0 }],
  },
  {
    name: "for_loop_counter_annotation_is_checked",
    fixture: "Fixture",
    source: ` for i: string = 0, 10 do end `,
    expect: [{ errors: 1 }],
  },
  {
    name: "type_alias_should_alias_to_number",
    fixture: "Fixture",
    source: `
        type A = number
        local a: A = 10
    `,
    expect: [{ errors: 0 }],
  },
  {
    name: "type_alias_B_should_check_with_another_aliases_until_a_non_aliased_type",
    fixture: "Fixture",
    source: `
        type A = number
        type B = A
        local b: B = 10
    `,
    expect: [{ errors: 0 }],
  },
  {
    name: "type_aliasing_to_number_should_not_check_given_a_string",
    fixture: "Fixture",
    source: `
        type A = number
        local a: A = "fail"
    `,
    expect: [{ errors: 1 }],
  },
  {
    name: "self_referential_type_alias",
    fixture: "Fixture",
    source: `
        type O = { x: number, incr: (O) -> number }
    `,
    expect: [
      { errors: 0 },
      { alias: "O", kind: "TableType" },
      { alias: "O", path: [{ property: "incr" }], kind: "FunctionType" },
      { alias: "O", path: [{ property: "incr" }, { argument: 0 }], sameAs: { alias: "O" } },
    ],
  },
  {
    name: "define_generic_type_alias",
    fixture: "Fixture",
    source: `
        type Array<T> = {[number]: T}
    `,
    expect: [{ errors: 0 }, { alias: "Array", typeParameters: 1 }],
  },
  {
    name: "use_generic_type_alias",
    fixture: "Fixture",
    source: `
        type Array<T> = {[number]: T}   -- 1
        local p: Array<number> = {}     -- 2
        p[1] = 5                        -- 3 OK
        p[2] = 'hello'                  -- 4 Error.
    `,
    expect: [{ errors: 1 }, { error: 0, line: 4 }, { error: 0, code: "TypeMismatch" }],
  },
  {
    name: "two_type_params",
    fixture: "Fixture",
    source: `
        type Map<K, V> = {[K]: V}
        local m: Map<string, number> = {}
        local a = m['foo']
        local b = m[9]                  -- error here
    `,
    expect: [{ errors: 1 }, { error: 0, line: 4 }, { type: "a", equals: "number" }],
  },
  {
    name: "too_many_type_params",
    fixture: "Fixture",
    source: `
        type Callback<A, R> = (A) -> (boolean, R)
        local a: Callback<number, number, string> = function(i) return true, 4 end
    `,
    expect: [
      { errors: 1 },
      { error: 0, line: 2 },
      { error: 0, code: "IncorrectGenericParameterCount", fields: { actualParameters: 3, name: "Callback" } },
      { error: 0, message: "Generic type 'Callback<A, R>' expects 2 type arguments, but 3 are specified" },
    ],
  },
  {
    name: "duplicate_type_param_name",
    fixture: "Fixture",
    source: `
        type Oopsies<T, T> = {a: T, b: T}
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "DuplicateGenericParameter", fields: { parameterName: "T" } },
    ],
  },
  {
    name: "typeof_expr",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        function id(i) return i end

        local m: typeof(id(77))
    `,
    expect: [{ errors: 0 }, { type: "m", equals: "number" }],
  },
  {
    name: "corecursive_types_error_on_tight_loop",
    fixture: "Fixture",
    source: `
        type A = B
        type B = A

        local aa:A
        local bb:B
    `,
    expect: [{ errors: 1 }, { error: 0, code: "OccursCheckFailed" }],
  },
  {
    name: "type_alias_always_resolve_to_a_real_type",
    fixture: "Fixture",
    source: `
        type A = B
        type B = C
        type C = number

        local aa:A
    `,
    expect: [{ type: "aa", equals: "number" }, { errors: 0 }],
  },
  {
    name: "interface_types_belong_to_interface_arena",
    fixture: "Fixture",
    source: `
        export type A = {field: number}

        local n: A = {field = 551}

        return {n=n}
    `,
    expect: [{ errors: 0 }],
  },
  {
    name: "generic_aliases_are_cloned_properly",
    fixture: "Fixture",
    source: `
        export type Array<T> = { [number]: T }
    `,
    expect: [
      { errors: 0 },
      { alias: "Array", typeParameters: 1 },
      { alias: "Array", kind: "TableType" },
      { alias: "Array", properties: 0 },
      { alias: "Array", path: [{ indexer: "result" }], sameAs: { alias: "Array", path: [{ typeParameter: 0 }] } },
    ],
  },
  {
    name: "cloned_interface_maintains_pointers_between_definitions",
    fixture: "Fixture",
    source: `
        export type Record = { name: string, location: string }
        local a: Record = { name="Waldo", location="?????" }
        local b: Record = { name="Santa Claus", location="Maui" } -- FIXME

        return {a=a, b=b}
    `,
    expect: [
      { errors: 0 },
      { moduleReturn: true, path: [{ result: 0 }, { property: "a" }], printedSameAs: { exportedAlias: "Record" }, options: { exhaustive: true } },
      { moduleReturn: true, path: [{ result: 0 }, { property: "b" }], printedSameAs: { exportedAlias: "Record" }, options: { exhaustive: true } },
    ],
  },
  {
    name: "use_type_required_from_another_file",
    fixture: "BuiltinsFixture",
    skip: { notApplicable: "resolves `require` between two modules, which this harness does not do; #597 decides how module cases run" },
    checks: [
      {
        module: "Modules/Main",
        source: `
        --!strict
        local Test = require(script.Parent.Thing)

        export type Foo = { [any]: Test.TestType }

        return Test
    `,
        expect: [{ errors: 0 }],
      },
      {
        module: "Modules/Thing",
        source: `
        --!strict

        export type TestType = {bar: boolean}

        return {}
    `,
        expect: [],
      },
    ],
  },
  {
    name: "cannot_use_nonexported_type",
    fixture: "BuiltinsFixture",
    skip: { notApplicable: "resolves `require` between two modules, which this harness does not do; #597 decides how module cases run" },
    checks: [
      {
        module: "Modules/Main",
        source: `
        --!strict
        local Test = require(script.Parent.Thing)

        export type Foo = { [any]: Test.TestType }

        return Test
    `,
        expect: [{ errors: 1 }],
      },
      {
        module: "Modules/Thing",
        source: `
        --!strict

        type TestType = {bar: boolean}

        return {}
    `,
        expect: [],
      },
    ],
  },
  {
    name: "builtin_types_are_not_exported",
    fixture: "BuiltinsFixture",
    skip: { notApplicable: "resolves `require` between two modules, which this harness does not do; #597 decides how module cases run" },
    checks: [
      {
        module: "Modules/Main",
        source: `
        --!strict
        local Test = require(script.Parent.Thing)

        export type Foo = { [any]: Test.number }

        return Test
    `,
        expect: [{ errors: 1 }],
      },
      {
        module: "Modules/Thing",
        source: `
        --!strict

        return {}
    `,
        expect: [],
      },
    ],
  },
  {
    name: "luau_ice_triggers_an_ice_exception_with_flag",
    fixture: "Fixture",
    flags: { DebugLuauMagicTypes: true },
    skip: { notApplicable: "checks that Luau's debug-only magic type `_luau_ice` raises an internal compiler error; Sparkdown has no debug magic types" },
    source: `
        local a: _luau_ice = 55
    `,
    expect: [],
  },
  {
    name: "luau_ice_triggers_an_ice_exception_with_flag_handler",
    fixture: "Fixture",
    flags: { DebugLuauMagicTypes: true },
    skip: { notApplicable: "checks that Luau's debug-only magic type `_luau_ice` reaches the internal-error handler; Sparkdown has no debug magic types" },
    source: `
        local a: _luau_ice = 55
    `,
    expect: [],
  },
  {
    name: "luau_ice_is_not_special_without_the_flag",
    fixture: "Fixture",
    flags: { DebugLuauMagicTypes: false },
    source: `
        local a: _luau_ice = 55
    `,
    expect: [],
  },
  {
    name: "luau_print_is_magic_if_the_flag_is_set",
    fixture: "BuiltinsFixture",
    flags: { DebugLuauMagicTypes: true },
    skip: { notApplicable: "checks that Luau's debug-only magic type `_luau_print` writes to Luau's print hook; Sparkdown has no debug magic types" },
    source: `
        local a: _luau_print<typeof(math.abs)>
    `,
    expect: [],
  },
  {
    name: "luau_print_is_not_special_without_the_flag",
    fixture: "Fixture",
    flags: { DebugLuauMagicTypes: false },
    source: `
        local a: _luau_print<number>
    `,
    expect: [{ errors: 1 }],
  },
  {
    name: "luau_print_incomplete",
    fixture: "Fixture",
    flags: { DebugLuauMagicTypes: true },
    skip: { notApplicable: "checks the error from Luau's debug-only magic type `_luau_print`; Sparkdown has no debug magic types" },
    source: `
        local a: _luau_print
    `,
    expect: [],
  },
  {
    name: "instantiate_type_fun_should_not_trip_rbxassert",
    fixture: "Fixture",
    source: `
        type Foo<T> = typeof(function(x) return x end)
        local foo: Foo<number>
    `,
    expect: [{ errors: 0 }],
  },
  {
    name: "pulling_a_type_from_value_dont_falsely_create_occurs_check_failed",
    fixture: "Fixture",
    ignoreMissingAnnotations: true,
    source: `
        function f(x)
            type T = typeof(x)
        end
    `,
    expect: [{ errors: 0 }],
  },
  {
    name: "occurs_check_on_cyclic_union_type",
    fixture: "Fixture",
    source: `
        type T = T | T
        local x : T
    `,
    expect: [{ errors: 1 }, { error: 0, code: "OccursCheckFailed" }],
  },
  {
    name: "occurs_check_on_cyclic_intersection_type",
    fixture: "Fixture",
    source: `
        type T = T & T
    `,
    expect: [{ errors: 1 }, { error: 0, code: "OccursCheckFailed" }],
  },
  {
    name: "instantiation_clone_has_to_follow",
    fixture: "Fixture",
    source: `
        export type t8<t8> = (t0)&(<t0...>((true)|(any))->"")
        export type t0<t0> = ({})&({_:{[any]:number},})
    `,
    expect: [{ errors: "some" }],
  },
  {
    name: "unifier3_supertail_covariant_with_sub",
    fixture: "Fixture",
    source: `
        local function fib(n)
            return n + fib(n)
        end
    `,
    expect: [{ type: "fib", equals: "<T>(T) -> t1 where t1 = add<T, t1>" }],
  },
  {
    name: "respect_partially_annotated_type_packs_1",
    fixture: "BuiltinsFixture",
    source: `
        local function f(): (number, string)
            return 42, "huh"
        end

        local a: number, b = f()

        print(math.abs(b))
    `,
    expect: [
      { errors: 1 },
      { error: 0, code: "TypeMismatch", fields: { wantedType: "number", givenType: "string" } },
    ],
  },
  {
    name: "respect_partially_annotated_type_packs_2",
    fixture: "BuiltinsFixture",
    source: `
        local function f(): (number, boolean, string)
            return 42, true, "huh"
        end

        local a: number, b, c: string = f()
    `,
    expect: [{ errors: 0 }, { type: "b", equals: "boolean" }],
  },
  {
    name: "react_use_state_partial_annotation",
    fixture: "BuiltinsFixture",
    source: `
        type BasicStateAction<S> = ((S) -> S) | S
        type Dispatch<A> = (A) -> ()

        local useState: <S>( (() -> S) | S ) -> (S, Dispatch<BasicStateAction<S>>) = nil :: any

        local v: number, setV = useState(0)
        local w, setW = useState(0 :: number?)
        local x, setX = useState(0)
    `,
    expect: [
      { errors: 0 },
      { type: "setV", equals: "(((number) -> number) | number) -> ()" },
      { type: "w", equals: "number?" },
      { type: "setW", equals: "((((number?) -> number?) | number)?) -> ()" },
      { type: "x", equals: "number" },
      { type: "setX", equals: "(((number) -> number) | number) -> ()" },
    ],
  },
]);
