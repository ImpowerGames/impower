// Port of tests/TypeInfer.functions.test.cpp at luau-lang/luau@7d5f73364fdbbaa984fa545071630eba73cfea98.
// Sources are verbatim; expectations select upstream's new-solver branches.
import { portUpstreamFile } from "./portedCases";

portUpstreamFile("TypeInfer.functions.test.cpp", [
  // TypeInfer.functions.test.cpp:40 TEST_CASE_FIXTURE(Fixture, "general_case_table_literal_blocks")
  {
    "name": "general_case_table_literal_blocks",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
--!strict
function f(x : {[any]: number})
   return x
end

local Foo = {bar = "$$$"}

f({[Foo.bar] = 0})
`,
        "expect": [
          {
            "errors": 0
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:58 TEST_CASE_FIXTURE(Fixture, "overload_resolution")
  {
    "name": "overload_resolution",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        type A = (number) -> string
        type B = (string) -> number

        local function foo(f: A & B)
            return f(1), f("five")
        end
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "foo",
            "kind": "FunctionType"
          },
          {
            "type": "foo",
            "equals": "(((number) -> string) & ((string) -> number)) -> (string, number)"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:79 TEST_CASE_FIXTURE(Fixture, "tc_function")
  {
    "name": "tc_function",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `function five() return 5 end`,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "five",
            "kind": "FunctionType"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:91 TEST_CASE_FIXTURE(Fixture, "check_function_bodies")
  {
    "name": "check_function_bodies",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        function myFunction(): number
            local a = 0
            a = true
            return a
        end
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "code": "TypeMismatch"
          },
          {
            "error": 0,
            "fields": {
              "wantedType": "number"
            }
          },
          {
            "error": 0,
            "fields": {
              "givenType": "boolean"
            }
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:125 TEST_CASE_FIXTURE(Fixture, "cannot_hoist_interior_defns_into_signature")
  {
    "name": "cannot_hoist_interior_defns_into_signature",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local function f(x: T)
            type T = number
        end
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "code": "UnknownSymbol",
            "location": [
              1,
              28,
              1,
              29
            ],
            "fields": {
              "name": "T",
              "context": "Type"
            }
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:151 TEST_CASE_FIXTURE(Fixture, "infer_return_type")
  {
    "name": "infer_return_type",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `function take_five() return 5 end`,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "take_five",
            "kind": "FunctionType"
          },
          {
            "type": "take_five",
            "path": [
              {
                "result": 0
              }
            ]
          },
          {
            "type": "take_five",
            "path": [
              {
                "result": 0
              }
            ],
            "equals": "number"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:168 TEST_CASE_FIXTURE(Fixture, "infer_from_function_return_type")
  {
    "name": "infer_from_function_return_type",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `function take_five() return 5 end    local five = take_five()`,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "five",
            "equals": "number"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:179 TEST_CASE_FIXTURE(Fixture, "infer_that_function_does_not_return_a_table")
  {
    "name": "infer_that_function_does_not_return_a_table",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        function take_five()
            return 5
        end

        take_five().prop = 888
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "code": "NotATable",
            "location": [
              5,
              8,
              5,
              24
            ],
            "fields": {
              "ty": "number"
            }
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:195 TEST_CASE_FIXTURE(Fixture, "generalize_table_property")
  {
    "name": "generalize_table_property",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local T = {}

        T.foo = function(x)
            return x
        end
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "T",
            "kind": "TableType"
          },
          {
            "type": "T",
            "path": [
              {
                "property": "foo"
              }
            ]
          },
          {
            "type": "T",
            "path": [
              {
                "property": "foo"
              }
            ],
            "equals": "<T>(T) -> T"
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:217 TEST_CASE_FIXTURE(Fixture, "vararg_functions_should_allow_calls_of_any_types_and_size")
  {
    "name": "vararg_functions_should_allow_calls_of_any_types_and_size",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        function f(...) end

        f(1)
        f("foo", 2)
    `,
        "expect": [
          {
            "errors": 0
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:230 TEST_CASE_FIXTURE(BuiltinsFixture, "vararg_function_is_quantified")
  // PENDING ASSERTION AUDIT: REQUIRE(ttv->props.count("f"))
  {
    "name": "vararg_function_is_quantified",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        local T = {}
        function T.f(...)
            local result = {}

            for i = 1, select("#", ...) do
                local dictionary = select(i, ...)
                for key, value in pairs(dictionary) do
                    result[key] = value
                end
            end

            return result
        end

        return T
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "moduleReturn": true,
            "path": [
              {
                "result": 0
              }
            ]
          },
          {
            "moduleReturn": true,
            "path": [
              {
                "result": 0
              }
            ],
            "kind": "TableType"
          },
          {
            "moduleReturn": true,
            "path": [
              {
                "result": 0
              },
              {
                "property": "f"
              }
            ]
          },
          {
            "moduleReturn": true,
            "path": [
              {
                "result": 0
              },
              {
                "property": "f"
              }
            ]
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:268 TEST_CASE_FIXTURE(Fixture, "list_only_alternative_overloads_that_match_argument_count")
  {
    "name": "list_only_alternative_overloads_that_match_argument_count",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local multiply: ((number)->number) & ((number)->string) & ((number, number)->number)
        multiply("")
    `,
        "expect": [
          {
            "errors": 2
          },
          {
            "error": 0,
            "code": "MultipleNonviableOverloads"
          },
          {
            "error": 0,
            "fields": {
              "attemptedArgCount": 1
            }
          },
          {
            "error": 1,
            "code": "ExtraInformation"
          },
          {
            "error": 1,
            "fields": {
              "message": "Available overloads: (number) -> number; and (number) -> string"
            }
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:303 TEST_CASE_FIXTURE(Fixture, "list_all_overloads_if_no_overload_takes_given_argument_count")
  {
    "name": "list_all_overloads_if_no_overload_takes_given_argument_count",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local multiply: ((number)->number) & ((number)->string) & ((number, number)->number)
        multiply()
    `,
        "expect": [
          {
            "errors": 2
          },
          {
            "error": 0,
            "code": "GenericError"
          },
          {
            "error": 0,
            "fields": {
              "message": "No overload for function accepts 0 arguments."
            }
          },
          {
            "error": 1,
            "code": "ExtraInformation"
          },
          {
            "error": 1,
            "fields": {
              "message": "Available overloads: (number) -> number; (number) -> string; and (number, number) -> number"
            }
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:321 TEST_CASE_FIXTURE(Fixture, "dont_give_other_overloads_message_if_only_one_argument_matching_overload_exists")
  {
    "name": "dont_give_other_overloads_message_if_only_one_argument_matching_overload_exists",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local multiply: ((number)->number) & ((number)->string) & ((number, number)->number)
        multiply(1, "")
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "code": "TypeMismatch"
          },
          {
            "error": 0,
            "fields": {
              "wantedType": "number"
            }
          },
          {
            "error": 0,
            "fields": {
              "givenType": "string"
            }
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:336 TEST_CASE_FIXTURE(Fixture, "infer_return_type_from_selected_overload")
  {
    "name": "infer_return_type_from_selected_overload",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        type T = {method: ((T, number) -> number) & ((number) -> string)}
        local T: T

        local a = T.method(T, 4)
        local b = T.method(5)
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "a",
            "equals": "number"
          },
          {
            "type": "b",
            "equals": "string"
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:351 TEST_CASE_FIXTURE(Fixture, "too_many_arguments")
  {
    "name": "too_many_arguments",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        --!nonstrict

        function g(a: number) end

        g()

    `,
        "expect": []
      }
    ],
    "skip": {
      "newSolver": "does not pass on Luau's new solver upstream"
    }
  },
  // TypeInfer.functions.test.cpp:375 TEST_CASE_FIXTURE(Fixture, "too_many_arguments_error_location")
  {
    "name": "too_many_arguments_error_location",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        --!strict

        function myfunction(a: number, b:number) end
        myfunction(1)

        function getmyfunction()
            return myfunction
        end
        getmyfunction()()
    `,
        "expect": [
          {
            "errors": 2
          },
          {
            "error": 0,
            "location": [
              4,
              8,
              4,
              18
            ]
          },
          {
            "error": 0,
            "code": "CountMismatch"
          },
          {
            "error": 0,
            "fields": {
              "expected": 2
            }
          },
          {
            "error": 0,
            "fields": {
              "actual": 1
            }
          },
          {
            "error": 1,
            "location": [
              9,
              8,
              9,
              23
            ]
          },
          {
            "error": 1,
            "code": "CountMismatch"
          },
          {
            "error": 1,
            "fields": {
              "expected": 2
            }
          },
          {
            "error": 1,
            "fields": {
              "actual": 0
            }
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:417 TEST_CASE_FIXTURE(Fixture, "recursive_function")
  {
    "name": "recursive_function",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        function count(n: number)
            if n == 0 then
                return 0
            else
                return count(n - 1)
            end
        end
    `,
        "expect": [
          {
            "errors": 0
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:434 TEST_CASE_FIXTURE(Fixture, "lambda_form_of_local_function_cannot_be_recursive")
  {
    "name": "lambda_form_of_local_function_cannot_be_recursive",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local f = function() return f() end
    `,
        "expect": [
          {
            "errors": 1
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:443 TEST_CASE_FIXTURE(Fixture, "recursive_local_function")
  {
    "name": "recursive_local_function",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local function count(n: number)
            if n == 0 then
                return 0
            else
                return count(n - 1)
            end
        end
    `,
        "expect": [
          {
            "errors": 0
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:462 TEST_CASE_FIXTURE(Fixture, "another_recursive_local_function")
  {
    "name": "another_recursive_local_function",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local count
        function count(n: number)
            if n == 0 then
                return 0
            else
                return count(n - 1)
            end
        end
    `,
        "expect": [
          {
            "errors": 0
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:487 TEST_CASE_FIXTURE(BuiltinsFixture, "recursive_calls_must_refer_to_the_ungeneralized_type")
  {
    "name": "recursive_calls_must_refer_to_the_ungeneralized_type",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        function foo()
            string.format('%s: %s', "51", foo())
        end
    `,
        "expect": []
      }
    ]
  },
  // TypeInfer.functions.test.cpp:496 TEST_CASE_FIXTURE(Fixture, "cyclic_function_type_in_rets")
  {
    "name": "cyclic_function_type_in_rets",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        function f()
            return f
        end
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "f",
            "equals": "t1 where t1 = () -> t1"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:510 TEST_CASE_FIXTURE(Fixture, "another_higher_order_function")
  {
    "name": "another_higher_order_function",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local Get_des
        function Get_des(func)
            Get_des(func)
        end

        local function f(d)
            d:IsA("BasePart")
            d.Parent:FindFirstChild("Humanoid")
            d:IsA("Decal")
        end
        Get_des(f)

    `,
        "expect": [
          {
            "errors": 0
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:532 TEST_CASE_FIXTURE(Fixture, "another_other_higher_order_function")
  {
    "name": "another_other_higher_order_function",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
            local function f(d)
                d:foo()
                d:foo()
            end
        `,
        "expect": [
          {
            "errors": 0
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:561 TEST_CASE_FIXTURE(Fixture, "local_function")
  {
    "name": "local_function",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        function f()
            return 8
        end

        function g()
            local function f()
                return 'hello'
            end
            return f
        end

        local h = g()
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "h",
            "kind": "FunctionType"
          },
          {
            "type": "h",
            "path": [
              {
                "result": 0
              }
            ]
          },
          {
            "type": "h",
            "path": [
              {
                "result": 0
              }
            ],
            "equals": "string"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:594 TEST_CASE_FIXTURE(Fixture, "func_expr_doesnt_leak_free")
  {
    "name": "func_expr_doesnt_leak_free",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local p = function(x) return x end
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "p",
            "kind": "FunctionType"
          },
          {
            "type": "p",
            "path": [
              {
                "result": 0
              }
            ]
          },
          {
            "type": "p",
            "path": [
              {
                "result": 0
              }
            ],
            "kind": "GenericType"
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:608 TEST_CASE_FIXTURE(Fixture, "first_argument_can_be_optional")
  {
    "name": "first_argument_can_be_optional",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local T = {}
        function T.new(a: number?, b: number?, c: number?) return 5 end
        local m = T.new()
    `,
        "expect": [
          {
            "errors": 0
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:622 TEST_CASE_FIXTURE(Fixture, "it_is_ok_not_to_supply_enough_retvals")
  {
    "name": "it_is_ok_not_to_supply_enough_retvals",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        function get_two() return 5, 6 end

        local a = get_two()
    `,
        "expect": [
          {
            "errors": 0
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:636 TEST_CASE_FIXTURE(Fixture, "duplicate_functions2")
  {
    "name": "duplicate_functions2",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        function foo() end

        function bar()
            local function foo() end
        end
    `,
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:649 TEST_CASE_FIXTURE(Fixture, "duplicate_functions_allowed_in_nonstrict")
  {
    "name": "duplicate_functions_allowed_in_nonstrict",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        --!nonstrict
        function foo() end

        function foo() end

        function bar()
            local function foo() end
        end
    `,
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:665 TEST_CASE_FIXTURE(Fixture, "duplicate_functions_with_different_signatures_not_allowed_in_nonstrict")
  {
    "name": "duplicate_functions_with_different_signatures_not_allowed_in_nonstrict",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        --!nonstrict
        function foo(): number
            return 1
        end
        foo()

        function foo(n: number): number
            return 2
        end
        foo()
    `,
        "expect": []
      }
    ],
    "skip": {
      "newSolver": "does not pass on Luau's new solver upstream"
    }
  },
  // TypeInfer.functions.test.cpp:691 TEST_CASE_FIXTURE(Fixture, "complicated_return_types_require_an_explicit_annotation")
  {
    "name": "complicated_return_types_require_an_explicit_annotation",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local i = 0
        function most_of_the_natural_numbers(): number?
            if i < 10 then
                i += 1
                return i
            else
                return nil
            end
        end
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "most_of_the_natural_numbers",
            "kind": "FunctionType"
          },
          {
            "type": "most_of_the_natural_numbers",
            "path": [
              {
                "result": 0
              }
            ]
          },
          {
            "type": "most_of_the_natural_numbers",
            "path": [
              {
                "result": 0
              }
            ],
            "kind": "UnionType"
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:716 TEST_CASE_FIXTURE(Fixture, "infer_higher_order_function")
  // PENDING ASSERTION AUDIT: REQUIRE_EQ(2, argVec.size())
  // PENDING ASSERTION AUDIT: CHECK_EQ(1, fArgs.size())
  {
    "name": "infer_higher_order_function",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        function apply(f, x)
            return f(x)
        end
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "apply",
            "kind": "FunctionType"
          },
          {
            "type": "apply",
            "path": [
              {
                "argument": 0
              }
            ],
            "kind": "FunctionType"
          },
          {
            "type": "apply",
            "path": [
              {
                "argument": 1
              }
            ],
            "sameAs": {
              "type": "apply",
              "path": [
                {
                  "argument": 0
                },
                {
                  "argument": 0
                }
              ]
            }
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:746 TEST_CASE_FIXTURE(Fixture, "higher_order_function_2")
  // PENDING ASSERTION AUDIT: REQUIRE_EQ(6, argVec.size())
  {
    "name": "higher_order_function_2",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        function bottomupmerge(comp, a, b, left, mid, right)
            local i, j = left, mid
            for k = left, right do
                if i < mid and (j > right or not comp(a[j], a[i])) then
                    b[k] = a[i]
                    i = i + 1
                else
                    b[k] = a[j]
                    j = j + 1
                end
            end
        end
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "bottomupmerge",
            "kind": "FunctionType"
          },
          {
            "type": "bottomupmerge",
            "path": [
              {
                "argument": 0
              }
            ],
            "kind": "FunctionType"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:778 TEST_CASE_FIXTURE(Fixture, "higher_order_function_3")
  {
    "name": "higher_order_function_3",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        function swap(p)
            local t = p[0]
            p[0] = p[1]
            p[1] = t
            return nil
        end

        function swapTwice(p)
            swap(p)
            swap(p)
            return p
        end

        function swapTwiceOn(t: { number })
            swapTwice(t)
        end
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "swapTwice",
            "equals": "<T, U>({T} & {U}) -> {T} & {U}"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:815 TEST_CASE_FIXTURE(BuiltinsFixture, "higher_order_function_4")
  // PENDING ASSERTION AUDIT: REQUIRE_EQ(2, argVec.size())
  // PENDING ASSERTION AUDIT: REQUIRE_EQ(2, size(arg1->argTypes))
  {
    "name": "higher_order_function_4",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        function bottomupmerge(comp, a, b, left, mid, right)
            local i, j = left, mid
            for k = left, right do
                if i < mid and (j > right or not comp(a[j], a[i])) then
                    b[k] = a[i]
                    i = i + 1
                else
                    b[k] = a[j]
                    j = j + 1
                end
            end
        end

        function mergesort<T>(arr: {T}, comp: (T, T) -> boolean)
            local work = {}
            for i = 1, #arr do
                work[i] = arr[i]
            end
            local width = 1
            while width < #arr do
                for i = 1, #arr, 2*width do
                    bottomupmerge(comp, arr, work, i, math.min(i+width, #arr), math.min(i+2*width-1, #arr))
                end
                local temp = work
                work = arr
                arr = temp
                width = width * 2
            end
            return arr
        end
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "mergesort",
            "kind": "FunctionType"
          },
          {
            "type": "mergesort",
            "path": [
              {
                "argument": 0
              }
            ],
            "kind": "TableType"
          },
          {
            "type": "mergesort",
            "path": [
              {
                "argument": 0
              },
              {
                "indexer": "result"
              }
            ]
          },
          {
            "type": "mergesort",
            "path": [
              {
                "argument": 1
              }
            ],
            "kind": "FunctionType"
          },
          {
            "type": "mergesort",
            "path": [
              {
                "argument": 0
              },
              {
                "indexer": "result"
              }
            ],
            "sameAs": {
              "type": "mergesort",
              "path": [
                {
                  "argument": 1
                },
                {
                  "argument": 0
                }
              ]
            }
          },
          {
            "type": "mergesort",
            "path": [
              {
                "argument": 0
              },
              {
                "indexer": "result"
              }
            ],
            "sameAs": {
              "type": "mergesort",
              "path": [
                {
                  "argument": 1
                },
                {
                  "argument": 1
                }
              ]
            }
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:881 TEST_CASE_FIXTURE(BuiltinsFixture, "mutual_recursion")
  {
    "name": "mutual_recursion",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        --!strict

        function newPlayerCharacter()
            startGui() -- Unknown symbol 'startGui'
        end

        local characterAddedConnection: any
        function startGui()
            characterAddedConnection = game:GetService("Players").LocalPlayer.CharacterAdded:connect(newPlayerCharacter)
        end
    `,
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:899 TEST_CASE_FIXTURE(BuiltinsFixture, "toposort_doesnt_break_mutual_recursion")
  {
    "name": "toposort_doesnt_break_mutual_recursion",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        --!strict
        local x = nil
        function f() g() end
        -- make sure print(x) doesn't get toposorted here, breaking the mutual block
        function g() x = f end
        print(x)
    `,
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:914 TEST_CASE_FIXTURE(Fixture, "check_function_before_lambda_that_uses_it")
  {
    "name": "check_function_before_lambda_that_uses_it",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        --!nonstrict

        function f()
            return 114
        end

        return function()
            return f():andThen()
        end
    `,
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:931 TEST_CASE_FIXTURE(BuiltinsFixture, "it_is_ok_to_oversaturate_a_higher_order_function_argument")
  {
    "name": "it_is_ok_to_oversaturate_a_higher_order_function_argument",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        function onerror() end
        function foo() end
        xpcall(foo, onerror)
    `,
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:942 TEST_CASE_FIXTURE(Fixture, "another_indirect_function_case_where_it_is_ok_to_provide_too_many_arguments")
  {
    "name": "another_indirect_function_case_where_it_is_ok_to_provide_too_many_arguments",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local mycb: (number, number) -> ()

        function f() end

        mycb = f
    `,
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:955 TEST_CASE_FIXTURE(Fixture, "report_exiting_without_return_nonstrict")
  {
    "name": "report_exiting_without_return_nonstrict",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        --!nonstrict

        local function f1(v): number?
            if v then
                return 1
            end
        end

        local function f2(v)
            if v then
                return 1
            end
        end

        local function f3(v): ()
            if v then
                return
            end
        end

        local function f4(v)
            if v then
                return
            end
        end
    `,
        "expect": []
      }
    ],
    "skip": {
      "newSolver": "does not pass on Luau's new solver upstream"
    }
  },
  // TypeInfer.functions.test.cpp:993 TEST_CASE_FIXTURE(Fixture, "report_exiting_without_return_strict")
  {
    "name": "report_exiting_without_return_strict",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        --!strict

        local function f1(v): number?
            if v then
                return 1
            end
        end

        local function f2(v)
            if v then
                return 1
            end
        end

        local function f3(v): ()
            if v then
                return
            end
        end

        local function f4(v)
            if v then
                return
            end
        end
    `,
        "expect": [
          {
            "errors": 2
          },
          {
            "error": 0,
            "code": "FunctionExitsWithoutReturning"
          },
          {
            "error": 1,
            "code": "FunctionExitsWithoutReturning"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:1033 TEST_CASE_FIXTURE(Fixture, "calling_function_with_incorrect_argument_type_yields_errors_spanning_argument")
  {
    "name": "calling_function_with_incorrect_argument_type_yields_errors_spanning_argument",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        function foo(a: number, b: string) end

        foo("Test", 123)
    `,
        "expect": [
          {
            "errors": 2
          },
          {
            "error": 0,
            "code": "TypeMismatch",
            "location": [
              3,
              12,
              3,
              18
            ],
            "fields": {
              "wantedType": "number",
              "givenType": "string"
            }
          },
          {
            "error": 1,
            "code": "TypeMismatch",
            "location": [
              3,
              20,
              3,
              23
            ],
            "fields": {
              "wantedType": "string",
              "givenType": "number"
            }
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:1066 TEST_CASE_FIXTURE(BuiltinsFixture, "calling_function_with_anytypepack_doesnt_leak_free_types")
  // PENDING PRINT AUDIT: upstream also sets ToStringOptions.maxTableLength=0 (unlimited), which the current harness options cannot state.
  {
    "name": "calling_function_with_anytypepack_doesnt_leak_free_types",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        --!nonstrict

        function Test(a)
            return 1, ""
        end


        local tab = {}
        table.insert(tab, Test(1));
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "tab",
            "equals": "{string}",
            "options": {
              "exhaustive": true
            }
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:1092 TEST_CASE_FIXTURE(Fixture, "too_many_return_values")
  {
    "name": "too_many_return_values",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        --!strict

        function f()
            return 55
        end

        local a, b = f()
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "code": "CountMismatch"
          },
          {
            "error": 0,
            "fields": {
              "context": "FunctionResult"
            }
          },
          {
            "error": 0,
            "fields": {
              "expected": 1
            }
          },
          {
            "error": 0,
            "fields": {
              "actual": 2
            }
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:1115 TEST_CASE_FIXTURE(Fixture, "too_many_return_values_in_parentheses")
  {
    "name": "too_many_return_values_in_parentheses",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        --!strict

        function f()
            return 55
        end

        local a, b = (f())
    `,
        "expect": []
      }
    ],
    "skip": {
      "newSolver": "does not pass on Luau's new solver upstream"
    }
  },
  // TypeInfer.functions.test.cpp:1139 TEST_CASE_FIXTURE(Fixture, "too_many_return_values_no_function")
  {
    "name": "too_many_return_values_no_function",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        --!strict

        local a, b = 55
    `,
        "expect": []
      }
    ],
    "skip": {
      "newSolver": "does not pass on Luau's new solver upstream"
    }
  },
  // TypeInfer.functions.test.cpp:1159 TEST_CASE_FIXTURE(Fixture, "ignored_return_values")
  {
    "name": "ignored_return_values",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        --!strict

        function f()
            return 55, ""
        end

        local a = f()
    `,
        "expect": [
          {
            "errors": 0
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:1176 TEST_CASE_FIXTURE(Fixture, "function_does_not_return_enough_values")
  {
    "name": "function_does_not_return_enough_values",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        --!strict

        function f(): (number, string)
            return 55
        end
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "code": "TypePackMismatch"
          },
          {
            "error": 0,
            "fields": {
              "wantedTp": "number, string"
            }
          },
          {
            "error": 0,
            "fields": {
              "givenTp": "number"
            }
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:1207 TEST_CASE_FIXTURE(Fixture, "function_cast_error_uses_correct_language")
  {
    "name": "function_cast_error_uses_correct_language",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        function foo(a, b): number
            return 0
        end

        local a: (string)->number = foo
        local b: (number, number)->(number, number) = foo

        local c: (string, number)->number = foo -- no error
    `,
        "expect": [
          {
            "errors": 2
          },
          {
            "error": 0,
            "code": "TypeMismatch"
          },
          {
            "error": 0,
            "fields": {
              "wantedType": "(string) -> number"
            }
          },
          {
            "error": 0,
            "fields": {
              "givenType": "(unknown, unknown) -> number"
            }
          },
          {
            "error": 1,
            "code": "TypeMismatch"
          },
          {
            "error": 1,
            "fields": {
              "wantedType": "(number, number) -> (number, number)"
            }
          },
          {
            "error": 0,
            "fields": {
              "givenType": "(unknown, unknown) -> number"
            }
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:1243 TEST_CASE_FIXTURE(Fixture, "no_lossy_function_type")
  // PENDING ASSERTION AUDIT: CHECK(ftv->hasSelf)
  {
    "name": "no_lossy_function_type",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        --!strict
        local tbl = {}
        function tbl:abc(a: number, b: number)
            return a
        end
        tbl:abc(1, 2) -- Line 6
        --   | Column 14
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "typeAt": [
              6,
              14
            ],
            "equals": "(unknown, number, number) -> number"
          },
          {
            "typeAt": [
              6,
              14
            ],
            "kind": "FunctionType"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:1268 TEST_CASE_FIXTURE(Fixture, "record_matching_overload")
  // PENDING ASSERTION AUDIT: REQUIRE_GE(ancestry.size(), 2)
  // PENDING ASSERTION AUDIT: REQUIRE(bool(parentExpr))
  // PENDING ASSERTION AUDIT: REQUIRE(parentExpr->is<AstExprCall>())
  // PENDING ASSERTION AUDIT: REQUIRE(it)
  // PENDING ASSERTION AUDIT: CHECK_EQ(toString(*it), "(number) -> number")
  {
    "name": "record_matching_overload",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        type Overload = ((string) -> string) & ((number) -> number)
        local abc: Overload
        abc(1)
    `,
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:1293 TEST_CASE_FIXTURE(Fixture, "return_type_by_overload")
  {
    "name": "return_type_by_overload",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        type Overload = ((string) -> string) & ((number, number) -> number)
        local abc: Overload
        local x = abc(true)
        local y = abc(true,true)
        local z = abc(true,true,true)
    `,
        "expect": [
          {
            "errors": "some"
          },
          {
            "type": "x",
            "equals": "string"
          },
          {
            "type": "y",
            "equals": "number"
          },
          {
            "type": "z",
            "equals": "*error-type*"
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:1313 TEST_CASE_FIXTURE(BuiltinsFixture, "infer_anonymous_function_arguments")
  {
    "name": "infer_anonymous_function_arguments",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
type Table = { x: number, y: number }
local function f(a: (Table) -> number) return a({x = 1, y = 2}) end
f(function(a) return a.x + a.y end)
    `,
        "expect": []
      },
      {
        "source": `
type Table = { x: number, y: number }
local function f(a: ((Table) -> number)?) if a then return a({x = 1, y = 2}) else return 0 end end
f(function(a) return a.x + a.y end)
    `,
        "expect": []
      },
      {
        "source": `
type Table = { x: number, y: number }
local x = {}
x.b = {x = 1, y = 2}
function x:f(a: (Table) -> number) return a(self.b) end
x:f(function(a) return a.x + a.y end)
    `,
        "expect": []
      },
      {
        "source": `
function f(a: (a: number, b: number, c: boolean) -> number) return a(1, 2, true) end
f(function(a: number, b, c) return c and a + b or b - a end)
    `,
        "expect": []
      },
      {
        "source": `
type Table = { x: number, y: number }
local function f(a: (Table) -> number) return a({x = 1, y = 2}) end
f(function(...) return select(1, ...).z end)
    `,
        "expect": []
      },
      {
        "source": `
function f(a: (a: number, b: number) -> number) return a(1, 2) end
f(function(a, b, c, ...) return a + b end)
    `,
        "expect": []
      },
      {
        "source": `
function f(a: (...number) -> number) return a(1, 2) end
f(function(a, b) return a + b end)
    `,
        "expect": [],
        "unparsed": {
          "defect": 876
        }
      },
      {
        "source": `
type Table = { x: number, y: number }
function f(a: (...Table) -> number) return a({x = 1, y = 2}, {x = 3, y = 4}) end
f(function(a, ...) local b = ... return b.z end)
    `,
        "expect": [],
        "unparsed": {
          "defect": 876
        }
      },
      {
        "source": `
type Table = { x: number, y: number }
function f(a: (number) -> Table) return a(4) end
f(function(x) return x * 2 end)
    `,
        "expect": []
      },
      {
        "source": `
        function f(a: (number) -> nil) return a(4) end
        f(function(x) print(x) end)
    `,
        "expect": []
      }
    ],
    "skip": {
      "newSolver": "does not pass on Luau's new solver upstream"
    }
  },
  // TypeInfer.functions.test.cpp:1432 TEST_CASE_FIXTURE(BuiltinsFixture, "infer_generic_function_function_argument")
  {
    "name": "infer_generic_function_function_argument",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
local function sum<a>(x: a, y: a, f: (a, a) -> a) return f(x, y) end
return sum(2, 3, function(a, b) return a + b end)
    `,
        "expect": []
      },
      {
        "source": `
local function map<a, b>(arr: {a}, f: (a) -> b) local r = {} for i,v in ipairs(arr) do table.insert(r, f(v)) end return r end
local a = {1, 2, 3}
local r = map(a, function(a) return a + a > 100 end)
    `,
        "expect": []
      },
      {
        "source": `
local function foldl<a, b>(arr: {a}, init: b, f: (b, a) -> b) local r = init for i,v in ipairs(arr) do r = f(r, v) end return r end
local a = {1, 2, 3}
local r = foldl(a, {s=0,c=0}, function(a, b) return {s = a.s + b, c = a.c + 1} end)
    `,
        "expect": []
      }
    ],
    "skip": {
      "newSolver": "does not pass on Luau's new solver upstream"
    }
  },
  // TypeInfer.functions.test.cpp:1463 TEST_CASE_FIXTURE(Fixture, "infer_generic_function_function_argument_overloaded")
  {
    "name": "infer_generic_function_function_argument_overloaded",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
local function g1<T>(a: T, f: (T) -> T) return f(a) end
local function g2<T>(a: T, b: T, f: (T, T) -> T) return f(a, b) end

local g12: typeof(g1) & typeof(g2)

g12(1, function(x) return x + x end)
g12(1, 2, function(x, y) return x + y end)
    `,
        "expect": []
      },
      {
        "source": `
local function g1<T>(a: T, f: (T) -> T) return f(a) end
local function g2<T>(a: T, b: T, f: (T, T) -> T) return f(a, b) end

local g12: typeof(g1) & typeof(g2)

g12({x=1}, function(x) return {x=-x.x} end)
g12({x=1}, {x=2}, function(x, y) return {x=x.x + y.x} end)
    `,
        "expect": []
      }
    ],
    "skip": {
      "newSolver": "does not pass on Luau's new solver upstream"
    }
  },
  // TypeInfer.functions.test.cpp:1493 TEST_CASE_FIXTURE(BuiltinsFixture, "infer_generic_lib_function_function_argument")
  {
    "name": "infer_generic_lib_function_function_argument",
    "fixture": "BuiltinsFixture",
    "flags": {
      "LuauRemovePrimitiveTypeConstraintAndSubtypingUnifier": true
    },
    "checks": [
      {
        "source": `
        local a = {{x=4}, {x=7}, {x=1}}
        table.sort(a, function(x, y) return x.x < y.x end)
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "code": "GenericError"
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:1514 TEST_CASE_FIXTURE(Fixture, "variadic_any_is_compatible_with_a_generic_TypePack")
  {
    "name": "variadic_any_is_compatible_with_a_generic_TypePack",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        --!strict
        local function f(...) return ... end
        local g = function(...) return f(...) end
    `,
        "expect": [
          {
            "errors": 0
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:1528 TEST_CASE_FIXTURE(BuiltinsFixture, "variadic_any_is_compatible_with_a_generic_TypePack_2")
  {
    "name": "variadic_any_is_compatible_with_a_generic_TypePack_2",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        local function somethingThatsAny(...: any)
            print(...)
        end

        local function x<T...>(...: T...)
            somethingThatsAny(...) -- Failed to unify variadic type packs
        end
    `,
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:1543 TEST_CASE_FIXTURE(Fixture, "infer_anonymous_function_arguments_outside_call")
  {
    "name": "infer_anonymous_function_arguments_outside_call",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
type Table = { x: number, y: number }
local f: (Table) -> number = function(t) return t.x + t.y end

type TableWithFunc = { x: number, y: number, f: (number, number) -> number }
local a: TableWithFunc = { x = 3, y = 4, f = function(a, b) return a + b end }
    `,
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:1556 TEST_CASE_FIXTURE(Fixture, "infer_return_value_type")
  {
    "name": "infer_return_value_type",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
local function f(): {string|number}
    return {1, "b", 3}
end

local function g(): (number, {string|number})
    return 4, {1, "b", 3}
end

local function h(): ...{string|number}
    return {4}, {1, "b", 3}, {"s"}
end

local function i(): ...{string|number}
    return {1, "b", 3}, h()
end
    `,
        "expect": [
          {
            "errors": 0
          }
        ],
        "unparsed": {
          "defect": 876
        }
      }
    ]
  },
  // TypeInfer.functions.test.cpp:1579 TEST_CASE_FIXTURE(Fixture, "error_detailed_function_mismatch_arg_count")
  {
    "name": "error_detailed_function_mismatch_arg_count",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
type A = (number, number) -> string
type B = (number) -> string

local a: A
local b: B = a
    `,
        "expect": []
      }
    ],
    "skip": {
      "newSolver": "does not pass on Luau's new solver upstream"
    }
  },
  // TypeInfer.functions.test.cpp:1602 TEST_CASE_FIXTURE(Fixture, "error_detailed_function_mismatch_arg")
  {
    "name": "error_detailed_function_mismatch_arg",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
type A = (number, number) -> string
type B = (number, string) -> string

local a: A
local b: B = a
    `,
        "expect": []
      }
    ],
    "skip": {
      "newSolver": "does not pass on Luau's new solver upstream"
    }
  },
  // TypeInfer.functions.test.cpp:1626 TEST_CASE_FIXTURE(Fixture, "error_detailed_function_mismatch_ret_count")
  {
    "name": "error_detailed_function_mismatch_ret_count",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
type A = (number, number) -> (number)
type B = (number, number) -> (number, boolean)

local a: A
local b: B = a
    `,
        "expect": []
      }
    ],
    "skip": {
      "newSolver": "does not pass on Luau's new solver upstream"
    }
  },
  // TypeInfer.functions.test.cpp:1649 TEST_CASE_FIXTURE(Fixture, "error_detailed_function_mismatch_ret")
  {
    "name": "error_detailed_function_mismatch_ret",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
type A = (number, number) -> string
type B = (number, number) -> number

local a: A
local b: B = a
    `,
        "expect": []
      }
    ],
    "skip": {
      "newSolver": "does not pass on Luau's new solver upstream"
    }
  },
  // TypeInfer.functions.test.cpp:1673 TEST_CASE_FIXTURE(Fixture, "error_detailed_function_mismatch_ret_mult")
  {
    "name": "error_detailed_function_mismatch_ret_mult",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
type A = (number, number) -> (number, string)
type B = (number, number) -> (number, boolean)

local a: A
local b: B = a
    `,
        "expect": []
      }
    ],
    "skip": {
      "newSolver": "does not pass on Luau's new solver upstream"
    }
  },
  // TypeInfer.functions.test.cpp:1697 TEST_CASE_FIXTURE(BuiltinsFixture, "function_decl_quantify_right_type")
  // PENDING MODULE AUDIT: source game/isAMagicMock and require(game.isAMagicMock) share one resolver.
  {
    "name": "function_decl_quantify_right_type",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
--!nonstrict
return function(value)
    return false
end
    `,
        "module": "game/isAMagicMock",
        "expect": []
      },
      {
        "source": `
--!nonstrict
local MagicMock = {}
MagicMock.is = require(game.isAMagicMock)

function MagicMock.is(value)
    return false
end
    `,
        "expect": [
          {
            "errors": 0
          }
        ],
        "unparsed": {
          "defect": 879
        }
      }
    ]
  },
  // TypeInfer.functions.test.cpp:1719 TEST_CASE_FIXTURE(BuiltinsFixture, "function_decl_non_self_sealed_overwrite")
  // PENDING SETUP AUDIT: preserve upstream's shared builtin fixture before and after frontend.clear() via shareFixture/clearModules when #1368 lands.
  {
    "name": "function_decl_non_self_sealed_overwrite",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        function string.len(): number
            return 1
        end

        local s = string
    `,
        "expect": [
          {
            "errors": 0
          }
        ]
      },
      {
        "source": `
        print(string.len('hello'))
    `,
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:1741 TEST_CASE_FIXTURE(BuiltinsFixture, "function_decl_non_self_sealed_overwrite_2")
  {
    "name": "function_decl_non_self_sealed_overwrite_2",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
local t: { f: ((x: number) -> number)? } = {}

function t.f(x)
    print(x + 5)
    return x .. "asd" -- 1st error: we know that return type is a number, not a string
end

t.f = function(x)
    print(x + 5)
    return x .. "asd" -- 2nd error: we know that return type is a number, not a string
end
    `,
        "expect": [
          {
            "errors": 2
          },
          {
            "anyError": "WhereClauseNeeded"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:1772 TEST_CASE_FIXTURE(Fixture, "inferred_higher_order_functions_are_quantified_at_the_right_time2")
  {
    "name": "inferred_higher_order_functions_are_quantified_at_the_right_time2",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        --!strict

        local function resolveDispatcher()
            return (nil :: any) :: {useContext: (number?) -> any}
        end

        local useContext
        useContext = function(unstable_observedBits: number?)
            resolveDispatcher().useContext(unstable_observedBits)
        end
    `,
        "expect": [
          {
            "errors": 0
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:1800 TEST_CASE_FIXTURE(Fixture, "inferred_higher_order_functions_are_quantified_at_the_right_time3")
  {
    "name": "inferred_higher_order_functions_are_quantified_at_the_right_time3",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local foo

        foo():bar(function()
            return foo()
        end)
    `,
        "expect": []
      }
    ],
    "skip": {
      "newSolver": "does not pass on Luau's new solver upstream"
    }
  },
  // TypeInfer.functions.test.cpp:1817 TEST_CASE_FIXTURE(BuiltinsFixture, "function_decl_non_self_unsealed_overwrite")
  {
    "name": "function_decl_non_self_unsealed_overwrite",
    "fixture": "BuiltinsFixture",
    "flags": {
      "LuauCheckFunctionStatementTypes": true
    },
    "checks": [
      {
        "source": `
local t = { f = nil :: ((x: number) -> number)? }

function t.f(x: string): string -- 1st error: new function value type is incompatible
    return x .. "asd"
end

t.f = function(x)
    print(x + 5)
    return x .. "asd" -- 2nd error: we know that return type is a number, not a string
end
    `,
        "expect": [
          {
            "errors": 2
          },
          {
            "anyError": "WhereClauseNeeded"
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:1859 TEST_CASE_FIXTURE(Fixture, "strict_mode_ok_with_missing_arguments")
  {
    "name": "strict_mode_ok_with_missing_arguments",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local function f(x: any) end
        f()
    `,
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:1869 TEST_CASE_FIXTURE(Fixture, "function_statement_sealed_table_assignment_through_indexer")
  {
    "name": "function_statement_sealed_table_assignment_through_indexer",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
local t: {[string]: () -> number} = {}

function t.a() return 1 end -- OK
function t:b() return 2 end -- not OK
    `,
        "expect": []
      }
    ],
    "skip": {
      "newSolver": "does not pass on Luau's new solver upstream"
    }
  },
  // TypeInfer.functions.test.cpp:1894 TEST_CASE_FIXTURE(Fixture, "too_few_arguments_variadic")
  {
    "name": "too_few_arguments_variadic",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
    function test(a: number, b: string, ...)
    end

    test(1)
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "code": "CountMismatch"
          },
          {
            "error": 0,
            "fields": {
              "expected": 2
            }
          },
          {
            "error": 0,
            "fields": {
              "actual": 1
            }
          },
          {
            "error": 0,
            "fields": {
              "context": "Arg"
            }
          },
          {
            "error": 0,
            "fields": {
              "isVariadic": true
            }
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:1917 TEST_CASE_FIXTURE(Fixture, "too_few_arguments_variadic_generic")
  {
    "name": "too_few_arguments_variadic_generic",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
function test(a: number, b: string, ...)
    return 1
end

function wrapper<A...>(f: (A...) -> number, ...: A...)
end

wrapper(test)
    `,
        "expect": []
      }
    ],
    "skip": {
      "newSolver": "does not pass on Luau's new solver upstream"
    }
  },
  // TypeInfer.functions.test.cpp:1945 TEST_CASE_FIXTURE(BuiltinsFixture, "too_few_arguments_variadic_generic2")
  {
    "name": "too_few_arguments_variadic_generic2",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
function test(a: number, b: string, ...)
    return 1
end

function wrapper<A...>(f: (A...) -> number, ...: A...)
end

pcall(wrapper, test)
    `,
        "expect": []
      }
    ],
    "skip": {
      "newSolver": "does not pass on Luau's new solver upstream"
    }
  },
  // TypeInfer.functions.test.cpp:1973 TEST_CASE_FIXTURE(Fixture, "occurs_check_failure_in_function_return_type")
  {
    "name": "occurs_check_failure_in_function_return_type",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        function f()
            return 5, f()
        end
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "code": "OccursCheckFailed"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:1988 TEST_CASE_FIXTURE(Fixture, "free_is_not_bound_to_unknown")
  {
    "name": "free_is_not_bound_to_unknown",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local function foo(f: (unknown) -> (), x)
            f(x)
        end
    `,
        "expect": []
      }
    ],
    "skip": {
      "newSolver": "Upstream says this test only makes sense for the old solver and returns before checking on the new solver."
    }
  },
  // TypeInfer.functions.test.cpp:2003 TEST_CASE_FIXTURE(Fixture, "dont_infer_parameter_types_for_functions_from_their_call_site")
  {
    "name": "dont_infer_parameter_types_for_functions_from_their_call_site",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local t = {}

        function t.f(x)
            return x
        end

        t.__index = t

        function g(s)
            local q = s.p and s.p.q or nil
            return q and t.f(q) or nil
        end

        local f = t.f
    `,
        "expect": [
          {
            "type": "f",
            "equals": "<T>(T) -> T"
          },
          {
            "errors": 0
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:2039 TEST_CASE_FIXTURE(Fixture, "dont_mutate_the_underlying_head_of_typepack_when_calling_with_self")
  {
    "name": "dont_mutate_the_underlying_head_of_typepack_when_calling_with_self",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local t = {}
        function t:m(x) end
        function f(): never return 5 :: never end
        t:m(f())
        t:m(f())
    `,
        "expect": [
          {
            "errors": 0
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:2054 TEST_CASE_FIXTURE(BuiltinsFixture, "improved_function_arg_mismatch_errors")
  {
    "name": "improved_function_arg_mismatch_errors",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
local function foo1(a: number) end
foo1()

local function foo2(a: number, b: string?) end
foo2()

local function foo3(a: number, b: string?, c: any) end -- any is optional
foo3()

string.find()

local t = {}
function t.foo(x: number, y: string?, ...: any) return 1 end
function t:bar(x: number, y: string?) end
t.foo()

t:bar()

local u = { a = t, b = function() return t end }
u.a.foo()
local x = (u.a).foo()

u.b().foo()
    `,
        "expect": [
          {
            "errors": 9
          },
          {
            "error": 0,
            "message": "Argument count mismatch. Function expects 1 argument, but none are specified"
          },
          {
            "error": 1,
            "message": "Argument count mismatch. Function expects 1 to 2 arguments, but none are specified"
          },
          {
            "error": 2,
            "message": "Argument count mismatch. Function expects 1 to 3 arguments, but none are specified"
          },
          {
            "error": 3,
            "message": "Argument count mismatch. Function expects 2 to 4 arguments, but none are specified"
          },
          {
            "error": 4,
            "message": "Argument count mismatch. Function expects at least 1 argument, but none are specified"
          },
          {
            "error": 5,
            "message": "Argument count mismatch. Function expects 2 to 3 arguments, but only 1 is specified"
          },
          {
            "error": 6,
            "message": "Argument count mismatch. Function expects at least 1 argument, but none are specified"
          },
          {
            "error": 7,
            "message": "Argument count mismatch. Function expects at least 1 argument, but none are specified"
          },
          {
            "error": 8,
            "message": "Argument count mismatch. Function expects at least 1 argument, but none are specified"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:2113 TEST_CASE_FIXTURE(BuiltinsFixture, "improved_function_arg_mismatch_error_nonstrict")
  {
    "name": "improved_function_arg_mismatch_error_nonstrict",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        --!nonstrict
        local function foo(a, b) end
        foo(string.find("hello", "e"))
    `,
        "expect": []
      }
    ],
    "skip": {
      "newSolver": "does not pass on Luau's new solver upstream"
    }
  },
  // TypeInfer.functions.test.cpp:2128 TEST_CASE_FIXTURE(Fixture, "luau_subtyping_is_np_hard")
  // Exact line-leading intersections retained; approved context-sensitive grammar support is tracked in #1374.
  {
    "name": "luau_subtyping_is_np_hard",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
--!strict

-- An example of coding up graph coloring in the Luau type system.
-- This codes a three-node, two color problem.
-- A three-node triangle is uncolorable,
-- but a three-node line is colorable.

type Red = "red"
type Blue = "blue"
type Color = Red | Blue
type Coloring = (Color) -> (Color) -> (Color) -> boolean
type Uncolorable = (Color) -> (Color) -> (Color) -> false

type Line = Coloring
  & ((Red) -> (Red) -> (Color) -> false)
  & ((Blue) -> (Blue) -> (Color) -> false)
  & ((Color) -> (Red) -> (Red) -> false)
  & ((Color) -> (Blue) -> (Blue) -> false)

type Triangle = Line
  & ((Red) -> (Color) -> (Red) -> false)
  & ((Blue) -> (Color) -> (Blue) -> false)

local x : Triangle
local y : Line
local z : Uncolorable
z = x -- OK, so the triangle is uncolorable
z = y -- Not OK, so the line is colorable
    `,
        "expect": []
      }
    ],
    "skip": {
      "newSolver": "does not pass on Luau's new solver upstream"
    }
  },
  // TypeInfer.functions.test.cpp:2174 TEST_CASE_FIXTURE(Fixture, "function_is_supertype_of_concrete_functions")
  // PENDING SETUP AUDIT: registerHiddenTypes(getFrontend()) defines builtin function alias fun.
  {
    "name": "function_is_supertype_of_concrete_functions",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        function foo(f: fun) end

        function a() end
        function id(x) return x end

        foo(a)
        foo(id)
        foo(foo)
    `,
        "expect": [
          {
            "errors": 0
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:2194 TEST_CASE_FIXTURE(Fixture, "concrete_functions_are_not_supertypes_of_function")
  // PENDING SETUP AUDIT: registerHiddenTypes(getFrontend()) defines builtin function alias fun.
  {
    "name": "concrete_functions_are_not_supertypes_of_function",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local a: fun = function() end

        function one(arg: () -> ()) end
        function two(arg: <T>(T) -> T) end

        one(a)
        two(a)
    `,
        "expect": [
          {
            "errors": 2
          },
          {
            "error": 0,
            "line": 6
          },
          {
            "error": 0,
            "code": "TypeMismatch"
          },
          {
            "error": 0,
            "fields": {
              "wantedType": "() -> ()"
            }
          },
          {
            "error": 0,
            "fields": {
              "givenType": "function"
            }
          },
          {
            "error": 1,
            "line": 7
          },
          {
            "error": 1,
            "code": "TypeMismatch"
          },
          {
            "error": 1,
            "fields": {
              "wantedType": "<T>(T) -> T"
            }
          },
          {
            "error": 1,
            "fields": {
              "givenType": "function"
            }
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:2223 TEST_CASE_FIXTURE(Fixture, "other_things_are_not_related_to_function")
  // PENDING SETUP AUDIT: registerHiddenTypes(getFrontend()) defines builtin function alias fun.
  {
    "name": "other_things_are_not_related_to_function",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local a: fun = function() end
        local b: {} = a
        local c: boolean = a
        local d: fun = true
        local e: fun = {}
    `,
        "expect": [
          {
            "errors": 4
          },
          {
            "error": 0,
            "line": 2
          },
          {
            "error": 1,
            "line": 3
          },
          {
            "error": 2,
            "line": 4
          },
          {
            "error": 3,
            "line": 5
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:2243 TEST_CASE_FIXTURE(BuiltinsFixture, "fuzz_must_follow_in_overload_resolution")
  {
    "name": "fuzz_must_follow_in_overload_resolution",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
for _ in function<t0>():(t0)&((()->())&(()->()))
end do
_(_(_,_,_),_)
end
    `,
        "expect": [
          {
            "errors": "some"
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:2255 TEST_CASE_FIXTURE(Fixture, "dont_assert_when_the_tarjan_limit_is_exceeded_during_generalization")
  {
    "name": "dont_assert_when_the_tarjan_limit_is_exceeded_during_generalization",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        function f(t)
            t.x.y.z = 441
        end
    `,
        "expect": [
          {
            "anyError": "UnificationTooComplex"
          }
        ]
      }
    ],
    "limits": {
      "LuauTarjanChildLimit": 1
    }
  },
  // TypeInfer.functions.test.cpp:2273 TEST_CASE_FIXTURE(Fixture, "instantiated_type_packs_must_have_a_non_null_scope")
  {
    "name": "instantiated_type_packs_must_have_a_non_null_scope",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        function pcall<A..., R...>(...: (A...) -> R...): (boolean, R...)
            return nil :: any
        end

        type Dispatch<A> = (A) -> ()

        function mountReducer()
            dispatchAction()
            return nil :: any
        end

        function dispatchAction()
        end

        function useReducer(): Dispatch<any>
            local result, setResult = pcall(mountReducer)
            return setResult
        end
    `,
        "expect": [
          {
            "errors": 0
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:2301 TEST_CASE_FIXTURE(Fixture, "inner_frees_become_generic_in_dcr")
  {
    "name": "inner_frees_become_generic_in_dcr",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        function f(x)
            local z = x
            return x
        end
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "typeAt": [
              3,
              19
            ]
          },
          {
            "typeAt": [
              3,
              19
            ],
            "kind": "GenericType"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:2321 TEST_CASE_FIXTURE(Fixture, "function_exprs_are_generalized_at_signature_scope_not_enclosing")
  {
    "name": "function_exprs_are_generalized_at_signature_scope_not_enclosing",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local foo
        local bar

        -- foo being a function expression is deliberate: the bug we're testing
        -- only existed for function expressions, not for function statements.
        foo = function(a)
            return bar
        end
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "foo",
            "equals": "((unknown) -> nil)?"
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:2344 TEST_CASE_FIXTURE(BuiltinsFixture, "param_1_and_2_both_takes_the_same_generic_but_their_arguments_are_incompatible")
  // PENDING PRINT AUDIT: diagnostic0.givenType is printed with exhaustive=true upstream; fields currently compares its default printed form.
  {
    "name": "param_1_and_2_both_takes_the_same_generic_but_their_arguments_are_incompatible",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        local function foo<a>(x: a, y: a?)
            return x
        end
        local vec2 = { x = 5, y = 7 }
        local ret: number = foo(vec2, { x = 5 })
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "code": "TypeMismatch"
          },
          {
            "error": 0,
            "fields": {
              "wantedType": "number"
            }
          },
          {
            "error": 0,
            "fields": {
              "givenType": "{ x: number } | { x: number, y: number }"
            }
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:2410 TEST_CASE_FIXTURE(BuiltinsFixture, "param_1_and_2_both_takes_the_same_generic_but_their_arguments_are_incompatible_2")
  {
    "name": "param_1_and_2_both_takes_the_same_generic_but_their_arguments_are_incompatible_2",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        local function f<a>(x: a, y: a): a
            return if math.random() > 0.5 then x else y
        end

        local z: boolean = f(5, "five")
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "code": "TypeMismatch"
          },
          {
            "error": 0,
            "fields": {
              "wantedType": "boolean"
            }
          },
          {
            "error": 0,
            "fields": {
              "givenType": "number | string"
            }
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:2438 TEST_CASE_FIXTURE(Fixture, "attempt_to_call_an_intersection_of_tables")
  {
    "name": "attempt_to_call_an_intersection_of_tables",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local function f(t: { x: number } & { y: string })
            t()
        end
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "message": "Cannot call a value of type { x: number } & { y: string }"
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:2454 TEST_CASE_FIXTURE(BuiltinsFixture, "attempt_to_call_an_intersection_of_tables_with_call_metamethod")
  {
    "name": "attempt_to_call_an_intersection_of_tables_with_call_metamethod",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        type Callable = typeof(setmetatable({}, {
            __call = function(self, ...) return ... end
        }))

        local function f(t: Callable & { x: number })
            t()
        end
    `,
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:2469 TEST_CASE_FIXTURE(BuiltinsFixture, "call_metamethod_checks_argument_types")
  {
    "name": "call_metamethod_checks_argument_types",
    "fixture": "BuiltinsFixture",
    "flags": {
      "LuauFixCallMetamethodErrorReporting": true
    },
    "checks": [
      {
        "source": `
        type Callable = typeof(setmetatable({}, {} :: { __call: (Callable, number) -> string }))
        local f = (nil :: any) :: Callable

        local ok: string = f(1)
        local bad: string = f("wrong")
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "code": "TypeMismatch"
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:2485 TEST_CASE_FIXTURE(BuiltinsFixture, "call_metamethod_checks_variadic_argument_types")
  {
    "name": "call_metamethod_checks_variadic_argument_types",
    "fixture": "BuiltinsFixture",
    "flags": {
      "LuauFixCallMetamethodErrorReporting": true
    },
    "checks": [
      {
        "source": `
        type Callable = typeof(setmetatable({}, {} :: { __call: (Callable, ...number) -> () }))
        local f = (nil :: any) :: Callable

        f(1, 2, 3)
        f(1, "wrong")
    `,
        "expect": [
          {
            "errors": 1
          }
        ],
        "unparsed": {
          "defect": 876
        }
      }
    ]
  },
  // TypeInfer.functions.test.cpp:2502 TEST_CASE_FIXTURE(BuiltinsFixture, "call_metamethod_variadic_blames_the_offending_argument")
  {
    "name": "call_metamethod_variadic_blames_the_offending_argument",
    "fixture": "BuiltinsFixture",
    "flags": {
      "LuauFixCallMetamethodErrorReporting": true
    },
    "checks": [
      {
        "source": `
        type Callable = typeof(setmetatable({}, {} :: { __call: (Callable, ...number) -> () }))
        local f = (nil :: any) :: Callable

        f(1, "wrong", 3)
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "code": "TypeMismatch"
          },
          {
            "error": 0,
            "location": [
              4,
              13,
              4,
              20
            ]
          }
        ],
        "unparsed": {
          "defect": 876
        }
      }
    ]
  },
  // TypeInfer.functions.test.cpp:2520 TEST_CASE_FIXTURE(BuiltinsFixture, "call_metamethod_variadic_blames_each_offending_argument")
  {
    "name": "call_metamethod_variadic_blames_each_offending_argument",
    "fixture": "BuiltinsFixture",
    "flags": {
      "LuauFixCallMetamethodErrorReporting": true
    },
    "checks": [
      {
        "source": `
        type Callable = typeof(setmetatable({}, {} :: { __call: (Callable, ...number) -> () }))
        local f = (nil :: any) :: Callable

        f("a", 2, "b")
    `,
        "expect": [
          {
            "errors": 2
          },
          {
            "error": 0,
            "code": "TypeMismatch"
          },
          {
            "error": 0,
            "location": [
              4,
              10,
              4,
              13
            ]
          },
          {
            "error": 1,
            "code": "TypeMismatch"
          },
          {
            "error": 1,
            "location": [
              4,
              18,
              4,
              21
            ]
          }
        ],
        "unparsed": {
          "defect": 876
        }
      }
    ]
  },
  // TypeInfer.functions.test.cpp:2552 TEST_CASE_FIXTURE(Fixture, "generic_packs_are_not_variadic")
  {
    "name": "generic_packs_are_not_variadic",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local function apply<a, b..., c...>(f: (a, b...) -> c..., x: a)
            return f(x)
        end

        local function add(x: number, y: number)
            return x + y
        end

        local function addToSix(x: number)
            return x + 6
        end

        apply(addToSix, 7)
        apply(add, 5)
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "location": [
              2,
              21,
              2,
              22
            ]
          },
          {
            "error": 0,
            "fields": {
              "givenTp": "a"
            }
          },
          {
            "error": 0,
            "fields": {
              "wantedTp": "b..."
            }
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:2583 TEST_CASE_FIXTURE(BuiltinsFixture, "num_is_solved_before_num_or_str")
  {
    "name": "num_is_solved_before_num_or_str",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        function num()
            return 5
        end

        local function num_or_str()
            if math.random() > 0.5 then
                return num()
            else
                return "some string"
            end
        end
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "message": "Expected this to be 'number', but got 'string'"
          },
          {
            "type": "num_or_str",
            "equals": "() -> number"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:2607 TEST_CASE_FIXTURE(BuiltinsFixture, "num_is_solved_after_num_or_str")
  {
    "name": "num_is_solved_after_num_or_str",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        local function num_or_str()
            if math.random() > 0.5 then
                return num()
            else
                return "some string"
            end
        end

        function num()
            return 5
        end
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "message": "Expected this to be 'number', but got 'string'"
          },
          {
            "type": "num_or_str",
            "equals": "() -> number"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:2631 TEST_CASE_FIXTURE(BuiltinsFixture, "apply_of_lambda_with_inferred_and_explicit_types")
  {
    "name": "apply_of_lambda_with_inferred_and_explicit_types",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        local function apply(f, x) return f(x) end
        local x = apply(function(x: string): number return 5 end, "hello!")

        local function apply_explicit<A, B...>(f: (A) -> B..., x: A): B... return f(x) end
        local x = apply_explicit(function(x: string): number return 5 end, "hello!")
    `,
        "expect": [
          {
            "errors": 0
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:2646 TEST_CASE_FIXTURE(BuiltinsFixture, "regex_benchmark_string_format_minimization")
  {
    "name": "regex_benchmark_string_format_minimization",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        (nil :: any)(function(n)
            if tonumber(n) then
                n = tonumber(n)
            elseif n ~= nil then
                string.format("invalid argument #4 to 'sub': number expected, got %s", typeof(n))
            end
        end);
    `,
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:2661 TEST_CASE_FIXTURE(BuiltinsFixture, "subgeneric_type_function_super_monomorphic")
  {
    "name": "subgeneric_type_function_super_monomorphic",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
local a: (number, number) -> number = function(a, b) return a - b end

a = function(a, b) return a + b end
`,
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:2672 TEST_CASE_FIXTURE(BuiltinsFixture, "simple_unannotated_mutual_recursion")
  {
    "name": "simple_unannotated_mutual_recursion",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
function even(n)
    if n == 0 then
        return true
    else
        return odd(n - 1)
    end
end

function odd(n)
    if n == 0 then
        return false
    elseif n == 1 then
        return true
    else
        return even(n - 1)
    end
end
`,
        "expect": []
      }
    ],
    "skip": {
      "newSolver": "Upstream returns before checking on the new solver: CLI-117118 assertions are unstable."
    }
  },
  // TypeInfer.functions.test.cpp:2727 TEST_CASE_FIXTURE(BuiltinsFixture, "simple_lightly_annotated_mutual_recursion")
  {
    "name": "simple_lightly_annotated_mutual_recursion",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
function even(n: number)
    if n == 0 then
        return true
    else
        return odd(n - 1)
    end
end

function odd(n: number)
    if n == 0 then
        return false
    elseif n == 1 then
        return true
    else
        return even(n - 1)
    end
end
`,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "even",
            "equals": "(number) -> boolean"
          },
          {
            "type": "odd",
            "equals": "(number) -> boolean"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:2757 TEST_CASE_FIXTURE(BuiltinsFixture, "tf_suggest_return_type")
  {
    "name": "tf_suggest_return_type",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        function fib(n)
            return n < 2 and 1 or fib(n-1) + fib(n-2)
        end
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "code": "ExplicitFunctionAnnotationRecommended"
          },
          {
            "error": 0,
            "fields": {
              "recommendedReturn": "false | number"
            }
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:2786 TEST_CASE_FIXTURE(BuiltinsFixture, "tf_suggest_arg_type")
  {
    "name": "tf_suggest_arg_type",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        function fib(n, u)
            return (n or u) and (n < u and n + fib(n,u))
        end
    `,
        "expect": []
      }
    ],
    "skip": {
      "disabledUpstream": true
    }
  },
  // TypeInfer.functions.test.cpp:2808 TEST_CASE_FIXTURE(BuiltinsFixture, "tf_suggest_arg_type_2")
  // PENDING SETUP AUDIT: frontend.options.retainFullTypeGraphs=false tests cloned module-interface errors.
  {
    "name": "tf_suggest_arg_type_2",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        local function escape_fslash(pre)
            return (#pre % 2 == 0 and '\\\\' or '') .. pre .. '.'
        end
    `,
        "expect": [
          {
            "anyError": "NotATable"
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:2825 TEST_CASE_FIXTURE(Fixture, "local_function_fwd_decl_doesnt_crash")
  {
    "name": "local_function_fwd_decl_doesnt_crash",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local foo

        local function bar()
            foo()
        end

        function foo()
        end

        bar()
    `,
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:2845 TEST_CASE_FIXTURE(Fixture, "bidirectional_checking_of_callback_property")
  // PENDING ASSERTION AUDIT: CHECK(location.begin.line == 6)
  // PENDING ASSERTION AUDIT: CHECK(location.end.line == 8)
  {
    "name": "bidirectional_checking_of_callback_property",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        function print(x: number) end

        type Point = {x: number, y: number}
        local T : {callback: ((Point) -> ())?} = {}

        T.callback = function(p) -- No error here
            print(p.z)           -- error here.  Point has no property z
        end
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "code": "TypeMismatch"
          },
          {
            "error": 0,
            "fields": {
              "wantedType": "((Point) -> ())?"
            }
          },
          {
            "error": 0,
            "fields": {
              "givenType": "({ read z: number }) -> ()"
            }
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:2882 TEST_CASE_FIXTURE(ExternTypeFixture, "bidirectional_inference_of_class_methods")
  {
    "name": "bidirectional_inference_of_class_methods",
    "fixture": "ExternTypeFixture",
    "checks": [
      {
        "source": `
        local c = ChildClass.New()

        -- Instead of reporting that the lambda is the wrong type, report that we are using its argument improperly.
        c.Touched:Connect(function(other)
            print(other.ThisDoesNotExist)
        end)
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "code": "UnknownProperty"
          },
          {
            "error": 0,
            "fields": {
              "key": "ThisDoesNotExist"
            }
          },
          {
            "error": 0,
            "fields": {
              "table": "BaseClass"
            }
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:2902 TEST_CASE_FIXTURE(Fixture, "pass_table_literal_to_function_expecting_optional_prop")
  {
    "name": "pass_table_literal_to_function_expecting_optional_prop",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        type T = {prop: number?}

        function f(t: T) end

        f({prop=5})
        f({})
    `,
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:2916 TEST_CASE_FIXTURE(Fixture, "function_inference_notes_generic_return")
  {
    "name": "function_inference_notes_generic_return",
    "fixture": "Fixture",
    "flags": {
      "LuauIterativeTypeSearcher": true
    },
    "checks": [
      {
        "source": `
        local function get(model)
            model:Find("leg")
        end

        type T = { read Find: (T, string) -> number }

        type U = { read Find: (U, string) -> boolean }

        local t: T
        local u: U

        get(t)
        get(u)
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "get",
            "equals": "<T...>(t1) -> () where t1 = { read Find: (t1, string) -> (T...) }"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:2944 TEST_CASE_FIXTURE(Fixture, "dont_infer_overloaded_functions")
  {
    "name": "dont_infer_overloaded_functions",
    "fixture": "Fixture",
    "flags": {
      "LuauIterativeTypeSearcher": true
    },
    "checks": [
      {
        "source": `
        function getR6Attachments(model)
            model:FindFirstChild("Right Leg")
            model:FindFirstChild("Left Leg")
            model:FindFirstChild("Torso")
            model:FindFirstChild("Torso")
            model:FindFirstChild("Head")
            model:FindFirstChild("Left Arm")
            model:FindFirstChild("Right Arm")
        end
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "getR6Attachments",
            "equals": "<T...>(t1) -> () where t1 = { read FindFirstChild: (t1, string) -> (T...) }"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:2970 TEST_CASE_FIXTURE(Fixture, "param_y_is_bounded_by_x_of_type_string")
  {
    "name": "param_y_is_bounded_by_x_of_type_string",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local function f(x: string, y)
            x = y
        end
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "f",
            "equals": "(string, string) -> ()"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:2985 TEST_CASE_FIXTURE(BuiltinsFixture, "function_that_could_return_anything_is_compatible_with_function_that_is_expected_to_return_nothing")
  {
    "name": "function_that_could_return_anything_is_compatible_with_function_that_is_expected_to_return_nothing",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        -- We infer foo : (g: (number) -> (...unknown)) -> ()
        function foo(g)
            g(0)
        end

        -- a requires a function that returns no values
        function a(f: ((number) -> ()) -> ())
        end

        -- "Returns an unknown number of values" is close enough to "returns no values."
        a(foo)
    `,
        "expect": [
          {
            "errors": 0
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3006 TEST_CASE_FIXTURE(Fixture, "self_application_does_not_segfault")
  {
    "name": "self_application_does_not_segfault",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        function f(a)
            f(f)
            return f(), a
        end
    `,
        "expect": []
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3018 TEST_CASE_FIXTURE(Fixture, "function_definition_in_a_do_block")
  {
    "name": "function_definition_in_a_do_block",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local f
        do
            function f()
            end
        end
        f()
    `,
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3033 TEST_CASE_FIXTURE(BuiltinsFixture, "function_definition_in_a_do_block_with_global")
  {
    "name": "function_definition_in_a_do_block_with_global",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        function f() print("a") end
        do
            function f()
                print("b")
            end
        end
        f()
    `,
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3049 TEST_CASE_FIXTURE(Fixture, "fuzzer_alias_global_function_doesnt_hit_nil_assert")
  {
    "name": "fuzzer_alias_global_function_doesnt_hit_nil_assert",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
function _()
end
local function l0()
    function _()
    end
end
_ = _
`,
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3063 TEST_CASE_FIXTURE(Fixture, "fuzzer_bug_missing_follow_causes_assertion")
  {
    "name": "fuzzer_bug_missing_follow_causes_assertion",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
local _ = ({_=function()
return _
end,}),true,_[_()]
for l0=_[_[_[\`{function(l0)
end}\`]]],_[_.n6[_[_.n6]]],_[_[_.n6[_[_.n6]]]] do
_ += if _ then ""
end
return _
`,
        "expect": [],
        "malformed": "The if expression has no else branch."
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3077 TEST_CASE_FIXTURE(Fixture, "cannot_call_union_of_functions")
  {
    "name": "cannot_call_union_of_functions",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
         local f: (() -> ()) | (() -> () -> ()) = nil :: any
         f()
     `,
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3097 TEST_CASE_FIXTURE(Fixture, "fuzzer_missing_follow_in_ast_stat_fun")
  {
    "name": "fuzzer_missing_follow_in_ast_stat_fun",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local _ = function<t0...>()
        end ~= _

        while (_) do
            _,_,_,_,_,_,_,_,_,_._,_ = nil
            function _(...):<t0...>()->()
            end
            function _<t0...>(...):any
                _ ..= ...
            end
            _,_,_,_,_,_,_,_,_,_,_ = nil
        end
    `,
        "expect": []
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3115 TEST_CASE_FIXTURE(Fixture, "unifier_should_not_bind_free_types")
  {
    "name": "unifier_should_not_bind_free_types",
    "fixture": "Fixture",
    "flags": {
      "LuauRemovePrimitiveTypeConstraintAndSubtypingUnifier": true,
      "LuauIterativeTypeSearcher": true
    },
    "checks": [
      {
        "source": `
        function foo(player)
            local success,result = player:thing()
            if(success) then
                return "Successfully posted message.";
            elseif(not result) then
                return false;
            else
                return result;
            end
        end
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "code": "TypeMismatch"
          },
          {
            "error": 0,
            "fields": {
              "wantedType": "string"
            }
          },
          {
            "error": 0,
            "fields": {
              "givenType": "boolean"
            }
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3145 TEST_CASE_FIXTURE(Fixture, "captured_local_is_assigned_a_function")
  {
    "name": "captured_local_is_assigned_a_function",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local f

        local function g()
            f()
        end

        function f()
        end
    `,
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3161 TEST_CASE_FIXTURE(BuiltinsFixture, "error_suppression_propagates_through_function_calls")
  {
    "name": "error_suppression_propagates_through_function_calls",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        function first(x: any)
            return pairs(x)(x)
        end
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "first",
            "equals": "(any) -> (any?, any)"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3176 TEST_CASE_FIXTURE(BuiltinsFixture, "fuzzer_normalizer_out_of_resources")
  {
    "name": "fuzzer_normalizer_out_of_resources",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
 Module 'l0':
local _ = true,...,_
if ... then
while _:_(_._G) do
do end
_ = _ and _
_ = 0 and {# _,}
local _ = "CCCCCCCCCCCCCCCCCCCCCCCCCCC"
local l0 = require(module0)
end
local function l0()
end
elseif _ then
l0 = _
end
do end
while _ do
_ = if _ then _ elseif _ then _,if _ then _ else _
_ = _()
do end
do end
if _ then
end
end
_ = _,{}

    `,
        "expect": [],
        "malformed": "Module 'l0': is not a method call and an if expression has no final else branch."
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3210 TEST_CASE_FIXTURE(BuiltinsFixture, "overload_resolution_crash_when_argExprs_is_smaller_than_type_args")
  {
    "name": "overload_resolution_crash_when_argExprs_is_smaller_than_type_args",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
--!strict
local parseError
type Set<T> = {[T]: any}
local function captureDependencies(
	saveToSet: Set<PubTypes.Dependency>,
	callback: (...any) -> any,
	...
)
	local data = table.pack(xpcall(callback, parseError, ...))
    end
`,
        "expect": [],
        "unparsed": {
          "defect": 876
        }
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3226 TEST_CASE_FIXTURE(Fixture, "unpack_depends_on_rhs_pack_to_be_fully_resolved")
  {
    "name": "unpack_depends_on_rhs_pack_to_be_fully_resolved",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
--!strict
local function id(x)
    return x
end
local u,v = id(3), id(id(44))
`,
        "expect": [
          {
            "type": "v",
            "equals": "number"
          },
          {
            "errors": 0
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3242 TEST_CASE_FIXTURE(Fixture, "hidden_variadics_should_not_break_subtyping")
  {
    "name": "hidden_variadics_should_not_break_subtyping",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        --!strict
        type FooType = {
            SetValue: (Value: number) -> ()
        }

        local Foo: FooType = {
            SetValue = function(Value: number)

            end
        }
    `,
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3260 TEST_CASE_FIXTURE(BuiltinsFixture, "coroutine_wrap_result_call")
  {
    "name": "coroutine_wrap_result_call",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        function foo(a, b)
            coroutine.wrap(a)(b)
        end
    `,
        "expect": []
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3271 TEST_CASE_FIXTURE(Fixture, "recursive_function_calls_should_not_use_the_generalized_type")
  {
    "name": "recursive_function_calls_should_not_use_the_generalized_type",
    "fixture": "Fixture",
    "flags": {
      "DebugLuauAssertOnForcedConstraint": true
    },
    "checks": [
      {
        "source": `
        --!strict

        function random()
            return true -- chosen by fair coin toss
        end

        local f
        f = 5
        function f()
            if random() then f() end
        end
    `,
        "expect": [
          {
            "errors": 0
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3297 TEST_CASE_FIXTURE(Fixture, "recursive_function_calls_should_not_use_the_generalized_type_2")
  {
    "name": "recursive_function_calls_should_not_use_the_generalized_type_2",
    "fixture": "Fixture",
    "flags": {
      "DebugLuauAssertOnForcedConstraint": true
    },
    "checks": [
      {
        "source": `
        --!strict

        function random()
            return true -- chosen by fair coin toss
        end

        local function f()
            if random() then f() end
        end
    `,
        "expect": [
          {
            "errors": 0
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3318 TEST_CASE_FIXTURE(Fixture, "fuzz_unwind_mutually_recursive_union_type_func")
  {
    "name": "fuzz_unwind_mutually_recursive_union_type_func",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local _ = ...
        function _()
            _ = _
        end
        _[function(...) repeat until _(_[l100]) _ = _ end] += _
    `,
        "expect": [
          {
            "errors": "some"
          }
        ],
        "unparsed": {
          "defect": 1373
        }
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3337 TEST_CASE_FIXTURE(BuiltinsFixture, "string_format_pack")
  {
    "name": "string_format_pack",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        local function foo(): (string, string, string)
            return "", "", ""
        end
        print(string.format("%s %s %s", foo()))
    `,
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3347 TEST_CASE_FIXTURE(BuiltinsFixture, "string_format_pack_variadic")
  {
    "name": "string_format_pack_variadic",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        local foo : () -> (...string) = (nil :: any)
        print(string.format("%s %s %s", foo()))
    `,
        "expect": [
          {
            "errors": 0
          }
        ],
        "unparsed": {
          "defect": 876
        }
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3355 TEST_CASE_FIXTURE(Fixture, "table_annotated_explicit_self")
  {
    "name": "table_annotated_explicit_self",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        type MyObject = {
            fn: (self: MyObject) -> number,
            field: number
        }

        local Foo = {} :: MyObject

        function Foo:fn()
            local _ = self
        end
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "anyError": "FunctionExitsWithoutReturning"
          },
          {
            "typeAt": [
              9,
              24
            ],
            "equals": "MyObject"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3380 TEST_CASE_FIXTURE(Fixture, "oss_1871")
  {
    "name": "oss_1871",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        export type Test = {
            [string]: (string) -> ()
        }

        local TestTbl: Test = {}

        function TestTbl.Hello(Param)
            local _ = Param
        end
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "typeAt": [
              8,
              25
            ],
            "equals": "string"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3401 TEST_CASE_FIXTURE(BuiltinsFixture, "io_manager_oop_ish")
  {
    "name": "io_manager_oop_ish",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        type IIOManager = {
            __index: IIOManager,
            write: (self: IOManager, text: string, label: string?) -> number,
        }

        export type IOManager = setmetatable<{
            buffer: {string},
            memory: { [string]: number }
        }, IIOManager>;

        local IO = {} :: IIOManager
        IO.__index = IO

        function IO:write(text, label)
            local _ = self
            local _ = text
            local _ = label
            return 42
        end

        return IO
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "typeAt": [
              15,
              25
            ],
            "equals": "IOManager"
          },
          {
            "typeAt": [
              16,
              25
            ],
            "equals": "string"
          },
          {
            "typeAt": [
              17,
              25
            ],
            "equals": "string?"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3435 TEST_CASE_FIXTURE(BuiltinsFixture, "generic_function_statement")
  {
    "name": "generic_function_statement",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        type Object = {
            foobar: <T>(number, string, T) -> T
        }

        local Obj = {} :: Object
        function Obj.foobar(bing, quxx, dunno)
            local _ = bing
            local _ = quxx
            return dunno
        end
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "typeAt": [
              7,
              24
            ],
            "equals": "number"
          },
          {
            "typeAt": [
              8,
              24
            ],
            "equals": "string"
          },
          {
            "typeAt": [
              9,
              21
            ],
            "equals": "T"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3461 TEST_CASE_FIXTURE(BuiltinsFixture, "function_calls_should_not_crash")
  // Upstream checks only that the checker does not crash. The official parser rejects statements after return; Sparkdown currently accepts this (#1298).
  {
    "name": "function_calls_should_not_crash",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        return {
            StartAPI = function()
                local pointers = {}
                local API = {}
                local function getRealEnvResult(PointerOrPath)
                    if pointers[PointerOrPath] then
                        return pointers[PointerOrPath]
                    end
                end
                API.OnInvoke = function()
                    local realEnvResult, isResultPointer = getRealEnvResult(FunctionInEnvToRunPath)
                    return realEnvResult(table.unpack(args, 2, args.n))
                    if TableInEnvPath and type(TableInEnvPath) == 'string' then
                        local realEnvResult, isResultPointer = getRealEnvResult(TableInEnvPath)
                        return getmetatable(realEnvResult)
                    end
                    local realEnvResult, isResultPointer = getRealEnvResult(TableInEnvPath)
                    local metaTableInEnv = getmetatable(realEnvResult)
                    local result = metaTableInEnv[FuncToRun](realEnvResult,table.unpack(args, 3, args.n))
                end
            end
        }
    `,
        "expect": []
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3496 TEST_CASE_FIXTURE(BuiltinsFixture, "unnecessary_nil_in_lower_bound_of_generic")
  {
    "name": "unnecessary_nil_in_lower_bound_of_generic",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        function isAnArray(value)
            if type(value) == "table" then
                for index, _ in next, value do
                    -- assert index is not nil
                    math.max(0, index)
                end
                return true
            else
                return false
            end
        end
`,
        "expect": [
          {
            "errors": 0
          }
        ],
        "mode": "nonstrict"
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3518 TEST_CASE_FIXTURE(Fixture, "call_function_with_nothing_but_nil")
  {
    "name": "call_function_with_nothing_but_nil",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local function f(n: number, x: string?, y: string?, z: string?) end

        local function g(n)
            f(n)
        end
    `,
        "expect": [
          {
            "errors": 0
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3531 TEST_CASE_FIXTURE(BuiltinsFixture, "oss_1640")
  {
    "name": "oss_1640",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        --!strict
        table.create(1) -- top function call

        local function f(): string
            if true then
                table.create(1) -- middle function call
            end

            return table.concat({})
        end
    `,
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3547 TEST_CASE_FIXTURE(BuiltinsFixture, "oss_1854")
  {
    "name": "oss_1854",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        --!strict
        local function bug()
            local counter = 1
            local work = buffer.create(64)
            local function get_block()
                buffer.writeu32(work, 48, counter)
                counter = (counter + 1) % 0x100000000
                return work
            end
        end
    `,
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3563 TEST_CASE_FIXTURE(Fixture, "cli_119545_pass_lambda_inside_table")
  {
    "name": "cli_119545_pass_lambda_inside_table",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        --!strict
        type foo1 = { foo: (number) -> () }
        type foo2 = { read foo: (number) -> () }
        local function bar1(foo: foo1) end
        local function bar2(foo: foo2) end

        local baz = { foo = function(number: number) end, }
        bar1(baz)
        bar2(baz)
    `,
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3580 TEST_CASE_FIXTURE(Fixture, "oss_2065_bidirectional_inference_function_call")
  {
    "name": "oss_2065_bidirectional_inference_function_call",
    "fixture": "Fixture",
    "flags": {
      "DebugLuauAssertOnForcedConstraint": true
    },
    "checks": [
      {
        "source": `
        local function foo(callback: () -> (() -> ())?)
        end

        local someCondition: boolean = true

        foo(function()
            if someCondition then
                return nil
            end
            return function() end
        end)
    `,
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3602 TEST_CASE_FIXTURE(Fixture, "bidirectionally_infer_lambda_with_partially_resolved_generic")
  {
    "name": "bidirectionally_infer_lambda_with_partially_resolved_generic",
    "fixture": "Fixture",
    "flags": {
      "DebugLuauAssertOnForcedConstraint": true
    },
    "checks": [
      {
        "source": `
        local function foo<T>(value: T)
            return function<R>(callback: (T) -> R)
            end
        end

        foo(3)(function (data)
            local _ = data
            return 42
        end)
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "typeAt": [
              7,
              23
            ],
            "equals": "number"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3626 TEST_CASE_FIXTURE(Fixture, "bidirectional_inference_goes_through_ifelse")
  {
    "name": "bidirectional_inference_goes_through_ifelse",
    "fixture": "Fixture",
    "flags": {
      "DebugLuauAssertOnForcedConstraint": true
    },
    "checks": [
      {
        "source": `
        type Input = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
        local function getInputs(isDragonPunch: boolean): { Input }
            return if isDragonPunch then { "6", "8", "7" } else { "8", "7", "6" }
        end
    `,
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3641 TEST_CASE_FIXTURE(Fixture, "overload_one_ok_one_potential")
  {
    "name": "overload_one_ok_one_potential",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local f: ((number) -> "one") & ((string) -> "two")

        local g = f(42)
        local h = f("huh")
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "g",
            "equals": "\"one\""
          },
          {
            "type": "h",
            "equals": "\"two\""
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3657 TEST_CASE_FIXTURE(Fixture, "overload_selection_ambiguous_call")
  {
    "name": "overload_selection_ambiguous_call",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local f: ((number | string) -> "one") & ((number | boolean) -> "two")
        local g = f(42)
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "code": "AmbiguousFunctionCall"
          },
          {
            "error": 0,
            "fields": {
              "arguments": "number"
            }
          },
          {
            "error": 0,
            "fields": {
              "function": "((boolean | number) -> \"two\") & ((number | string) -> \"one\")"
            }
          },
          {
            "type": "g",
            "equals": "*error-type*"
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3675 TEST_CASE_FIXTURE(Fixture, "overload_selection_pick_better_arity")
  {
    "name": "overload_selection_pick_better_arity",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local f: ((number) -> "one") & ((number, number) -> "two")
        -- Casting here so that we always hit the case in overload selection
        -- where one part has the correct arity but incorrect argument types,
        -- and the other has the incorrect arity.
        local g = f("s" :: string)
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "code": "TypeMismatch"
          },
          {
            "error": 0,
            "fields": {
              "wantedType": "number"
            }
          },
          {
            "error": 0,
            "fields": {
              "givenType": "string"
            }
          },
          {
            "type": "g",
            "equals": "\"one\""
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3695 TEST_CASE_FIXTURE(Fixture, "overload_selection_no_compatible_option")
  {
    "name": "overload_selection_no_compatible_option",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local f: ((number) -> "one") & ((boolean) -> "two")
        local g = f("s" :: string)
    `,
        "expect": [
          {
            "errors": 2
          },
          {
            "type": "g",
            "equals": "*error-type*"
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3709 TEST_CASE_FIXTURE(Fixture, "overload_selection_bad_arity")
  {
    "name": "overload_selection_bad_arity",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local function foo<T>(f: ((number, number) -> "one") & T)
            local huh = f(42)
            local _ = huh
        end
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "typeAt": [
              3,
              23
            ],
            "equals": "*error-type*"
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3732 TEST_CASE_FIXTURE(Fixture, "overload_selection_union_of_functions")
  {
    "name": "overload_selection_union_of_functions",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local function foo(f: (() -> (number)) | (() -> (string)))
            return f()
        end

        local g = foo(nil :: any)
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "g",
            "equals": "number"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3757 TEST_CASE_FIXTURE(Fixture, "overload_selection_needs_to_retry")
  {
    "name": "overload_selection_needs_to_retry",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        type RGB = { r: number, b: number, g: number }
        local BrickColor: ((number) -> RGB) & ((number, number, number) -> RGB) & ((string) -> RGB)
        function Lightning(li, Color)
            li.BrickColor = BrickColor(Color)
        end
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "Lightning",
            "equals": "({ BrickColor: RGB }, number) -> ()"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3778 TEST_CASE_FIXTURE(Fixture, "overload_selection_unambiguous_with_constraint")
  {
    "name": "overload_selection_unambiguous_with_constraint",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local f: ((string, number) -> string) & ((number, boolean) -> number)
        local function g(x)
            -- When selecting an overload at this point, we'll reject the
            -- second overload, and claim that this is the only possible
            -- overload with a constraint of \`x <: string\`.
            f(x, 42)
        end
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "g",
            "equals": "(string) -> ()"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3797 TEST_CASE_FIXTURE(Fixture, "oss_2118")
  {
    "name": "oss_2118",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local foo: <P>(constructor: (P) -> any) -> (P) -> any = (nil :: any)
        local fn = foo(function (value: { test: true })
            return value.test
        end)
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "fn",
            "equals": "({ test: true }) -> any"
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3809 TEST_CASE_FIXTURE(BuiltinsFixture, "oss_2125")
  {
    "name": "oss_2125",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        export type function CombineTableAndSetIndexer(a: type, b: type, c: type)
            local t = {}

            for key, value in a:properties() do
                t[key] = value.read
            end

            if b.tag == "table" then
                for key, value in b:properties() do
                    t[key] = value.read
                end
            end

            return types.newtable(t :: any, { index = types.number, readresult = c, writeresult = c })
        end

        type SpecialProperties = {
            test: string?,
        }

        local function component<Properties>(
            constructor: (props: Properties) -> ()
        ): (
            CombineTableAndSetIndexer<SpecialProperties, Properties, any>
        ) -> ()
            return function(props: Properties) end
        end

        local mrrp = component(function(thing: {
            meow: number,
        }) end)

        mrrp({
            meow = 5,
        })
    `,
        "expect": [
          {
            "errors": 0
          }
        ],
        "unparsed": {
          "defect": 984
        }
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3852 TEST_CASE_FIXTURE(Fixture, "function_argument_error_suppression")
  {
    "name": "function_argument_error_suppression",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local functions: {[any]: (any) -> ()} = {}
        functions.func1 = function(value: string) end
        functions.func2 = function(value: boolean) end
        functions.func3 = function(value: number) end
        functions.func4 = function(value: any) end
    `,
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3869 TEST_CASE_FIXTURE(BuiltinsFixture, "bidirectional_lambda_inference_applies_nilable_functions")
  {
    "name": "bidirectional_lambda_inference_applies_nilable_functions",
    "fixture": "BuiltinsFixture",
    "flags": {
      "DebugLuauAssertOnForcedConstraint": true
    },
    "checks": [
      {
        "source": `
        local listdir: (string, ((string) -> boolean)?) -> { string } = nil :: any
        listdir("my_directory", function (path)
            print(path)
            return true
        end)
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "typeAt": [
              3,
              19
            ],
            "equals": "string"
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3887 TEST_CASE_FIXTURE(Fixture, "function_statement_with_incorrect_function_type")
  {
    "name": "function_statement_with_incorrect_function_type",
    "fixture": "Fixture",
    "flags": {
      "LuauCheckFunctionStatementTypes": true
    },
    "checks": [
      {
        "source": `
        local Library: { isnan: (number) -> number } = {} :: any

        function Library.isnan(s: string): boolean
            return s == "NaN"
        end
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "code": "TypeMismatch"
          },
          {
            "error": 0,
            "fields": {
              "wantedType": "(number) -> number"
            }
          },
          {
            "error": 0,
            "fields": {
              "givenType": "(string) -> boolean"
            }
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3906 TEST_CASE_FIXTURE(Fixture, "bidirectional_inference_allow_internal_generics")
  {
    "name": "bidirectional_inference_allow_internal_generics",
    "fixture": "Fixture",
    "flags": {
      "DebugLuauAssertOnForcedConstraint": true
    },
    "checks": [
      {
        "source": `
        type testsuite = { case: (self: testsuite, <T>(T) -> T) -> () }

        local test1: { suite: (string, (testsuite) -> ()) -> () } = nil :: any

        test1.suite("LuteTestCommand", function(suite)
            suite:case(42)
        end)
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "fields": {
              "wantedType": "<T>(T) -> T"
            }
          },
          {
            "error": 0,
            "fields": {
              "givenType": "number"
            }
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3929 TEST_CASE_FIXTURE(Fixture, "oss_2143")
  {
    "name": "oss_2143",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local function call<A..., R...>(c: (A...) -> R..., ...: A...): R...
            return c(...)
        end

        local function fn(a: number): { number }
            return nil :: any
        end

        local function fn2<T>(b: { T }, x: (T) -> ())
            return b
        end

        local values = call(fn, 2)

        fn2(values, function(x: number)
        end)

        local a = values[1]
    `,
        "expect": [
          {
            "errors": 0
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3957 TEST_CASE_FIXTURE(Fixture, "apply_example_from_oss")
  {
    "name": "apply_example_from_oss",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        type something = { Something: number }
        type example = { Example: number }
        local function test(a: something): example
            return nil :: any
        end
        local function apply<T..., U...>(func: (T...) -> U..., ...: T...): (boolean, U...)
            return nil :: any
        end
        local b, result = apply(test, {
            Something = 1
        })
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "result",
            "equals": "{ Example: number }",
            "options": {
              "exhaustive": true
            }
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:3978 TEST_CASE_FIXTURE(BuiltinsFixture, "oss_2109")
  {
    "name": "oss_2109",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        local function Retry<T..., K...>(
            MaxRetries: number,
            RetryInterval: number,
            Function: (T...) -> (K...),
            ...: T...
        ): K...
            local Results
            local CurrentRetry = 0

            repeat
                Results = {pcall(Function, ...)}

                if not Results[1] then
                    CurrentRetry += 1
                end
            until Results[1] or CurrentRetry == MaxRetries

            return unpack(Results :: any, 2)
        end

        local function Test(a: number, b: number): number
            return a + b
        end

        local a = Retry(5, 1, Test, 5, 10)
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "a",
            "equals": "number"
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4010 TEST_CASE_FIXTURE(BuiltinsFixture, "pcall_example")
  {
    "name": "pcall_example",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        local function makestr(n: number): string
            return tostring(n)
        end

        -- \`s\` now has type \`string\` and not \`unknown\`
        local success, s = pcall(makestr, 42)
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "s",
            "equals": "string"
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4024 TEST_CASE_FIXTURE(ExternTypeFixture, "bidirectional_function_statement_inference_with_extern")
  {
    "name": "bidirectional_function_statement_inference_with_extern",
    "fixture": "ExternTypeFixture",
    "checks": [
      {
        "source": `
        type HasClass = { f: (ClassWithGenericMethod) -> () }
        local t = {} :: HasClass
        function t.f(cls)
            local _ = cls
            local foobar = cls.identity(42)
            local _ = foobar
        end
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "typeAt": [
              4,
              23
            ],
            "equals": "ClassWithGenericMethod"
          },
          {
            "typeAt": [
              6,
              23
            ],
            "equals": "number"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4043 TEST_CASE_FIXTURE(Fixture, "table_containing_factorial_standalone")
  {
    "name": "table_containing_factorial_standalone",
    "fixture": "Fixture",
    "flags": {
      "DebugLuauAssertOnForcedConstraint": true
    },
    "checks": [
      {
        "source": `
        local coolmath = {}
        function coolmath.factorial(n: number)
            if n <= 1 then
                return 1
            end
            return coolmath.factorial(n - 1) * n
        end
    `,
        "expect": [
          {
            "errors": 0
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4060 TEST_CASE_FIXTURE(Fixture, "table_containing_factorial_assign_later")
  {
    "name": "table_containing_factorial_assign_later",
    "fixture": "Fixture",
    "flags": {
      "DebugLuauAssertOnForcedConstraint": true
    },
    "checks": [
      {
        "source": `
        local coolmath = {}
        function coolmath.factorial(n: number)
            if n <= 1 then
                return 1
            end
            return coolmath.factorial(n - 1) * n
        end

        coolmath.factorial = function (s: string) end
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "fields": {
              "wantedType": "(number) -> number"
            }
          },
          {
            "error": 0,
            "fields": {
              "givenType": "(string) -> ()"
            }
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4087 TEST_CASE_FIXTURE(Fixture, "table_containing_factorial_assign_with_correct_typing")
  {
    "name": "table_containing_factorial_assign_with_correct_typing",
    "fixture": "Fixture",
    "flags": {
      "DebugLuauAssertOnForcedConstraint": true
    },
    "checks": [
      {
        "source": `
        local coolmath = {}
        function coolmath.factorial(n: number)
            if n <= 1 then
                return 1
            end
            return coolmath.factorial(n - 1) * n
        end

        coolmath.factorial = function (n: number) return n end
        coolmath.factorial = "not a function"
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "code": "TypeMismatch"
          },
          {
            "error": 0,
            "fields": {
              "wantedType": "(number) -> number"
            }
          },
          {
            "error": 0,
            "fields": {
              "givenType": "string"
            }
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4117 TEST_CASE_FIXTURE(BuiltinsFixture, "recursive_static_method_must_refer_to_the_ungeneralized_type")
  {
    "name": "recursive_static_method_must_refer_to_the_ungeneralized_type",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        local lexer = {}
        local subContent: string = ""
        function lexer.scan(s: string)
            for innerToken, innerContent in lexer.scan(subContent) do
                table.insert(innerToken, innerContent)
            end
            return {}, nil, nil
        end
    `,
        "expect": [
          {
            "errors": 0
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4135 TEST_CASE_FIXTURE(BuiltinsFixture, "oss_2216_recursive_global_function_works_as_expected")
  {
    "name": "oss_2216_recursive_global_function_works_as_expected",
    "fixture": "BuiltinsFixture",
    "flags": {
      "DebugLuauAssertOnForcedConstraint": true
    },
    "checks": [
      {
        "source": `
        type tb_any = {[any]:any}
        function flatten(... : tb_any) : tb_any
            local out = {}
            local par = {...}
            for i = 1,#par do
                if par[i] and typeof(par[i]) == "table" then
                    for n,v in par[i] do
                        if typeof(n) == "number" then
                            for m,u in flatten(v) do
                                out[m] = u -- type error
                            end
                        else
                            out[n] = v
                        end
                    end
                end
            end
            return out
        end
    `,
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4165 TEST_CASE_FIXTURE(BuiltinsFixture, "cli_187542_recursive_call_in_loop")
  {
    "name": "cli_187542_recursive_call_in_loop",
    "fixture": "BuiltinsFixture",
    "flags": {
      "DebugLuauAssertOnForcedConstraint": true,
      "LuauRemovePrimitiveTypeConstraintAndSubtypingUnifier": true
    },
    "checks": [
      {
        "source": `
        function a(b)
            if true then return b end
            while false do
                b = a(b)
            end

            if true then return b end
        end
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "noError": "ConstraintSolvingIncompleteError"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4193 TEST_CASE_FIXTURE(Fixture, "global_function_redefinition")
  {
    "name": "global_function_redefinition",
    "fixture": "Fixture",
    "flags": {
      "DebugLuauAssertOnForcedConstraint": true
    },
    "checks": [
      {
        "source": `
        function fact(n: number)
            return if n < 1 then 1 else n * fact(n - 1)
        end

        fact = "huh"
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "fields": {
              "wantedType": "(number) -> number"
            }
          },
          {
            "error": 0,
            "fields": {
              "givenType": "string"
            }
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4213 TEST_CASE_FIXTURE(Fixture, "oss_2061_modify_visited_generic_ice")
  {
    "name": "oss_2061_modify_visited_generic_ice",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
type actions<T=unknown, A...=...unknown> = { [string]: (state: T, A...) -> (T) }
type disconnect = () -> ()

type producer<state, actions = actions> = {
	get:
		& (() -> state)
		& (<T>(selector: (state) -> T) -> T),
} & actions

type interface = {
	create: <state>(default: state) -> <actions>(actions: actions) -> producer<state, actions>,
}

local a: interface
a.create()
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "code": "CountMismatch"
          }
        ],
        "unparsed": {
          "defect": 876
        }
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4239 TEST_CASE_FIXTURE(Fixture, "unify_type_pack_stack_overflow")
  {
    "name": "unify_type_pack_stack_overflow",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local function a(): ...string
            return "hello", "world"
        end

        local function g<T...>()
            local function f(... : T...)
            end
            f("what", "is", "going", a())
        end
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "code": "TypePackMismatch"
          },
          {
            "error": 0,
            "fields": {
              "wantedTp": "T..."
            }
          },
          {
            "error": 0,
            "fields": {
              "givenTp": "string, string, string, ...string"
            }
          }
        ],
        "unparsed": {
          "defect": 876
        }
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4264 TEST_CASE_FIXTURE(Fixture, "global_function_blocked")
  {
    "name": "global_function_blocked",
    "fixture": "Fixture",
    "flags": {
      "DebugLuauAssertOnForcedConstraint": true
    },
    "checks": [
      {
        "source": `
        --!strict
        local addInstanceToState: any = nil
        local inst: any = nil

        function ingestAllInstances(...): ()
            local id: number = addInstanceToState()
            local child: any = nil
            ingestAllInstances(child)
        end

        function handleDmQuery()
            ingestAllInstances()
        end

        return {}

    `,
        "expect": [
          {
            "errors": 0
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4294 TEST_CASE_FIXTURE(Fixture, "generic_polarity_of_annotated_code")
  // PENDING ASSERTION AUDIT: LUAU_ASSERT(gen && gen->polarity == Polarity::Mixed)
  {
    "name": "generic_polarity_of_annotated_code",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local f: <T>(T) -> T = nil :: any
    `,
        "expect": [
          {
            "type": "f",
            "kind": "FunctionType"
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4309 TEST_CASE_FIXTURE(BuiltinsFixture, "lute_tasklib_createtask")
  {
    "name": "lute_tasklib_createtask",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        local function createtask(f, ...)
            local data = {}

            data.co = coroutine.create(function(...)
                local success, result = pcall(f, ...)

                data.success = success
                data.result = result
            end)

            coroutine.resume(data.co, ...)
            return data
        end
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "createtask",
            "equals": "((...any) -> (unknown, ...unknown), ...any) -> { co: thread, result: unknown, success: boolean }"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4336 TEST_CASE_FIXTURE(Fixture, "global_emplacing_steals_type_from_elsewhere")
  {
    "name": "global_emplacing_steals_type_from_elsewhere",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local function f()
            return 42
        end
        local a = f()
        b = a
        local c = b
        function b()
        end
    `,
        "expect": [
          {
            "type": "a",
            "equals": "number"
          },
          {
            "type": "b",
            "equals": "() -> ()"
          },
          {
            "type": "c",
            "equals": "number"
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4358 TEST_CASE_FIXTURE(BuiltinsFixture, "are_we_in_the_new_solver")
  {
    "name": "are_we_in_the_new_solver",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        -- This file should fail the old solver
        function add(a, b)
            return a + b
        end
        local vec2 = {}
        function vec2.new(x, y)
            return setmetatable({ x = x or 0, y = y or 0 }, {
                __add = function(v1, v2)
                    return { x = v1.x + v2.x, y = v1.y + v2.y }
                end,
            })
        end
        local a = add(1, 1)
        local b = add(vec2.new(0, 0), vec2.new(1, 1))
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "a",
            "equals": "number"
          },
          {
            "type": "b",
            "equals": "{ x: number, y: number }"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4386 TEST_CASE_FIXTURE(BuiltinsFixture, "dont_leak_generics_keyof")
  {
    "name": "dont_leak_generics_keyof",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        local function makeOtherThing(template)
            return {
                Stuff = template
            }
        end

        local function makeThing(tbl)
            local returnThis = { Input = makeOtherThing(tbl) }

            function returnThis.Test(key: keyof<typeof(returnThis.Input.Stuff)>) end

            return returnThis
        end

        local thing = makeThing({a=1})
        thing.Test("a")

        local otherthing = makeThing({b = 42, c = 13})
        otherthing.Test("b")
        otherthing.Test("c")
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "thing",
            "equals": "{ Input: { Stuff: { a: number } }, Test: (\"a\") -> () }"
          },
          {
            "type": "otherthing",
            "equals": "{ Input: { Stuff: { b: number, c: number } }, Test: (\"b\" | \"c\") -> () }"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4419 TEST_CASE_FIXTURE(Fixture, "bidi_inference_functions_complete_ex")
  {
    "name": "bidi_inference_functions_complete_ex",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        --!strict
        type Player = {}

        export type RemoteEventWrapper<T...> = {
            connect:( self: RemoteEventWrapper<T...>, callback: ((T...) -> ()) | ((player: Player, T...) -> ()) ) -> () -> (),
        }

        local function useRemoteEvent<T...>(remoteEventName: string, isUnreliable: boolean?): RemoteEventWrapper<T...>
            return nil :: any
        end

        type Payload = {
            name: string,
            time: number,
            data: { [string]: any },
        }

        local payload = useRemoteEvent<<(Payload)>>("initial-payload")

        -- We expect bidirectional inference to kick in here and ensure that
        -- player and payload have non-unknown types.
        payload:connect(function(player, payload)
            local _ = player
            local _ = payload
        end)

        return useRemoteEvent
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "typeAt": [
              23,
              23
            ],
            "equals": "Player"
          },
          {
            "typeAt": [
              24,
              23
            ],
            "equals": "Payload"
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4459 TEST_CASE_FIXTURE(Fixture, "bidi_inference_union_of_functions_1")
  {
    "name": "bidi_inference_union_of_functions_1",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local function f(_: ((string) -> ()) | ((number, number) -> ()))
        end

        f(function (one, two)
            local _ = one
            local _ = two
        end)
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "typeAt": [
              5,
              23
            ],
            "equals": "number"
          },
          {
            "typeAt": [
              6,
              23
            ],
            "equals": "number"
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4477 TEST_CASE_FIXTURE(Fixture, "bidi_inference_union_of_functions_2")
  {
    "name": "bidi_inference_union_of_functions_2",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local function f(_: ((string) -> ()) | ((number, number) -> ()))
        end

        f(function (one)
            local _ = one
        end)
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "typeAt": [
              5,
              23
            ],
            "equals": "string"
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4493 TEST_CASE_FIXTURE(Fixture, "bidi_inference_union_of_functions_3")
  {
    "name": "bidi_inference_union_of_functions_3",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local function f(_: ((string) -> ()) | ((number) -> ()))
        end

        f(function (one)
            local _ = one
        end)
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "typeAt": [
              5,
              23
            ],
            "equals": "string"
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4511 TEST_CASE_FIXTURE(Fixture, "bidi_inference_union_of_functions_4")
  {
    "name": "bidi_inference_union_of_functions_4",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local function f(_: ((string) -> ())?)
        end

        f(function (one)
            local _ = one
        end)
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "typeAt": [
              5,
              23
            ],
            "equals": "string"
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4528 TEST_CASE_FIXTURE(BuiltinsFixture, "bidi_inference_variadic_inner_lambda")
  {
    "name": "bidi_inference_variadic_inner_lambda",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        local f: ({ (number, ...string) -> () }) -> () = nil :: any
        f(
            {
                function (alpha, beta, gamma)
                    print(alpha, beta, gamma)
                end
            }
        )
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "typeAt": [
              5,
              27
            ],
            "equals": "number"
          },
          {
            "typeAt": [
              5,
              34
            ],
            "equals": "string"
          },
          {
            "typeAt": [
              5,
              40
            ],
            "equals": "string"
          }
        ],
        "unparsed": {
          "defect": 876
        }
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4546 TEST_CASE_FIXTURE(BuiltinsFixture, "bidi_inference_variadic_top_level")
  {
    "name": "bidi_inference_variadic_top_level",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        local Context = {}
        Context.__index = Context
        type ContextData = {}
        type Context = setmetatable<ContextData, typeof(Context)>
        function Context.text(self: Context, text: string): string
            return text
        end
        type Handler = (Context) -> string
        local function post(path: string, first: Handler, ...: Handler)
        end
        post(
            "/validate",
            function(c)
                return c:text("ok")
            end,
            function(c)
                return c:text(\`not ok\`)
            end
        )
    `,
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4573 TEST_CASE_FIXTURE(BuiltinsFixture, "bidirectional_inference_variadic_type_pack_read_only_prop")
  {
    "name": "bidirectional_inference_variadic_type_pack_read_only_prop",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        local foo: { read bar: (...string) -> () } = {
            bar = function (foobar)
                print(foobar)
            end
        }
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "typeAt": [
              3,
              24
            ],
            "equals": "string"
          }
        ],
        "unparsed": {
          "defect": 876
        }
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4588 TEST_CASE_FIXTURE(Fixture, "bidi_inference_union_of_functions_distinguished_by_return_type")
  {
    "name": "bidi_inference_union_of_functions_distinguished_by_return_type",
    "fixture": "Fixture",
    "flags": {
      "LuauBidirectionalInferenceBetterLambdaHandling": true
    },
    "checks": [
      {
        "source": `
        local function useEffect(callback: (() -> ()) | (() -> () -> ()), deps: {any}?): ()
        end

        useEffect(function()
            return function()
            end
        end)
    `,
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4608 TEST_CASE_FIXTURE(BuiltinsFixture, "pass_generic_function_to_pcall")
  {
    "name": "pass_generic_function_to_pcall",
    "fixture": "BuiltinsFixture",
    "flags": {
      "LuauHigherOrderGenericInference": true
    },
    "checks": [
      {
        "source": `
        local function identity<T>(t: T)
            return t
        end

        local ok, result = pcall(identity, 42)
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "result",
            "equals": "number"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4626 TEST_CASE_FIXTURE(Fixture, "call_with_any_arg_and_optional_return_arg")
  {
    "name": "call_with_any_arg_and_optional_return_arg",
    "fixture": "Fixture",
    "flags": {
      "LuauCallErrorReportingRecoversArgumentLocationsForPacks": true
    },
    "checks": [
      {
        "source": `
        --!strict
        local hrp : any = true
        local boo : () -> number? = (nil ::any)
        local bad : (x : number, y : number) -> () = (nil :: any)
        bad(hrp, boo())
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "code": "TypeMismatch"
          },
          {
            "error": 0,
            "fields": {
              "wantedType": "number"
            }
          },
          {
            "error": 0,
            "fields": {
              "givenType": "number?"
            }
          },
          {
            "error": 0,
            "location": [
              5,
              17,
              5,
              22
            ]
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4644 TEST_CASE_FIXTURE(Fixture, "methods_of_exported_tables_require_annotations")
  // PENDING FLAG AUDIT: upstream enables LuauExportValueSyntax; the vendored oracle cannot verify this flag and the runner currently records flags without applying them.
  {
    "name": "methods_of_exported_tables_require_annotations",
    "fixture": "Fixture",
    "flags": {
      "LuauExportValueSyntax": true,
      "DebugLuauWarnOnUnannotatedTopLevelFunctions": true
    },
    "checks": [
      {
        "source": `
        function abs(a: number): number
            return if a < 0 then -a else a
        end

        export local T = {}

        function T.foo(argumentOne)
            return function(y) -- No warning here
                return abs(argumentOne), abs(y)
            end
        end
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "code": "TypeAnnotationRequired"
          },
          {
            "error": 0,
            "location": [
              7,
              17,
              7,
              35
            ]
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4671 TEST_CASE_FIXTURE(Fixture, "indicate_an_inferred_generic")
  // PENDING FLAG AUDIT: upstream enables LuauExportValueSyntax; the vendored oracle cannot verify this flag and the runner currently records flags without applying them.
  {
    "name": "indicate_an_inferred_generic",
    "fixture": "Fixture",
    "flags": {
      "LuauExportValueSyntax": true,
      "DebugLuauWarnOnUnannotatedTopLevelFunctions": true
    },
    "checks": [
      {
        "source": `
        export function id(x)
            return x
        end
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "message": "Type annotation required here.  Consider <T>(x: T) -> T"
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4689 TEST_CASE_FIXTURE(Fixture, "inner_functions_dont_require_annotations")
  // PENDING FLAG AUDIT: upstream enables LuauExportValueSyntax; the vendored oracle cannot verify this flag and the runner currently records flags without applying them.
  {
    "name": "inner_functions_dont_require_annotations",
    "fixture": "Fixture",
    "flags": {
      "LuauExportValueSyntax": true,
      "DebugLuauWarnOnUnannotatedTopLevelFunctions": true
    },
    "checks": [
      {
        "source": `
        function abs(a: number): number
            return if a < 0 then -a else a
        end

        export function foo(argumentOne): (number) -> (number, number)
            return function(y) -- No warning here
                return abs(argumentOne), abs(y)
            end
        end

        function inner() -- no warning here
        end
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "location": [
              5,
              24,
              5,
              70
            ]
          },
          {
            "error": 0,
            "message": "Type annotation required here.  Consider (argumentOne: number) -> (number) -> (number, number)"
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4717 TEST_CASE_FIXTURE(Fixture, "function_return_types_might_require_annotations")
  // PENDING FLAG AUDIT: upstream enables LuauExportValueSyntax; the vendored oracle cannot verify this flag and the runner currently records flags without applying them.
  {
    "name": "function_return_types_might_require_annotations",
    "fixture": "Fixture",
    "flags": {
      "LuauExportValueSyntax": true,
      "DebugLuauWarnOnUnannotatedTopLevelFunctions": true
    },
    "checks": [
      {
        "source": `
        function abs(a: number)
            return if a < 0 then -a else a
        end

        export function foo(argumentOne)
            return function(y) -- No warning here
                return abs(argumentOne), abs(y)
            end
        end

        function take_five()
            return 5
        end
    `,
        "expect": [
          {
            "errors": 3
          },
          {
            "error": 0,
            "location": [
              1,
              17,
              1,
              31
            ]
          },
          {
            "error": 1,
            "location": [
              5,
              24,
              5,
              40
            ]
          },
          {
            "error": 2,
            "location": [
              11,
              17,
              11,
              28
            ]
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4747 TEST_CASE_FIXTURE(Fixture, "non_exported_functions_might_also_require_annotations")
  // PENDING FLAG AUDIT: upstream enables LuauExportValueSyntax; the vendored oracle cannot verify this flag and the runner currently records flags without applying them.
  {
    "name": "non_exported_functions_might_also_require_annotations",
    "fixture": "Fixture",
    "flags": {
      "LuauExportValueSyntax": true,
      "DebugLuauWarnOnUnannotatedTopLevelFunctions": true
    },
    "checks": [
      {
        "source": `
        function abs(a: number): number
            return if a < 0 then -a else a
        end

        export function foo(argumentOne): (number) -> (number, number)
            return function(y)
                return abs(argumentOne), abs(y)
            end
        end

        function inner(_x)
        end
    `,
        "expect": [
          {
            "errors": 2
          },
          {
            "error": 0,
            "code": "TypeAnnotationRequired"
          },
          {
            "error": 0,
            "location": [
              5,
              24,
              5,
              70
            ]
          },
          {
            "error": 1,
            "code": "TypeAnnotationRequired"
          },
          {
            "error": 1,
            "location": [
              11,
              17,
              11,
              26
            ]
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4778 TEST_CASE_FIXTURE(Fixture, "vararg_needs_annotation")
  // PENDING FLAG AUDIT: upstream enables LuauExportValueSyntax; the vendored oracle cannot verify this flag and the runner currently records flags without applying them.
  {
    "name": "vararg_needs_annotation",
    "fixture": "Fixture",
    "flags": {
      "LuauExportValueSyntax": true,
      "DebugLuauWarnOnUnannotatedTopLevelFunctions": true
    },
    "checks": [
      {
        "source": `
        export function sum(a, ...): number
            if a == nil then
                return 0
            else
                return a + sum(...)
            end
        end

        export function sum2(a: number?, ...: number): number
            if a == nil then
                return 0
            else
                return a + sum(...)
            end
        end
    `,
        "expect": [
          {
            "errors": 2
          },
          {
            "error": 0,
            "code": "UninhabitedTypeFunction"
          },
          {
            "error": 0,
            "location": [
              5,
              23,
              5,
              35
            ]
          },
          {
            "error": 1,
            "code": "TypeAnnotationRequired"
          },
          {
            "error": 1,
            "location": [
              1,
              24,
              1,
              43
            ]
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4812 TEST_CASE_FIXTURE(Fixture, "vararg_specified_but_inferred_empty")
  // PENDING FLAG AUDIT: upstream enables LuauExportValueSyntax; the vendored oracle cannot verify this flag and the runner currently records flags without applying them.
  {
    "name": "vararg_specified_but_inferred_empty",
    "fixture": "Fixture",
    "flags": {
      "LuauExportValueSyntax": true,
      "DebugLuauWarnOnUnannotatedTopLevelFunctions": true
    },
    "checks": [
      {
        "source": `
        local abs: (number) -> number = function(a: number)
            return if a < 0 then -a else a
        end

        export function abs2(a: number, ...)
            return abs(a, ...)
        end
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "code": "TypeAnnotationRequired"
          },
          {
            "error": 0,
            "location": [
              5,
              24,
              5,
              44
            ]
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4835 TEST_CASE_FIXTURE(Fixture, "semantic_subtyping_not_working")
  {
    "name": "semantic_subtyping_not_working",
    "fixture": "Fixture",
    "flags": {
      "LuauRefactorStringSemanticSubtyping": true
    },
    "checks": [
      {
        "source": `
        --!strict
        local function s(x: string | boolean | nil) end
        local function f(a) return a end
        local function g(a) s(f(a)) end
    `,
        "expect": [
          {
            "errors": 0
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4850 TEST_CASE_FIXTURE(BuiltinsFixture, "oss_2623_double_negate_string")
  {
    "name": "oss_2623_double_negate_string",
    "fixture": "BuiltinsFixture",
    "flags": {
      "LuauRefactorStringSemanticSubtyping": true
    },
    "checks": [
      {
        "source": `
        type function negate(ty)
            return types.negationof(ty)
        end

        type Foo = { tag: negate<negate<"str">> }

        local node: Foo = { tag = "str" }
    `,
        "expect": [
          {
            "errors": 0
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4870 TEST_CASE_FIXTURE(Fixture, "oss_2670_generic_leaking_indexer_1")
  {
    "name": "oss_2670_generic_leaking_indexer_1",
    "fixture": "Fixture",
    "flags": {
      "LuauDoNotLeakGenericsInIndexer": true
    },
    "checks": [
      {
        "source": `
        local function setDefault<K, V>(t: { [K]: V? }): V
            return nil :: any
        end

        local t = {hello = "world"}
        setDefault(t, "green", "42")

        local x = t["h"]

    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "t",
            "equals": "{ [unknown]: unknown?, hello: string }",
            "options": {
              "exhaustive": true
            }
          },
          {
            "type": "x",
            "equals": "any",
            "options": {
              "exhaustive": true
            }
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4893 TEST_CASE_FIXTURE(BuiltinsFixture, "oss_2670_generic_leaking_indexer_2")
  {
    "name": "oss_2670_generic_leaking_indexer_2",
    "fixture": "BuiltinsFixture",
    "flags": {
      "LuauDoNotLeakGenericsInIndexer": true
    },
    "checks": [
      {
        "source": `
        local set: <K, V>({ [K | number]: V | string }) -> V

        local t = {hello = "world"}
        set(t)

        local k, v = next(t)

    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "k",
            "equals": "number?",
            "options": {
              "exhaustive": true
            }
          },
          {
            "type": "v",
            "equals": "string",
            "options": {
              "exhaustive": true
            }
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4914 TEST_CASE_FIXTURE(Fixture, "bidirectional_inference_callback_in_array")
  {
    "name": "bidirectional_inference_callback_in_array",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        type Callback = (string) -> ()

        local t: { Callback } = {
            function (s)
                s.uper("hello")
            end
        }
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "anyError": "UnknownProperty"
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4931 TEST_CASE_FIXTURE(BuiltinsFixture, "let_generalization_direct")
  {
    "name": "let_generalization_direct",
    "fixture": "BuiltinsFixture",
    "flags": {
      "LuauThreadGeneralizeThroughConstraintGeneration": true
    },
    "checks": [
      {
        "source": `
        local Func = function(x, y)
            return x * y
        end
        local result1 = Func(42, 13)
        local result2 = Func(42, vector.create(1, 2, 3))
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "result1",
            "equals": "number",
            "options": {
              "exhaustive": true
            }
          },
          {
            "type": "result2",
            "equals": "vector",
            "options": {
              "exhaustive": true
            }
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4949 TEST_CASE_FIXTURE(BuiltinsFixture, "let_generalization_direct_one_level")
  {
    "name": "let_generalization_direct_one_level",
    "fixture": "BuiltinsFixture",
    "flags": {
      "LuauThreadGeneralizeThroughConstraintGeneration": true
    },
    "checks": [
      {
        "source": `
        local tbl = {
            Func = function(x, y)
                return x * y
            end
        }
        local result1 = tbl.Func(42, 13)
        local result2 = tbl.Func(42, vector.create(1, 2, 3))
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "result1",
            "equals": "number",
            "options": {
              "exhaustive": true
            }
          },
          {
            "type": "result2",
            "equals": "vector",
            "options": {
              "exhaustive": true
            }
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4969 TEST_CASE_FIXTURE(Fixture, "let_generalization_return_not_generalized")
  {
    "name": "let_generalization_return_not_generalized",
    "fixture": "Fixture",
    "flags": {
      "LuauThreadGeneralizeThroughConstraintGeneration": true
    },
    "checks": [
      {
        "source": `
        local f = function()
            return function(x) return x end
        end
        local g = f()
        local r1 = g(42)
        local r2 = g("hello")
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "r1",
            "equals": "number",
            "options": {
              "exhaustive": true
            }
          },
          {
            "type": "r2",
            "equals": "string",
            "options": {
              "exhaustive": true
            }
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:4987 TEST_CASE_FIXTURE(Fixture, "let_generalization_forin_iterator")
  {
    "name": "let_generalization_forin_iterator",
    "fixture": "Fixture",
    "flags": {
      "LuauThreadGeneralizeThroughConstraintGeneration": true
    },
    "checks": [
      {
        "source": `
        local makeIter = function(arr)
            local i = 0
            return function()
                i = i + 1
                return arr[i]
            end
        end
        local nums = makeIter({1, 2, 3})
        local strs = makeIter({"a", "b", "c"})
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "nums",
            "equals": "(...any) -> number",
            "options": {
              "exhaustive": true
            }
          },
          {
            "type": "strs",
            "equals": "(...any) -> string",
            "options": {
              "exhaustive": true
            }
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:5010 TEST_CASE_FIXTURE(BuiltinsFixture, "let_generalization_assign_statement")
  {
    "name": "let_generalization_assign_statement",
    "fixture": "BuiltinsFixture",
    "flags": {
      "LuauThreadGeneralizeThroughConstraintGeneration": true
    },
    "checks": [
      {
        "source": `
        local Func
        Func = function(x, y)
            return x * y
        end
        local result1 = Func(42, 13)
        local result2 = Func(42, vector.create(1, 2, 3))
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "result1",
            "equals": "number",
            "options": {
              "exhaustive": true
            }
          },
          {
            "type": "result2",
            "equals": "vector",
            "options": {
              "exhaustive": true
            }
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:5029 TEST_CASE_FIXTURE(Fixture, "let_generalization_multiple_values")
  {
    "name": "let_generalization_multiple_values",
    "fixture": "Fixture",
    "flags": {
      "LuauThreadGeneralizeThroughConstraintGeneration": true
    },
    "checks": [
      {
        "source": `
        local a, b = function(x) return x end, function(y) return y end
        local r1 = a(42)
        local r2 = a("hello")
        local r3 = b(3.14)
        local r4 = b("world")
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "r1",
            "equals": "number",
            "options": {
              "exhaustive": true
            }
          },
          {
            "type": "r2",
            "equals": "string",
            "options": {
              "exhaustive": true
            }
          },
          {
            "type": "r3",
            "equals": "number",
            "options": {
              "exhaustive": true
            }
          },
          {
            "type": "r4",
            "equals": "string",
            "options": {
              "exhaustive": true
            }
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:5047 TEST_CASE_FIXTURE(Fixture, "let_generalization_second_layer")
  {
    "name": "let_generalization_second_layer",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        --!strict
        local function id(x)
          return x
        end

        local f = id(function (x)
          return x
        end)

        local g = f(42)
        local h = f("hmmm")
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "g",
            "equals": "number",
            "options": {
              "exhaustive": true
            }
          },
          {
            "type": "h",
            "equals": "string",
            "options": {
              "exhaustive": true
            }
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:5070 TEST_CASE_FIXTURE(BuiltinsFixture, "setmetatable_lambda_generalizes_across_calls")
  {
    "name": "setmetatable_lambda_generalizes_across_calls",
    "fixture": "BuiltinsFixture",
    "flags": {
      "LuauTraverseScopeToFunction": true
    },
    "checks": [
      {
        "source": `
        local a = setmetatable({}, {
            __call = function(self, x) return x end,
        })
        local r1 = a(42)
        local r2 = a("hello")
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "r1",
            "equals": "number",
            "options": {
              "exhaustive": true
            }
          },
          {
            "type": "r2",
            "equals": "string",
            "options": {
              "exhaustive": true
            }
          }
        ]
      }
    ]
  },
  // TypeInfer.functions.test.cpp:5089 TEST_CASE_FIXTURE(Fixture, "weakoptional_reduces_over_generic")
  {
    "name": "weakoptional_reduces_over_generic",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local function id(x)
            return x
        end

        local function f(g)
            local x = id(g())
            local r = if x then x else nil
            return r
        end
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "f",
            "equals": "(() -> (unknown)) -> ~(false?)?",
            "options": {
              "exhaustive": true
            }
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:5115 TEST_CASE_FIXTURE(Fixture, "generalize_type_in_if_body_scope")
  {
    "name": "generalize_type_in_if_body_scope",
    "fixture": "Fixture",
    "flags": {
      "LuauTraverseScopeToFunction": true
    },
    "checks": [
      {
        "source": `
        local function f(cond)
            if cond then
                local g = function(x) return x end
                local r1 = g(42)
                local r2 = g("hello")
            end
        end
    `,
        "expect": [
          {
            "errors": 0
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.functions.test.cpp:5134 TEST_CASE_FIXTURE(Fixture, "extend_typepack_bound_indirection_preserves_references")
  {
    "name": "extend_typepack_bound_indirection_preserves_references",
    "fixture": "Fixture",
    "flags": {
      "LuauRemovePrimitiveTypeConstraintAndSubtypingUnifier": true,
      "LuauTraverseScopeToFunction": true
    },
    "checks": [
      {
        "source": `
        local function f(g)
            local a, b = g()
            local c, d = g()
            local n: number? = g()
        end
    `,
        "expect": [
          {
            "errors": 0
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
]);
