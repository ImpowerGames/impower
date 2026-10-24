// Luau tests/NonstrictMode.test.cpp at 7d5f73364fdbbaa984fa545071630eba73cfea98.
// The two magic-type flag cases require the real configuration support in #1381.

import { portUpstreamFile } from "./portedCases";

portUpstreamFile("NonstrictMode.test.cpp", [
  // NonstrictMode.test.cpp:27 TEST_CASE_FIXTURE(Fixture, "infer_nullary_function")
  {
    "name": "infer_nullary_function",
    "fixture": "Fixture",
    source: `
        --!nonstrict
        function foo(x, y) end
    `,
    "expect": [
      {
        "errors": 0
      },
      {
        "type": "foo"
      },
      {
        "type": "foo",
        "equals": "(unknown, unknown) -> ()"
      }
    ]
  },
  // NonstrictMode.test.cpp:44 TEST_CASE_FIXTURE(Fixture, "infer_the_maximum_number_of_values_the_function_could_return")
  {
    "name": "infer_the_maximum_number_of_values_the_function_could_return",
    "fixture": "Fixture",
    source: `
        --!nonstrict
        function getMinCardCountForWidth(width)
            if width < 513 then
                return 3
            else
                return 8, 'jellybeans'
            end
        end
    `,
    "expect": [
      {
        "type": "getMinCardCountForWidth"
      },
      {
        "type": "getMinCardCountForWidth",
        "equals": "(number) -> number"
      }
    ]
  },
  // NonstrictMode.test.cpp:66 TEST_CASE_FIXTURE(Fixture, "return_annotation_is_still_checked")
  {
    "name": "return_annotation_is_still_checked",
    "fixture": "Fixture",
    source: `
        function foo(x): number return 'hello' end
    `,
    "expect": [
      {
        "errors": 1
      },
      {
        "type": "foo",
        "notEquals": "any"
      }
    ],
    "ignoreMissingAnnotations": true
  },
  // NonstrictMode.test.cpp:79 TEST_CASE_FIXTURE(Fixture, "function_parameters_are_any")
  {
    "name": "function_parameters_are_any",
    "fixture": "Fixture",
    source: `
        --!nonstrict
        function f(arg)
            arg = 9
            arg:concat(4)
        end
    `,
    "expect": [
      {
        "errors": 0
      }
    ]
  },
  // NonstrictMode.test.cpp:92 TEST_CASE_FIXTURE(Fixture, "inconsistent_return_types_are_ok")
  {
    "name": "inconsistent_return_types_are_ok",
    "fixture": "Fixture",
    source: `
        --!nonstrict
        function f()
            if 1 then
                return 4
            else
                return 'hello'
            end
            return 'one', 'two'
        end
    `,
    "expect": [
      {
        "errors": 0
      }
    ]
  },
  // NonstrictMode.test.cpp:109 TEST_CASE_FIXTURE(Fixture, "locals_are_any_by_default")
  {
    "name": "locals_are_any_by_default",
    "fixture": "Fixture",
    source: `
        --!nonstrict
        local m = 55
    `,
    "expect": [
      {
        "errors": 0
      },
      {
        "type": "m",
        "equals": "number",
        "options": {
          "exhaustive": true
        }
      }
    ]
  },
  // NonstrictMode.test.cpp:124 TEST_CASE_FIXTURE(Fixture, "parameters_having_type_any_are_optional")
  {
    "name": "parameters_having_type_any_are_optional",
    "fixture": "Fixture",
    source: `
        --!nonstrict
        local function f(a, b)
            return a
        end

        f(5)
    `,
    "expect": [
      {
        "errors": 0
      }
    ]
  },
  // NonstrictMode.test.cpp:138 TEST_CASE_FIXTURE(Fixture, "local_tables_are_not_any")
  {
    "name": "local_tables_are_not_any",
    "fixture": "Fixture",
    "skip": {
      "newSolver": "does not pass on Luau's new solver upstream"
    },
    source: `
        --!nonstrict
        local T = {}
        function T:method() end
        function T.staticmethod() end

        T.method()
        T:staticmethod()
    `,
    "expect": []
  },
  // NonstrictMode.test.cpp:156 TEST_CASE_FIXTURE(Fixture, "offer_a_hint_if_you_use_a_dot_instead_of_a_colon")
  {
    "name": "offer_a_hint_if_you_use_a_dot_instead_of_a_colon",
    "fixture": "Fixture",
    "skip": {
      "newSolver": "does not pass on Luau's new solver upstream"
    },
    source: `
        --!nonstrict
        local T = {}
        function T:method(x: number) end
        T.method(5)
    `,
    "expect": []
  },
  // NonstrictMode.test.cpp:171 TEST_CASE_FIXTURE(Fixture, "table_props_are_any")
  {
    "name": "table_props_are_any",
    "fixture": "Fixture",
    source: `
        --!nonstrict
        local T = {}
        T.foo = 55
    `,
    "expect": [
      {
        "errors": 0
      },
      {
        "type": "T",
        "equals": "{ foo: number }",
        "options": {
          "exhaustive": true
        }
      }
    ]
  },
  // NonstrictMode.test.cpp:187 TEST_CASE_FIXTURE(Fixture, "inline_table_props_are_also_any")
  {
    "name": "inline_table_props_are_also_any",
    "fixture": "Fixture",
    source: `
        --!nonstrict
        local T = {
            one = 1,
            two = 'two',
            three = function() return 3 end
        }
    `,
    "expect": [
      {
        "errors": 0
      },
      {
        "type": "T",
        "equals": "{ one: number, three: () -> number, two: string }",
        "options": {
          "exhaustive": true
        }
      }
    ]
  },
  // NonstrictMode.test.cpp:206 TEST_CASE_FIXTURE(BuiltinsFixture, "for_in_iterator_variables_are_any")
  {
    "name": "for_in_iterator_variables_are_any",
    "fixture": "BuiltinsFixture",
    source: `
        --!nonstrict
        function requires_a_table(arg: {}) end
        function requires_a_number(arg: number) end

        local T = {}
        for a, b in pairs(T) do
            requires_a_table(a)
            requires_a_table(b)
            requires_a_number(a)
            requires_a_number(b)
        end
    `,
    "expect": [
      {
        "errors": 0
      }
    ]
  },
  // NonstrictMode.test.cpp:225 TEST_CASE_FIXTURE(BuiltinsFixture, "table_dot_insert_and_recursive_calls")
  {
    "name": "table_dot_insert_and_recursive_calls",
    "fixture": "BuiltinsFixture",
    source: `
        --!nonstrict
        function populateListFromIds(list, normalizedData)
            local newList = {}

            for _, value in ipairs(list) do
                if type(value) == "table" then
                    table.insert(newList, populateListFromIds(value, normalizedData))
                else
                    table.insert(newList, normalizedData[value])
                end
            end

            return newList
        end
    `,
    "expect": [
      {
        "errors": 0
      }
    ]
  },
  // NonstrictMode.test.cpp:247 TEST_CASE_FIXTURE(Fixture, "delay_function_does_not_require_its_argument_to_return_anything")
  {
    "name": "delay_function_does_not_require_its_argument_to_return_anything",
    "fixture": "Fixture",
    source: `
        --!nonstrict

        function delay(ms: number?, cb: () -> ()): () end

        delay(50, function() end)
    `,
    "expect": [
      {
        "errors": 0
      }
    ]
  },
  // NonstrictMode.test.cpp:260 TEST_CASE_FIXTURE(Fixture, "inconsistent_module_return_types_are_ok")
  {
    "name": "inconsistent_module_return_types_are_ok",
    "fixture": "Fixture",
    source: `
        --!nonstrict

        local FFlag: any

        if FFlag.get('SomeFlag') then
            return {foo='bar'}
        else
            return function(prop)
                return 'bar'
            end
        end
    `,
    "expect": [
      {
        "errors": 0
      },
      {
        "moduleReturn": true,
        "equals": "{ foo: string }"
      }
    ]
  },
  // NonstrictMode.test.cpp:285 TEST_CASE_FIXTURE(Fixture, "returning_insufficient_return_values")
  {
    "name": "returning_insufficient_return_values",
    "fixture": "Fixture",
    source: `
        --!nonstrict

        function foo(): (boolean, string?)
            if true then
                return true, "hello"
            else
                return false
            end
        end
    `,
    "expect": [
      {
        "errors": 0
      }
    ]
  },
  // NonstrictMode.test.cpp:302 TEST_CASE_FIXTURE(Fixture, "returning_too_many_values")
  {
    "name": "returning_too_many_values",
    "fixture": "Fixture",
    source: `
        --!nonstrict

        function foo(): boolean
            if true then
                return true, "hello"
            else
                return false
            end
        end
    `,
    "expect": [
      {
        "errors": 0
      }
    ]
  },
  // NonstrictMode.test.cpp:319 TEST_CASE_FIXTURE(Fixture, "standalone_constraint_solving_incomplete_is_hidden_nonstrict")
  {
    "name": "standalone_constraint_solving_incomplete_is_hidden_nonstrict",
    "fixture": "Fixture",
    "flags": {
      "DebugLuauMagicTypes": true,
      "DebugLuauAlwaysShowConstraintSolvingIncomplete": false
    },
    source: `
        --!nonstrict
        local function _f(_x: _luau_force_constraint_solving_incomplete) end
    `,
    "expect": [
      {
        "errors": 0
      }
    ]
  },
  // NonstrictMode.test.cpp:337 TEST_CASE_FIXTURE(BuiltinsFixture, "non_standalone_constraint_solving_incomplete_is_hidden_nonstrict")
  {
    "name": "non_standalone_constraint_solving_incomplete_is_hidden_nonstrict",
    "fixture": "BuiltinsFixture",
    "flags": {
      "DebugLuauMagicTypes": true
    },
    source: `
        --!nonstrict
        local function _f(_x: _luau_force_constraint_solving_incomplete) end
        math.abs("pls")
    `,
    "expect": [
      {
        "errors": 2
      },
      {
        "error": 0,
        "code": "CheckedFunctionCallError"
      },
      {
        "error": 1,
        "code": "ConstraintSolvingIncompleteError"
      }
    ]
  },
  // NonstrictMode.test.cpp:355 TEST_CASE_FIXTURE(BuiltinsFixture, "allow_error_type_nonstrict")
  {
    "name": "allow_error_type_nonstrict",
    "fixture": "BuiltinsFixture",
    source: `
        local sublist: any
        if sublist then
            for _, entry in sublist do
                local _ = string.upper(entry)
            end
        end
    `,
    "expect": [
      {
        "errors": 0
      }
    ],
    "mode": "nonstrict"
  },
  // NonstrictMode.test.cpp:367 TEST_CASE_FIXTURE(BuiltinsFixture, "error_in_union_suppresses")
  {
    "name": "error_in_union_suppresses",
    "fixture": "BuiltinsFixture",
    source: `
        local sublist: any
        if sublist then
            local subitem = sublist.item
            local _ = string.upper(subitem)
        end
    `,
    "expect": [
      {
        "errors": 0
      }
    ],
    "mode": "nonstrict"
  },
]);
