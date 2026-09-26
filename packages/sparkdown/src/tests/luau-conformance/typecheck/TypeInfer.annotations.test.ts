// Luau's type-checker tests from `tests/TypeInfer.annotations.test.cpp` at the
// commit pinned in `../upstream/typecheck-cases.json`, ported as `README.md`
// describes. Each case names its upstream line.

import { portUpstreamFile } from "./portedCases";

portUpstreamFile("TypeInfer.annotations.test.cpp", [
  {
    // TypeInfer.annotations.test.cpp:20 TEST_CASE_FIXTURE(Fixture, "initializers_are_checked_against_annotations")
    name: "initializers_are_checked_against_annotations",
    fixture: "Fixture",
    source: `local a: number = "Hello Types!"`,
    expect: [{ errors: 1 }],
  },
  {
    // TypeInfer.annotations.test.cpp:26 TEST_CASE_FIXTURE(Fixture, "check_multi_initialize")
    name: "check_multi_initialize",
    fixture: "Fixture",
    source: `
        local a: number, b: string = "one", 2
    `,
    expect: [{ errors: 2 }, { error: 0, code: "TypeMismatch" }, { error: 1, code: "TypeMismatch" }],
  },
  {
    // TypeInfer.annotations.test.cpp:38 TEST_CASE_FIXTURE(Fixture, "successful_check")
    name: "successful_check",
    fixture: "Fixture",
    source: `
        local a: number, b: string = 1, "two"
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.annotations.test.cpp:47 TEST_CASE_FIXTURE(Fixture, "assignments_are_checked_against_annotations")
    name: "assignments_are_checked_against_annotations",
    fixture: "Fixture",
    source: `
        local x: number = 1
        x = "two"
    `,
    expect: [{ errors: 1 }],
  },
  {
    // TypeInfer.annotations.test.cpp:57 TEST_CASE_FIXTURE(Fixture, "multi_assign_checks_against_annotations")
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
    // TypeInfer.annotations.test.cpp:70 TEST_CASE_FIXTURE(Fixture, "assignment_cannot_transform_a_table_property_type")
    name: "assignment_cannot_transform_a_table_property_type",
    fixture: "Fixture",
    source: `
        local a = {x=0}
        a.x = "one"
    `,
    expect: [{ errors: 1 }, { error: 0, location: [2, 14, 2, 19] }],
  },
  {
    // TypeInfer.annotations.test.cpp:82 TEST_CASE_FIXTURE(Fixture, "assignments_to_unannotated_parameters_can_transform_the_type")
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
    // TypeInfer.annotations.test.cpp:100 TEST_CASE_FIXTURE(Fixture, "assignments_to_annotated_parameters_are_checked")
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
    // TypeInfer.annotations.test.cpp:119 TEST_CASE_FIXTURE(Fixture, "variable_type_is_supertype")
    name: "variable_type_is_supertype",
    fixture: "Fixture",
    source: `
        local x: number = 1
        local y: number? = x
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.annotations.test.cpp:129 TEST_CASE_FIXTURE(Fixture, "assignment_also_checks_subtyping")
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
    // TypeInfer.annotations.test.cpp:145 TEST_CASE_FIXTURE(Fixture, "function_parameters_can_have_annotations")
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
    // TypeInfer.annotations.test.cpp:160 TEST_CASE_FIXTURE(Fixture, "function_parameter_annotations_are_checked")
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
    // TypeInfer.annotations.test.cpp:175 TEST_CASE_FIXTURE(Fixture, "function_return_annotations_are_checked")
    // Upstream checks that the return pack's head is the builtin `any` type
    // itself, which prints as `any`.
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
    // TypeInfer.annotations.test.cpp:198 TEST_CASE_FIXTURE(Fixture, "function_return_multret_annotations_are_checked")
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
    // TypeInfer.annotations.test.cpp:209 TEST_CASE_FIXTURE(Fixture, "function_return_annotation_should_disambiguate_into_function_type_return_and_checked")
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
    // TypeInfer.annotations.test.cpp:220 TEST_CASE_FIXTURE(Fixture, "function_return_annotation_should_continuously_parse_return_annotation_and_checked")
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
    // TypeInfer.annotations.test.cpp:235 TEST_CASE_FIXTURE(Fixture, "unknown_type_reference_generates_error")
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
    // TypeInfer.annotations.test.cpp:254 TEST_CASE_FIXTURE(Fixture, "unknown_generic_type_pack_reference_generates_one_error")
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
    // TypeInfer.annotations.test.cpp:271 TEST_CASE_FIXTURE(Fixture, "unknown_generic_type_pack_vararg_generates_one_error")
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
    // TypeInfer.annotations.test.cpp:288 TEST_CASE_FIXTURE(Fixture, "unknown_generic_type_pack_in_explicit_instantiation_generates_one_error")
    name: "unknown_generic_type_pack_in_explicit_instantiation_generates_one_error",
    fixture: "Fixture",
    flags: { LuauStrictVisitInstantiatedType: true },
    checks: [
      {
        unparsed: { defect: 876 }, // a variadic type written ...T, or T... inside << >>
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
        unparsed: { defect: 876 }, // a variadic type written ...T, or T... inside << >>
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
        unparsed: { defect: 876 }, // a variadic type written ...T, or T... inside << >>
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
    // TypeInfer.annotations.test.cpp:324 TEST_CASE_FIXTURE(Fixture, "typeof_variable_type_annotation_should_return_its_type")
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
    // TypeInfer.annotations.test.cpp:338 TEST_CASE_FIXTURE(Fixture, "infer_type_of_value_a_via_typeof_with_assignment")
    // Upstream compares the error with a TypeMismatch built from the builtin
    // `nil` and `number` types, which print as `nil` and `number`.
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
    // TypeInfer.annotations.test.cpp:371 TEST_CASE_FIXTURE(Fixture, "table_annotation")
    // Upstream checks that `y` and `z` are the primitive types `number` and
    // `string`.
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
    // TypeInfer.annotations.test.cpp:384 TEST_CASE_FIXTURE(Fixture, "function_annotation")
    name: "function_annotation",
    fixture: "Fixture",
    source: `
        local f: (number, string) -> number
    `,
    expect: [{ errors: 0 }, { type: "f", kind: "FunctionType" }],
  },
  {
    // TypeInfer.annotations.test.cpp:399 TEST_CASE_FIXTURE(Fixture, "function_annotation_with_a_defined_function")
    name: "function_annotation_with_a_defined_function",
    fixture: "Fixture",
    source: `
        local f: (number, number) -> string = function(a: number, b: number) return "" end
    `,
    expect: [{ type: "f", kind: "FunctionType" }, { errors: 0 }],
  },
  {
    // TypeInfer.annotations.test.cpp:412 TEST_CASE_FIXTURE(Fixture, "type_assertion_expr")
    name: "type_assertion_expr",
    fixture: "Fixture",
    source: `local a = 55 :: any`,
    expect: [{ type: "a", equals: "any" }],
  },
  {
    // TypeInfer.annotations.test.cpp:418 TEST_CASE_FIXTURE(Fixture, "as_expr_does_not_propagate_type_info")
    name: "as_expr_does_not_propagate_type_info",
    fixture: "Fixture",
    source: `
        local a = 55 :: any
        local b = a :: number
    `,
    expect: [{ errors: 0 }, { type: "a", equals: "any" }, { type: "b", equals: "number" }],
  },
  {
    // TypeInfer.annotations.test.cpp:431 TEST_CASE_FIXTURE(Fixture, "as_expr_is_bidirectional")
    name: "as_expr_is_bidirectional",
    fixture: "Fixture",
    unparsed: { defect: 877 }, // a :: cast to a type that is not also an expression
    source: `
        local a = 55 :: number?
        local b = a :: number
    `,
    expect: [{ errors: 0 }, { type: "a", equals: "number?" }, { type: "b", equals: "number" }],
  },
  {
    // TypeInfer.annotations.test.cpp:444 TEST_CASE_FIXTURE(Fixture, "as_expr_warns_on_unrelated_cast")
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
    // TypeInfer.annotations.test.cpp:456 TEST_CASE_FIXTURE(Fixture, "type_annotations_inside_function_bodies")
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
    // TypeInfer.annotations.test.cpp:471 TEST_CASE_FIXTURE(Fixture, "for_loop_counter_annotation")
    name: "for_loop_counter_annotation",
    fixture: "Fixture",
    source: ` for i: number = 0, 50 do end `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.annotations.test.cpp:477 TEST_CASE_FIXTURE(Fixture, "for_loop_counter_annotation_is_checked")
    name: "for_loop_counter_annotation_is_checked",
    fixture: "Fixture",
    source: ` for i: string = 0, 10 do end `,
    expect: [{ errors: 1 }],
  },
  {
    // TypeInfer.annotations.test.cpp:483 TEST_CASE_FIXTURE(Fixture, "type_alias_should_alias_to_number")
    name: "type_alias_should_alias_to_number",
    fixture: "Fixture",
    source: `
        type A = number
        local a: A = 10
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.annotations.test.cpp:492 TEST_CASE_FIXTURE(Fixture, "type_alias_B_should_check_with_another_aliases_until_a_non_aliased_type")
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
    // TypeInfer.annotations.test.cpp:502 TEST_CASE_FIXTURE(Fixture, "type_aliasing_to_number_should_not_check_given_a_string")
    name: "type_aliasing_to_number_should_not_check_given_a_string",
    fixture: "Fixture",
    source: `
        type A = number
        local a: A = "fail"
    `,
    expect: [{ errors: 1 }],
  },
  {
    // TypeInfer.annotations.test.cpp:511 TEST_CASE_FIXTURE(Fixture, "self_referential_type_alias")
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
    // TypeInfer.annotations.test.cpp:540 TEST_CASE_FIXTURE(Fixture, "define_generic_type_alias")
    name: "define_generic_type_alias",
    fixture: "Fixture",
    source: `
        type Array<T> = {[number]: T}
    `,
    expect: [{ errors: 0 }, { alias: "Array", typeParameters: 1 }],
  },
  {
    // TypeInfer.annotations.test.cpp:559 TEST_CASE_FIXTURE(Fixture, "use_generic_type_alias")
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
    // TypeInfer.annotations.test.cpp:574 TEST_CASE_FIXTURE(Fixture, "two_type_params")
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
    // TypeInfer.annotations.test.cpp:590 TEST_CASE_FIXTURE(Fixture, "too_many_type_params")
    // Upstream also checks that the alias has 2 type parameters
    // (`typeFun.typeParams`), which the message states too.
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
    // TypeInfer.annotations.test.cpp:610 TEST_CASE_FIXTURE(Fixture, "duplicate_type_param_name")
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
    // TypeInfer.annotations.test.cpp:622 TEST_CASE_FIXTURE(Fixture, "typeof_expr")
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
    // TypeInfer.annotations.test.cpp:636 TEST_CASE_FIXTURE(Fixture, "corecursive_types_error_on_tight_loop")
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
    // TypeInfer.annotations.test.cpp:652 TEST_CASE_FIXTURE(Fixture, "type_alias_always_resolve_to_a_real_type")
    // Upstream compares with the builtin `number` type itself, which prints as
    // `number`.
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
    // TypeInfer.annotations.test.cpp:667 TEST_CASE_FIXTURE(Fixture, "interface_types_belong_to_interface_arena")
    // Upstream also checks which of Luau's type arenas holds the exported alias
    // and the field of the module's return value; arenas are Luau's memory
    // management, with no counterpart here.
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
    // TypeInfer.annotations.test.cpp:699 TEST_CASE_FIXTURE(Fixture, "generic_aliases_are_cloned_properly")
    // Upstream also checks that the alias's table sits in the module's
    // interface arena, which is Luau's memory management, with no counterpart
    // here.
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
    // TypeInfer.annotations.test.cpp:726 TEST_CASE_FIXTURE(Fixture, "cloned_interface_maintains_pointers_between_definitions")
    // Upstream also checks arena membership, and compares the fields `a` and
    // `b` of the module's return value with `Record`; the harness does not
    // expose a module's return value.
    name: "cloned_interface_maintains_pointers_between_definitions",
    fixture: "Fixture",
    source: `
        export type Record = { name: string, location: string }
        local a: Record = { name="Waldo", location="?????" }
        local b: Record = { name="Santa Claus", location="Maui" } -- FIXME

        return {a=a, b=b}
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.annotations.test.cpp:764 TEST_CASE_FIXTURE(BuiltinsFixture, "use_type_required_from_another_file")
    name: "use_type_required_from_another_file",
    fixture: "BuiltinsFixture",
    skip: { notApplicable: "resolves `require` between two modules, which this harness does not do; #597 decides how module cases run" },
    checks: [
      {
        module: "Modules/Main",
        unparsed: { defect: 879 }, // a call to require
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
    // TypeInfer.annotations.test.cpp:790 TEST_CASE_FIXTURE(BuiltinsFixture, "cannot_use_nonexported_type")
    name: "cannot_use_nonexported_type",
    fixture: "BuiltinsFixture",
    skip: { notApplicable: "resolves `require` between two modules, which this harness does not do; #597 decides how module cases run" },
    checks: [
      {
        module: "Modules/Main",
        unparsed: { defect: 879 }, // a call to require
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
    // TypeInfer.annotations.test.cpp:816 TEST_CASE_FIXTURE(BuiltinsFixture, "builtin_types_are_not_exported")
    name: "builtin_types_are_not_exported",
    fixture: "BuiltinsFixture",
    skip: { notApplicable: "resolves `require` between two modules, which this harness does not do; #597 decides how module cases run" },
    checks: [
      {
        module: "Modules/Main",
        unparsed: { defect: 879 }, // a call to require
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
    // TypeInfer.annotations.test.cpp:867 TEST_CASE_FIXTURE(Fixture, "luau_ice_triggers_an_ice_exception_with_flag")
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
    // TypeInfer.annotations.test.cpp:883 TEST_CASE_FIXTURE(Fixture, "luau_ice_triggers_an_ice_exception_with_flag_handler")
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
    // TypeInfer.annotations.test.cpp:904 TEST_CASE_FIXTURE(Fixture, "luau_ice_is_not_special_without_the_flag")
    // Upstream asserts only that checking does not throw.
    name: "luau_ice_is_not_special_without_the_flag",
    fixture: "Fixture",
    flags: { DebugLuauMagicTypes: false },
    source: `
        local a: _luau_ice = 55
    `,
    expect: [],
  },
  {
    // TypeInfer.annotations.test.cpp:914 TEST_CASE_FIXTURE(BuiltinsFixture, "luau_print_is_magic_if_the_flag_is_set")
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
    // TypeInfer.annotations.test.cpp:940 TEST_CASE_FIXTURE(Fixture, "luau_print_is_not_special_without_the_flag")
    name: "luau_print_is_not_special_without_the_flag",
    fixture: "Fixture",
    flags: { DebugLuauMagicTypes: false },
    source: `
        local a: _luau_print<number>
    `,
    expect: [{ errors: 1 }],
  },
  {
    // TypeInfer.annotations.test.cpp:951 TEST_CASE_FIXTURE(Fixture, "luau_print_incomplete")
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
    // TypeInfer.annotations.test.cpp:963 TEST_CASE_FIXTURE(Fixture, "instantiate_type_fun_should_not_trip_rbxassert")
    name: "instantiate_type_fun_should_not_trip_rbxassert",
    fixture: "Fixture",
    source: `
        type Foo<T> = typeof(function(x) return x end)
        local foo: Foo<number>
    `,
    expect: [{ errors: 0 }],
  },
  {
    // TypeInfer.annotations.test.cpp:976 TEST_CASE_FIXTURE(Fixture, "pulling_a_type_from_value_dont_falsely_create_occurs_check_failed")
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
    // TypeInfer.annotations.test.cpp:991 TEST_CASE_FIXTURE(Fixture, "occurs_check_on_cyclic_union_type")
    name: "occurs_check_on_cyclic_union_type",
    fixture: "Fixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
    source: `
        type T = T | T
        local x : T
    `,
    expect: [{ errors: 1 }, { error: 0, code: "OccursCheckFailed" }],
  },
  {
    // TypeInfer.annotations.test.cpp:1004 TEST_CASE_FIXTURE(Fixture, "occurs_check_on_cyclic_intersection_type")
    name: "occurs_check_on_cyclic_intersection_type",
    fixture: "Fixture",
    source: `
        type T = T & T
    `,
    expect: [{ errors: 1 }, { error: 0, code: "OccursCheckFailed" }],
  },
  {
    // TypeInfer.annotations.test.cpp:1016 TEST_CASE_FIXTURE(Fixture, "instantiation_clone_has_to_follow")
    name: "instantiation_clone_has_to_follow",
    fixture: "Fixture",
    source: `
        export type t8<t8> = (t0)&(<t0...>((true)|(any))->"")
        export type t0<t0> = ({})&({_:{[any]:number},})
    `,
    expect: [{ errors: "some" }],
  },
  {
    // TypeInfer.annotations.test.cpp:1026 TEST_CASE_FIXTURE(Fixture, "unifier3_supertail_covariant_with_sub")
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
    // TypeInfer.annotations.test.cpp:1039 TEST_CASE_FIXTURE(BuiltinsFixture, "respect_partially_annotated_type_packs_1")
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
    // TypeInfer.annotations.test.cpp:1058 TEST_CASE_FIXTURE(BuiltinsFixture, "respect_partially_annotated_type_packs_2")
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
    // TypeInfer.annotations.test.cpp:1071 TEST_CASE_FIXTURE(BuiltinsFixture, "react_use_state_partial_annotation")
    name: "react_use_state_partial_annotation",
    fixture: "BuiltinsFixture",
    unparsed: { defect: 875 }, // a type union written with spaces around |
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
