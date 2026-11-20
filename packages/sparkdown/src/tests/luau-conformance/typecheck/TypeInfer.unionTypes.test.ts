// Luau upstream 7d5f73364fdbbaa984fa545071630eba73cfea98, tests/TypeInfer.unionTypes.test.cpp
import { portUpstreamFile } from "./portedCases";

portUpstreamFile("TypeInfer.unionTypes.test.cpp", [
  // TypeInfer.unionTypes.test.cpp:17 fuzzer_union_with_one_part_assertion
{
  "name": "fuzzer_union_with_one_part_assertion",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\nlocal _ = {},nil\nrepeat\n\n_,_ = if _.number == \"\" or _.number or _._ then\n             _\n      elseif _.__index == _._G then\n            tostring\n      elseif _ then\n             _\n      else\n           ``,_._G\n\nuntil _._\n    ",
      "expect": []
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:36 return_types_can_be_disjoint
{
  "name": "return_types_can_be_disjoint",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local count = 0\n        function most_of_the_natural_numbers(): number?\n            if count < 10 then\n                count = count + 1\n                return count\n            else\n                return nil\n            end\n        end\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "most_of_the_natural_numbers",
          "kind": "FunctionType"
        }
      ]
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:56 return_types_can_be_disjoint_using_compound_assignment
{
  "name": "return_types_can_be_disjoint_using_compound_assignment",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local count = 0\n        function most_of_the_natural_numbers(): number?\n            if count < 10 then\n                -- count = count + 1\n                count += 1\n                return count\n            else\n                return nil\n            end\n        end\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "most_of_the_natural_numbers",
          "kind": "FunctionType"
        }
      ]
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:77 allow_specific_assign
{
  "name": "allow_specific_assign",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local a:number|string = 22\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:86 allow_more_specific_assign
{
  "name": "allow_more_specific_assign",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f(a: number | string, b: (number | string)?)\n            b = a\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:97 disallow_less_specific_assign
{
  "name": "disallow_less_specific_assign",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f(a: number, b: number | string)\n            a = b\n        end\n    ",
      "expect": [
        {
          "errors": 1
        }
      ]
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:108 optional_arguments
{
  "name": "optional_arguments",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f(a:string, b:string?)\n        end\n        f(\"s\")\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:119 optional_arguments_table
{
  "name": "optional_arguments_table",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local a:{a:string, b:string?}\n        a = {a=\"ok\"}\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:129 optional_arguments_table2
{
  "name": "optional_arguments_table2",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local a:{a:string, b:string}\n        a = {a=\"\"}\n    ",
      "expect": [
        {
          "errors": "some"
        }
      ]
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:138 error_takes_optional_arguments
{
  "name": "error_takes_optional_arguments",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        error(\"message\")\n        error(\"message\", 2)\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:148 error_optional_argument_enforces_type
{
  "name": "error_optional_argument_enforces_type",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        error(\"message\", \"2\")\n    ",
      "expect": [
        {
          "errors": 1
        }
      ]
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:157 index_on_a_union_type_with_property_guaranteed_to_exist
{
  "name": "index_on_a_union_type_with_property_guaranteed_to_exist",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A = {x: number}\n        type B = {x: number}\n\n        function f(t: A | B)\n            return t.x\n        end\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "f",
          "equals": "(A | B) -> number"
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:174 index_on_a_union_type_with_mixed_types
{
  "name": "index_on_a_union_type_with_mixed_types",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A = {x: number}\n        type B = {x: string}\n\n        function f(t: A | B)\n            return t.x\n        end\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "f",
          "equals": "(A | B) -> number | string"
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:191 index_on_a_union_type_works_at_arbitrary_depth
{
  "name": "index_on_a_union_type_works_at_arbitrary_depth",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A = {x: {y: {z: {thing: number}}}}\n        type B = {x: {y: {z: {thing: string}}}}\n\n        function f(t: A | B)\n            return t.x.y.z.thing\n        end\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "f",
          "equals": "(A | B) -> number | string"
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:208 index_on_a_union_type_with_one_optional_property
{
  "name": "index_on_a_union_type_with_one_optional_property",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A = {x: number}\n        type B = {x: number?}\n\n        function f(t: A | B)\n            return t.x\n        end\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "f",
          "equals": "(A | B) -> number?"
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:225 index_on_a_union_type_with_missing_property
{
  "name": "index_on_a_union_type_with_missing_property",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A = {x: number}\n        type B = {}\n\n        function f(t: A | B)\n            return t.x\n        end\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "code": "MissingUnionProperty"
        },
        {
          "error": 0,
          "message": "Key 'x' is missing from 'B' in the type 'A | B'"
        },
        {
          "type": "f",
          "equals": "(A | B) -> number"
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:250 index_on_a_union_type_with_one_property_of_type_any
{
  "name": "index_on_a_union_type_with_one_property_of_type_any",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A = {x: number}\n        type B = {x: any}\n\n        function f(t: A | B)\n            return t.x\n        end\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "f",
          "equals": "(A | B) -> any"
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:267 union_equality_comparisons
{
  "name": "union_equality_comparisons",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A = number | string | nil\n        type B = number | nil\n        type C = number | boolean\n\n        function f(a: A, b: B, c: C)\n            local n = 1\n\n            local x = a == b\n            local y = a == n\n            local z = a == c\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:286 optional_union_members
{
  "name": "optional_union_members",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local a = { a = { x = 1, y = 2 }, b = 3 }\n        type A = typeof(a)\n        function f(b: A?)\n            return b.a.y\n        end\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Value of type 'A?' could be nil"
        },
        {
          "type": "f",
          "equals": "(A?) -> number"
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:304 optional_union_functions
{
  "name": "optional_union_functions",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local a = {}\n        function a.foo(x:number, y:number) return x + y end\n        type A = typeof(a)\n        function f(b: A?)\n            return b.foo(1, 2)\n        end\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Value of type 'A?' could be nil"
        },
        {
          "type": "f",
          "equals": "(A?) -> number"
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:323 optional_union_methods
{
  "name": "optional_union_methods",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local a = {}\n        function a:foo(x:number, y:number) return x + y end\n        type A = typeof(a)\n        function f(b: A?)\n            return b:foo(1, 2)\n        end\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Value of type 'A?' could be nil"
        },
        {
          "type": "f",
          "equals": "(A?) -> number"
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:342 optional_union_follow
{
  "name": "optional_union_follow",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local y: number? = 2\n        local x = y\n        function f(a: number, b: number?, c: number?) return -a end\n        return f()\n    ",
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
            "expected": 1
          }
        },
        {
          "error": 0,
          "fields": {
            "actual": 0
          }
        },
        {
          "error": 0,
          "fields": {
            "isVariadic": false
          }
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:362 optional_field_access_error
{
  "name": "optional_field_access_error",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A = { x: number }\n        function f(b: A?)\n            local c = b.x\n            local d = b.y\n        end\n    ",
      "expect": [
        {
          "errors": 3
        },
        {
          "error": 0,
          "message": "Value of type 'A?' could be nil"
        },
        {
          "error": 1,
          "message": "Value of type 'A?' could be nil"
        },
        {
          "error": 2,
          "message": "Key 'y' not found in table 'A'"
        }
      ]
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:378 optional_index_error
{
  "name": "optional_index_error",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A = {number}\n        function f(a: A?)\n            local b = a[1]\n        end\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Value of type 'A?' could be nil"
        }
      ]
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:391 optional_call_error
{
  "name": "optional_call_error",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A = (number) -> number\n        function f(a: A?)\n            local b = a(4)\n        end\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Value of type '((number) -> number)?' could be nil"
        }
      ]
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:404 optional_assignment_errors
{
  "name": "optional_assignment_errors",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A = { x: number }\n        function f(a: A?)\n            a.x = 2\n        end\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Value of type 'A?' could be nil"
        }
      ]
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:417 optional_assignment_errors_2
{
  "name": "optional_assignment_errors_2",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A = { x: number } & { y: number }\n        function f(a: A?)\n            a.x = 2\n        end\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Value of type '({ x: number } & { y: number })?' could be nil"
        }
      ]
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:431 optional_length_error
{
  "name": "optional_length_error",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A = {number}\n        function f(a: A?)\n            local b = #a\n        end\n    ",
      "expect": [
        {
          "errors": 2
        },
        {
          "error": 0,
          "message": "Operator '#' could not be applied to operand of type A?; there is no corresponding overload for __len"
        },
        {
          "error": 1,
          "message": "Value of type 'A?' could be nil"
        }
      ]
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:449 optional_missing_key_error_details
{
  "name": "optional_missing_key_error_details",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A = { x: number, y: number }\n        type B = { x: number, y: number }\n        type C = { x: number }\n        type D = { x: number }\n\n        function f(a: A | B | C | D)\n            local y = a.y\n            local z = a.z\n        end\n\n        function g(c: A | B | C | D | nil)\n            local d = c.y\n        end\n    ",
      "expect": [
        {
          "errors": 4
        },
        {
          "error": 0,
          "message": "Key 'y' is missing from 'C', 'D' in the type 'A | B | C | D'"
        },
        {
          "error": 1,
          "message": "Type 'A | B | C | D' does not have key 'z'"
        },
        {
          "error": 2,
          "message": "Value of type '(A | B | C | D)?' could be nil"
        },
        {
          "error": 3,
          "message": "Key 'y' is missing from 'C', 'D' in the type 'A | B | C | D'"
        }
      ]
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:475 optional_iteration
{
  "name": "optional_iteration",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\nfunction foo(values: {number}?)\n    local s = 0\n    for _, value in values do\n        s += value\n    end\nend\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Value of type '{number}?' could be nil"
        }
      ]
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:490 unify_unsealed_table_union_check
{
  "name": "unify_unsealed_table_union_check",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\nlocal x = { x = 3 }\ntype A = number?\ntype B = string?\nlocal y: { x: number, y: A | B }\ny = x\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    },
    {
      "source": "\nlocal x = { x = 3 }\n\nlocal a: number? = 2\nlocal y = {}\ny.x = 2\ny.y = a\n\ny = x\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ],
  "skip": {
    "newSolver": "does not pass on Luau's new solver upstream"
  }
},
  // TypeInfer.unionTypes.test.cpp:518 unify_sealed_table_union_check
{
  "name": "unify_sealed_table_union_check",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n -- the difference between this and unify_unsealed_table_union_check is the type annotation on x\nlocal t = { x = 3, y = true }\nlocal x: { x: number } = t\ntype A = number?\ntype B = string?\nlocal y: { x: number, y: A | B }\n-- Shouldn't typecheck!\ny = x\n-- If it does, we can convert any type to any other type\ny.y = 5\nlocal oh : boolean = t.y\n    ",
      "expect": [
        {
          "errors": "some"
        }
      ]
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:537 error_detailed_union_part
{
  "name": "error_detailed_union_part",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\ntype X = { x: number }\ntype Y = { y: number }\ntype Z = { z: number }\n\ntype XYZ = X | Y | Z\n\nfunction f(a: XYZ)\n    local b: { w: number } = a\nend\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Expected this to be '{ w: number }', but got 'X | Y | Z'; \nthis is because \n\t * `X` is not a subtype of `{ w: number }`\n\t * `Y` is not a subtype of `{ w: number }`\n\t * `Z` is not a subtype of `{ w: number }`"
        }
      ]
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:583 error_detailed_union_all
{
  "name": "error_detailed_union_all",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type X = { x: number }\n        type Y = { y: number }\n        type Z = { z: number }\n\n        type XYZ = X | Y | Z\n\n        local a: XYZ = { w = 4 }\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Expected this to be 'X | Y | Z', but got '{ w: number }'"
        }
      ]
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:602 error_detailed_optional
{
  "name": "error_detailed_optional",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\ntype X = { x: number }\n\nlocal a: X? = { w = 4 }\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Table type '{ w: number }' not compatible with type 'X' because the former is missing field 'x'"
        }
      ]
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:625 dont_allow_cyclic_unions_to_be_inferred
{
  "name": "dont_allow_cyclic_unions_to_be_inferred",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        --!strict\n\n        function f(a, b)\n            a:g(b or {})\n            a:g(b)\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:641 indexing_into_a_cyclic_union_doesnt_crash
{
  "name": "indexing_into_a_cyclic_union_doesnt_crash",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f(x: BadCyclicUnion)\n            return x[0]\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ],
      "ignoreMissingAnnotations": true,
      "setup": {
        "cyclicUnion": {
          "alias": "BadCyclicUnion",
          "indexer": {
            "key": "number",
            "result": "number"
          },
          "tableState": "sealed"
        }
      }
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:683 table_union_write_indirect
{
  "name": "table_union_write_indirect",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        type A = { x: number, y: (number) -> string } | { z: number, y: (number) -> string }\n\n        function f(a: A)\n            function a.y(x)\n                return tostring(x * 2)\n            end\n\n            function a.y(x: string): number\n                return tonumber(x) or 0\n            end\n        end\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Expected this to be\n\t'((number) -> string) | ((number) -> string)'\nbut got\n\t'(string) -> number'; none of the union options are compatible"
        }
      ]
    }
  ],
  "skip": {
    "newSolver": "does not pass on Luau's new solver upstream"
  }
},
  // TypeInfer.unionTypes.test.cpp:712 union_true_and_false
{
  "name": "union_true_and_false",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f(x : boolean)\n            local y1 : (true | false) = x -- OK\n            local y2 : (true | false | (string & number)) = x -- OK\n            local y3 : (true | (string & number) | false) = x -- OK\n            local y4 : (true | (boolean & true) | false) = x -- OK\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:726 union_of_functions
{
  "name": "union_of_functions",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f(x : (number) -> number?)\n            local y : ((number?) -> number?) | ((number) -> number) = x -- OK\n        end\n     ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:737 union_of_generic_functions
{
  "name": "union_of_generic_functions",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f(x : <a>(a) -> a?)\n            local y : (<a>(a?) -> a?) | (<b>(b) -> b) = x -- Not OK\n        end\n     ",
      "expect": [
        {
          "errors": "some"
        }
      ]
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:749 union_of_generic_typepack_functions
{
  "name": "union_of_generic_typepack_functions",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f(x : <a...>(number, a...) -> (number?, a...))\n            local y : (<a...>(number?, a...) -> (number?, a...)) | (<b...>(number, b...) -> (number, b...)) = x -- Not OK\n        end\n     ",
      "expect": [
        {
          "errors": "some"
        }
      ]
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:761 union_of_functions_mentioning_generics
{
  "name": "union_of_functions_mentioning_generics",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f<a,b>()\n            function g(x : (a) -> a?)\n                local y : ((a?) -> nil) | ((a) -> a) = x -- OK\n                local z : ((b?) -> nil) | ((b) -> b) = x -- Not OK\n            end\n        end\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Expected this to be '((b) -> b) | ((b?) -> nil)', but got '(a) -> a?'; none of the union options are compatible"
        }
      ]
    }
  ],
  "skip": {
    "newSolver": "does not pass on Luau's new solver upstream"
  }
},
  // TypeInfer.unionTypes.test.cpp:781 union_of_functions_mentioning_generic_typepacks
{
  "name": "union_of_functions_mentioning_generic_typepacks",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f<a...>()\n            function g(x : (number, a...) -> (number?, a...))\n                local y : ((number | string, a...) -> (number, a...)) | ((number?, a...) -> (nil, a...)) = x -- OK\n                local z : ((number) -> number) | ((number?, a...) -> (number?, a...)) = x -- Not OK\n            end\n        end\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Expected this to be\n\t'((number) -> number) | ((number?, a...) -> (number?, a...))'\nbut got\n\t'(number, a...) -> (number?, a...)'; none of the union options are compatible"
        }
      ]
    }
  ],
  "skip": {
    "newSolver": "does not pass on Luau's new solver upstream"
  }
},
  // TypeInfer.unionTypes.test.cpp:804 union_of_functions_with_mismatching_arg_arities
{
  "name": "union_of_functions_with_mismatching_arg_arities",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f(x : (number) -> number?)\n            local y : ((number?) -> number) | ((number | string) -> nil) = x -- OK\n            local z : ((number, string?) -> number) | ((number) -> nil) = x -- Not OK\n        end\n     ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Expected this to be\n\t'((number) -> nil) | ((number, string?) -> number)'\nbut got\n\t'(number) -> number?'; none of the union options are compatible"
        }
      ]
    }
  ],
  "skip": {
    "newSolver": "does not pass on Luau's new solver upstream"
  }
},
  // TypeInfer.unionTypes.test.cpp:825 union_of_functions_with_mismatching_result_arities
{
  "name": "union_of_functions_with_mismatching_result_arities",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f(x : () -> (number | string))\n            local y : (() -> number) | (() -> string) = x -- OK\n            local z : (() -> number) | (() -> (string, string)) = x -- Not OK\n        end\n     ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Expected this to be\n\t'(() -> (string, string)) | (() -> number)'\nbut got\n\t'() -> number | string'; none of the union options are compatible"
        }
      ]
    }
  ],
  "skip": {
    "newSolver": "does not pass on Luau's new solver upstream"
  }
},
  // TypeInfer.unionTypes.test.cpp:846 union_of_functions_with_variadics
{
  "name": "union_of_functions_with_variadics",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f(x : (...nil) -> (...number?))\n            local y : ((...string?) -> (...number)) | ((...number?) -> nil) = x -- OK\n            local z : ((...string?) -> (...number)) | ((...string?) -> nil) = x -- OK\n        end\n     ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Expected this to be\n\t'((...string?) -> (...number)) | ((...string?) -> nil)'\nbut got\n\t'(...nil) -> (...number?)'; none of the union options are compatible"
        }
      ],
      "unparsed": {
        "defect": 876
      }
    }
  ],
  "skip": {
    "newSolver": "does not pass on Luau's new solver upstream"
  }
},
  // TypeInfer.unionTypes.test.cpp:867 union_of_functions_with_mismatching_arg_variadics
{
  "name": "union_of_functions_with_mismatching_arg_variadics",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f(x : (number) -> ())\n            local y : ((number?) -> ()) | ((...number) -> ()) = x -- OK\n            local z : ((number?) -> ()) | ((...number?) -> ()) = x -- Not OK\n        end\n     ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Expected this to be\n\t'((...number?) -> ()) | ((number?) -> ())'\nbut got\n\t'(number) -> ()'\n"
        }
      ],
      "unparsed": {
        "defect": 876
      }
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:899 union_of_functions_with_mismatching_result_variadics
{
  "name": "union_of_functions_with_mismatching_result_variadics",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f(x : () -> (number?, ...number))\n            local y : (() -> (...number)) | (() -> nil) = x -- OK\n            local z : (() -> (...number)) | (() -> number) = x -- OK\n        end\n     ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Expected this to be\n\t'(() -> (...number)) | (() -> number)'\nbut got\n\t'() -> (number?, ...number)'; none of the union options are compatible"
        }
      ],
      "unparsed": {
        "defect": 876
      }
    }
  ],
  "skip": {
    "newSolver": "does not pass on Luau's new solver upstream"
  }
},
  // TypeInfer.unionTypes.test.cpp:920 less_greedy_unification_with_union_types
{
  "name": "less_greedy_unification_with_union_types",
  "fixture": "Fixture",
  "flags": {
    "LuauIterativeTypeSearcher": true
  },
  "checks": [
    {
      "source": "\n        local function f(t): { x: number } | { x: string }\n            local x = t.x\n            return t\n        end\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "f",
          "equals": "(({ read x: unknown } & { x: number }) | ({ read x: unknown } & { x: string })) -> { x: number } | { x: string }"
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:943 less_greedy_unification_with_union_types_2
{
  "name": "less_greedy_unification_with_union_types_2",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local function f(t: { x: number } | { x: string })\n            return t.x\n        end\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "f",
          "equals": "({ x: number } | { x: string }) -> number | string"
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:961 union_table_any_property
{
  "name": "union_table_any_property",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f(x)\n            -- x : X\n            -- sup : { p : { q : X } }?\n            local sup = if true then { p = { q = x } } else nil\n            local sub : { p : any }\n            sup = nil\n            sup = sub\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:979 union_function_any_args
{
  "name": "union_function_any_args",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f(sup : ((...any) -> (...any))?, sub : ((number) -> (...any)))\n            sup = sub\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ],
      "unparsed": {
        "defect": 876
      }
    }
  ],
  "skip": {
    "newSolver": "does not pass on Luau's new solver upstream"
  }
},
  // TypeInfer.unionTypes.test.cpp:992 optional_any
{
  "name": "optional_any",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f(sup : any?, sub : number)\n            sup = sub\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:1003 generic_function_with_optional_arg
{
  "name": "generic_function_with_optional_arg",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f<T>(x : T?) : {T}\n            local result = {}\n            if x then\n                result[1] = x\n            end\n            return result\n        end\n        local t : {string} = f(nil)\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ],
  "skip": {
    "newSolver": "does not pass on Luau's new solver upstream"
  }
},
  // TypeInfer.unionTypes.test.cpp:1021 lookup_prop_of_intersection_containing_unions
{
  "name": "lookup_prop_of_intersection_containing_unions",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local function mergeOptions<T>(options: T & ({} | {}))\n            return options.variables\n        end\n    ",
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
            "key": "variables"
          }
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:1039 suppress_errors_for_prop_lookup_of_a_union_that_includes_error
{
  "name": "suppress_errors_for_prop_lookup_of_a_union_that_includes_error",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f(a: err | Not<nil>)\n            local b = a.foo\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ],
      "hiddenTypes": true
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:1054 handle_multiple_optionals
{
  "name": "handle_multiple_optionals",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        function f(a: string??)\n            if a then\n                print(a:sub(1,1))\n            end\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:1068 bounds_propagate_into_free_union_bounds
{
  "name": "bounds_propagate_into_free_union_bounds",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        local function unwrap<T>(a: T?): T\n            if a == nil then\n                error(\"Unexpected nil!\")\n            end\n            return a\n        end\n\n        local b = unwrap(42)\n        local c = unwrap(true)\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "b",
          "equals": "number"
        },
        {
          "type": "c",
          "equals": "boolean"
        }
      ]
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:1091 oss_2134
{
  "name": "oss_2134",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local function addIndex <A, B, C> (op: ((value: A) -> B, array: {A}) -> {C})\n            return function <K> (idxOp: (key: K, value: A) -> B, tbl: { [K]: A })\n                return {} :: { [K]: C }\n            end\n        end\n\n        local function filter <A, K> (predicate: (value: A) -> boolean, tbl: {[K]: A })\n            return {} :: { A }\n        end\n\n        local function map <A, B, K> (mapper: (value: A) -> B, tbl: {[K]: A })\n            return {} :: { B }\n        end\n\n        local function filterWithIndex(index: string, value: string): boolean\n            return true :: boolean\n        end\n\n        local function mapWithIndex(index: string, value: string): string\n            return \"\" :: string\n        end\n\n        local myArr = {first = \"hi\", second = \"there\", third = \"what\"}\n\n        local filterTest = addIndex(filter)\n        local filterResult = filterTest(filterWithIndex, myArr)\n\n        local mapTest = addIndex(map)\n        local mapResult = mapTest(mapWithIndex, myArr)\n    ",
      "expect": [
        {
          "errors": 0
        }
      ],
      "ignoreMissingAnnotations": true,
      "unparsed": {
        "defect": 1378
      }
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:1128 oss_2393
{
  "name": "oss_2393",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        --!strict\n\n        type Example<T> = {\n            foo: () -> T,\n            bar: (T?) -> ()\n        }\n\n        local ex = {} :: Example<string>\n\n        local function process<T>(ref: Example<T>)\n            return ref\n        end\n\n        process(ex)\n    ",
      "expect": [
        {
          "errors": 0
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.unionTypes.test.cpp:1150 oss_2025
{
  "name": "oss_2025",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        type a = { property: string }\n\n        local foo: {a} = {}\n        local bar: any = {}\n\n        local baz: a? = bar.test\n\n        table.insert(foo, bar)\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
]);
