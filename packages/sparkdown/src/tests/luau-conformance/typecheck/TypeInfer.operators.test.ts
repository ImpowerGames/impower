// Luau upstream 7d5f73364fdbbaa984fa545071630eba73cfea98, tests/TypeInfer.operators.test.cpp
import { portUpstreamFile } from "./portedCases";

portUpstreamFile("TypeInfer.operators.test.cpp", [
  // TypeInfer.operators.test.cpp:27 or_joins_types
{
  "name": "or_joins_types",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local s = \"a\" or 10\n        local x:string|number = s\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "s",
          "equals": "(string & ~(false?)) | number"
        },
        {
          "type": "x",
          "equals": "number | string"
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:48 or_joins_types_with_no_extras
{
  "name": "or_joins_types_with_no_extras",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local s = \"a\" or 10\n        local x:number|string = s\n        local y = x or \"s\"\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "s",
          "equals": "(string & ~(false?)) | number"
        },
        {
          "type": "y",
          "equals": "number | string"
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:70 or_joins_types_with_no_superfluous_union
{
  "name": "or_joins_types_with_no_superfluous_union",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local s = \"a\" or \"b\"\n        local x:string = s\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "s",
          "equals": "(string & ~(false?)) | string"
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:87 and_does_not_always_add_boolean
{
  "name": "and_does_not_always_add_boolean",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local s = \"a\" and 10\n        local x:boolean|number = s\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "s",
          "equals": "number"
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:97 and_adds_boolean_no_superfluous_union
{
  "name": "and_adds_boolean_no_superfluous_union",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local s = \"a\" and true\n        local x:boolean = s\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "x",
          "equals": "boolean"
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:107 and_or_ternary
{
  "name": "and_or_ternary",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local s = (1/2) > 0.5 and \"a\" or 10\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "s",
          "equals": "number | string"
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:116 primitive_arith_no_metatable
{
  "name": "primitive_arith_no_metatable",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        function add(a: number, b: string)\n            return a + (tonumber(b) :: number), tostring(a) .. b\n        end\n        local n, s = add(2,\"3\")\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "add",
          "path": [
            {
              "result": 0
            }
          ]
        },
        {
          "type": "add",
          "path": [
            {
              "result": 0
            }
          ],
          "equals": "number"
        },
        {
          "type": "n",
          "equals": "number"
        },
        {
          "type": "s",
          "equals": "string"
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.operators.test.cpp:137 primitive_arith_no_metatable_with_follows
{
  "name": "primitive_arith_no_metatable_with_follows",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local PI=3.1415926535897931\n        local SOLAR_MASS=4*PI * PI\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "SOLAR_MASS",
          "sameAs": {
            "builtin": "number"
          }
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:148 primitive_arith_possible_metatable
{
  "name": "primitive_arith_possible_metatable",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function add(a: number, b: any)\n            return a + b\n        end\n        local t = add(1,2)\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "t",
          "equals": "any"
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.operators.test.cpp:162 some_primitive_binary_ops
{
  "name": "some_primitive_binary_ops",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local a = 4 + 8\n        local b = a + 9\n        local s = 'hotdogs'\n        local t = s .. s\n        local c = b - a\n    ",
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
          "equals": "number"
        },
        {
          "type": "s",
          "equals": "string"
        },
        {
          "type": "t",
          "equals": "string"
        },
        {
          "type": "c",
          "equals": "number"
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:181 floor_division_binary_op
{
  "name": "floor_division_binary_op",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local a = 4 // 8\n        local b = -4 // 9\n        local c = 9\n        c //= -6.5\n    ",
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
          "equals": "number"
        },
        {
          "type": "c",
          "equals": "number"
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:197 typecheck_overloaded_multiply_that_is_an_intersection
{
  "name": "typecheck_overloaded_multiply_that_is_an_intersection",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        --!strict\n        local Vec3 = {}\n        Vec3.__index = Vec3\n        function Vec3.new()\n            return setmetatable({x=0, y=0, z=0}, Vec3)\n        end\n\n        export type Vec3 = typeof(Vec3.new())\n\n        local thefun: any = function(self, o) return self end\n\n        local multiply: ((Vec3, Vec3) -> Vec3) & ((Vec3, number) -> Vec3) = thefun\n\n        Vec3.__mul = multiply\n\n        local a = Vec3.new()\n        local b = Vec3.new()\n        local c = a * b\n        local d = a * 2\n        local e = a * 'cabbage'\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "type": "a",
          "equals": "Vec3"
        },
        {
          "type": "b",
          "equals": "Vec3"
        },
        {
          "type": "c",
          "equals": "Vec3"
        },
        {
          "type": "d",
          "equals": "Vec3"
        },
        {
          "type": "e",
          "equals": "mul<Vec3, string>"
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.operators.test.cpp:236 typecheck_overloaded_multiply_that_is_an_intersection_on_rhs
{
  "name": "typecheck_overloaded_multiply_that_is_an_intersection_on_rhs",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        --!strict\n        local Vec3 = {}\n        Vec3.__index = Vec3\n        function Vec3.new()\n            return setmetatable({x=0, y=0, z=0}, Vec3)\n        end\n\n        export type Vec3 = typeof(Vec3.new())\n\n        local thefun: any = function(self, o) return self end\n\n        local multiply: ((Vec3, Vec3) -> Vec3) & ((Vec3, number) -> Vec3) = thefun\n\n        Vec3.__mul = multiply\n\n        local a = Vec3.new()\n        local b = Vec3.new()\n        local c = b * a\n        local d = 2 * a\n        local e = 'cabbage' * a\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "type": "a",
          "equals": "Vec3"
        },
        {
          "type": "b",
          "equals": "Vec3"
        },
        {
          "type": "c",
          "equals": "Vec3"
        },
        {
          "type": "d",
          "equals": "Vec3"
        },
        {
          "type": "e",
          "equals": "mul<string, Vec3>"
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.operators.test.cpp:275 compare_numbers
{
  "name": "compare_numbers",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local a = 441\n        local b = 0\n        local c = a < b\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:286 compare_strings
{
  "name": "compare_strings",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local a = '441'\n        local b = '0'\n        local c = a < b\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:297 cannot_indirectly_compare_types_that_do_not_have_a_metatable
{
  "name": "cannot_indirectly_compare_types_that_do_not_have_a_metatable",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local a = {}\n        local b = {}\n        local c = a < b\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "code": "CannotCompareUnrelatedTypes"
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:319 cannot_indirectly_compare_types_that_do_not_offer_overloaded_ordering_operators
{
  "name": "cannot_indirectly_compare_types_that_do_not_offer_overloaded_ordering_operators",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        local M = {}\n        function M.new()\n            return setmetatable({}, M)\n        end\n        type M = typeof(M.new())\n\n        local a = M.new()\n        local b = M.new()\n        local c = a < b\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "code": "CannotCompareUnrelatedTypes"
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.operators.test.cpp:348 cannot_compare_tables_that_do_not_have_the_same_metatable
{
  "name": "cannot_compare_tables_that_do_not_have_the_same_metatable",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        --!strict\n        local M = {}\n        function M.new()\n            return setmetatable({}, M)\n        end\n        function M.__lt(left, right) return true end\n\n        local a = M.new()\n        local b = {}\n        local c = a < b -- line 10\n        local d = b < a -- line 11\n    ",
      "expect": [
        {
          "errors": 2
        },
        {
          "error": 0,
          "location": [
            10,
            18,
            10,
            23
          ]
        },
        {
          "error": 1,
          "location": [
            11,
            18,
            11,
            23
          ]
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.operators.test.cpp:372 produce_the_correct_error_message_when_comparing_a_table_with_a_metatable_with_one_that_does_not
{
  "name": "produce_the_correct_error_message_when_comparing_a_table_with_a_metatable_with_one_that_does_not",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        --!strict\n        local M = {}\n        function M.new()\n            return setmetatable({}, M)\n        end\n        function M.__lt(left, right) return true end\n        type M = typeof(M.new())\n\n        local a = M.new()\n        local b = {}\n        local c = a < b -- line 10\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "code": "GenericError"
        },
        {
          "error": 0,
          "fields": {
            "message": "Types M and b cannot be compared with < because they do not have the same metatable"
          }
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.operators.test.cpp:398 in_nonstrict_mode_strip_nil_from_intersections_when_considering_relational_operators
{
  "name": "in_nonstrict_mode_strip_nil_from_intersections_when_considering_relational_operators",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        --!nonstrict\n\n        function maybe_a_number(): number?\n            return 50\n        end\n\n        local a = maybe_a_number() < maybe_a_number()\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:413 compound_assign_basic
{
  "name": "compound_assign_basic",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local s = 10\n        s += 20\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "s",
          "equals": "number"
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:423 compound_assign_mismatch_op
{
  "name": "compound_assign_mismatch_op",
  "fixture": "Fixture",
  "flags": {
    "LuauCompoundAssignSeedsAstTypes": true
  },
  "checks": [
    {
      "source": "\n        local s = 10\n        s += true\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "code": "UninhabitedTypeFunction"
        },
        {
          "error": 0,
          "fields": {
            "ty": "add<number, boolean>"
          }
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:447 compound_assign_reports_invalid_vector_arithmetic
{
  "name": "compound_assign_reports_invalid_vector_arithmetic",
  "fixture": "BuiltinsFixture",
  "flags": {
    "LuauCompoundAssignSeedsAstTypes": true
  },
  "checks": [
    {
      "source": "\n        local x = vector.zero\n        x = x + 1\n\n        local y = vector.zero\n        y += 1\n    ",
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
          "fields": {
            "ty": "add<vector, number>"
          }
        },
        {
          "error": 1,
          "code": "UninhabitedTypeFunction"
        },
        {
          "error": 1,
          "fields": {
            "ty": "add<vector, number>"
          }
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:479 compound_assign_mismatch_result
{
  "name": "compound_assign_mismatch_result",
  "fixture": "Fixture",
  "flags": {
    "LuauCompoundAssignSeedsAstTypes": true
  },
  "checks": [
    {
      "source": "\n        local s = 'hello'\n        s += 10\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "code": "UninhabitedTypeFunction"
        },
        {
          "error": 0,
          "fields": {
            "ty": "add<string, number>"
          }
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:504 compound_assign_metatable
{
  "name": "compound_assign_metatable",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        --!strict\n        type V2B = { x: number, y: number }\n        local v2b: V2B = { x = 0, y = 0 }\n        local VMT = {}\n\n        VMT.__add = function(a: V2, b: V2): V2\n            return setmetatable({ x = a.x + b.x, y = a.y + b.y }, VMT)\n        end\n\n        type V2 = typeof(setmetatable(v2b, VMT))\n\n        local v1: V2 = setmetatable({ x = 1, y = 2 }, VMT)\n        local v2: V2 = setmetatable({ x = 3, y = 4 }, VMT)\n        v1 += v2\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:526 compound_assign_metatable_with_changing_return_type
{
  "name": "compound_assign_metatable_with_changing_return_type",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        --!strict\n        type T = { x: number }\n        local MT = {}\n\n        function MT:__add(other): number\n            return 112\n        end\n\n        local t = setmetatable({x = 2}, MT)\n        local u = t + 3\n        t += 3\n    ",
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
            "wantedType": "t"
          }
        },
        {
          "error": 0,
          "fields": {
            "givenType": "number"
          }
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.operators.test.cpp:554 compound_assign_result_must_be_compatible_with_var
{
  "name": "compound_assign_result_must_be_compatible_with_var",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        function __add(left, right)\n            return 123\n        end\n\n        local mt = {\n            __add = __add,\n        }\n\n        local x = setmetatable({}, mt)\n        local v: number\n\n        v += x -- okay: number + x -> number\n        x += v -- not okay: x </: number\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "location": [
            13,
            8,
            13,
            14
          ]
        },
        {
          "error": 0,
          "code": "TypeMismatch"
        },
        {
          "error": 0,
          "fields": {
            "wantedType": "x"
          }
        },
        {
          "error": 0,
          "fields": {
            "givenType": "number"
          }
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.operators.test.cpp:583 compound_assign_mismatch_metatable
{
  "name": "compound_assign_mismatch_metatable",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        --!strict\n        type V2B = { x: number, y: number }\n        local v2b: V2B = { x = 0, y = 0 }\n        local VMT = {}\n        type V2 = typeof(setmetatable(v2b, VMT))\n\n        function VMT.__mod(a: V2, b: V2): number\n            return a.x * b.x + a.y * b.y\n        end\n\n        local v1: V2 = setmetatable({ x = 1, y = 2 }, VMT)\n        local v2: V2 = setmetatable({ x = 3, y = 4 }, VMT)\n        v1 %= v2\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Expected this to be 'V2', but got 'number'"
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:605 CallOrOfFunctions
{
  "name": "CallOrOfFunctions",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\nfunction f() return 1; end\nfunction g() return 2; end\n(f or g)()\n",
      "expect": [
        {
          "errors": 0
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.operators.test.cpp:617 CallAndOrOfFunctions
{
  "name": "CallAndOrOfFunctions",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\nfunction f() return 1; end\nfunction g() return 2; end\nlocal x = false\n(x and f or g)()\n",
      "expect": [
        {
          "errors": 0
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.operators.test.cpp:630 typecheck_unary_minus
{
  "name": "typecheck_unary_minus",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        --!strict\n        local foo\n        local mt = {}\n\n        mt.__unm = function(val): string\n            return tostring(val.value) .. \"test\"\n        end\n\n        foo = setmetatable({\n            value = 10\n        }, mt)\n\n        local a = -foo\n\n        local b = 1+-1\n\n        local bar = {\n            value = 10\n        }\n        local c = -bar -- disallowed\n    ",
      "expect": [
        {
          "type": "a",
          "equals": "string"
        },
        {
          "type": "b",
          "equals": "number"
        },
        {
          "errors": 2
        },
        {
          "error": 0,
          "code": "UninhabitedTypeFunction"
        },
        {
          "error": 0,
          "fields": {
            "ty": "unm<bar>"
          }
        },
        {
          "error": 1,
          "code": "TypeMismatch"
        },
        {
          "error": 1,
          "fields": {
            "givenType": "bar"
          }
        },
        {
          "error": 1,
          "fields": {
            "wantedType": "number"
          }
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:681 typecheck_unary_minus_error
{
  "name": "typecheck_unary_minus_error",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        --!strict\n        local mt = {}\n\n        mt.__unm = function(val: boolean): string\n            return \"test\"\n        end\n\n        local foo = setmetatable({\n            value = 10\n        }, mt)\n\n        local a = -foo\n    ",
      "expect": [
        {
          "errors": 2
        },
        {
          "type": "a",
          "equals": "unm<foo>"
        },
        {
          "error": 0,
          "code": "UninhabitedTypeFunction"
        },
        {
          "error": 1,
          "code": "TypeMismatch"
        },
        {
          "error": 1,
          "fields": {
            "wantedType": "(foo) -> unm<foo>"
          }
        },
        {
          "error": 1,
          "fields": {
            "givenType": "(boolean) -> string"
          }
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:726 typecheck_unary_len_error
{
  "name": "typecheck_unary_len_error",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        --!strict\n        local mt = {}\n\n        mt.__len = function(val): string\n            return \"test\"\n        end\n\n        local foo = setmetatable({\n            value = 10,\n        }, mt)\n\n        local a = #foo\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "type": "a",
          "equals": "number"
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
  ],
  "skip": {
    "newSolver": "does not pass on Luau's new solver upstream"
  }
},
  // TypeInfer.operators.test.cpp:757 unary_not_is_boolean
{
  "name": "unary_not_is_boolean",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        local b = not \"string\"\n        local c = not (math.random() > 0.5 and \"string\" or 7)\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "b",
          "equals": "boolean"
        },
        {
          "type": "c",
          "equals": "boolean"
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:769 disallow_string_and_types_without_metatables_from_arithmetic_binary_ops
{
  "name": "disallow_string_and_types_without_metatables_from_arithmetic_binary_ops",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        --!strict\n        local a = \"1.24\" + 123 -- not allowed\n\n        local foo = {\n            value = 10\n        }\n\n        local b = foo + 1 -- not allowed\n\n        local bar = {\n            value = 1\n        }\n\n        local mt = {}\n\n        setmetatable(bar, mt)\n\n        mt.__add = function(a: typeof(bar), b: number): number\n            return a.value + b\n        end\n\n        local c = bar + 1 -- allowed\n\n        local d = bar + foo -- not allowed\n    ",
      "expect": [
        {
          "errors": 3
        },
        {
          "error": 0,
          "code": "UninhabitedTypeFunction"
        },
        {
          "error": 0,
          "location": [
            2,
            18,
            2,
            30
          ]
        },
        {
          "error": 1,
          "code": "UninhabitedTypeFunction"
        },
        {
          "error": 1,
          "location": [
            8,
            18,
            8,
            25
          ]
        },
        {
          "error": 2,
          "code": "UninhabitedTypeFunction"
        },
        {
          "error": 2,
          "location": [
            24,
            18,
            24,
            27
          ]
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:831 unknown_type_in_comparison
{
  "name": "unknown_type_in_comparison",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function merge(lower, greater)\n            if lower.y == greater.y then\n            end\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.operators.test.cpp:844 concat_op_on_free_lhs_and_string_rhs
{
  "name": "concat_op_on_free_lhs_and_string_rhs",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local function f(x)\n            return x .. \"y\"\n        end\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "f",
          "equals": "<T>(T) -> concat<T, string>"
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.operators.test.cpp:866 concat_op_on_string_lhs_and_free_rhs
{
  "name": "concat_op_on_string_lhs_and_free_rhs",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local function f(x)\n            return \"foo\" .. x\n        end\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "f",
          "equals": "<T>(T) -> concat<string, T>"
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.operators.test.cpp:883 strict_binary_op_where_lhs_unknown
{
  "name": "strict_binary_op_where_lhs_unknown",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "function foo(a, b)\nlocal _ = a + b\nlocal _ = a - b\nlocal _ = a * b\nlocal _ = a / b\nlocal _ = a % b\nlocal _ = a ^ b\nlocal _ = a .. b\nend",
      "expect": [
        {
          "errors": 7
        },
        {
          "error": 0,
          "message": "Operator '+' could not be applied to operands of types unknown and unknown; there is no corresponding overload for __add"
        },
        {
          "error": 1,
          "message": "Operator '-' could not be applied to operands of types unknown and unknown; there is no corresponding overload for __sub"
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.operators.test.cpp:917 and_binexps_dont_unify
{
  "name": "and_binexps_dont_unify",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        --!strict\n        local t = {}\n        while true and t[1] do\n            print(t[1].test)\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:932 error_on_invalid_operand_types_to_relational_operators
{
  "name": "error_on_invalid_operand_types_to_relational_operators",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local a: boolean = true\n        local b: boolean = false\n        local foo = a < b\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "code": "GenericError"
        },
        {
          "error": 0,
          "fields": {
            "message": "Types 'boolean' and 'boolean' cannot be compared with relational operator <"
          }
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:956 error_on_invalid_operand_types_to_relational_operators2
{
  "name": "error_on_invalid_operand_types_to_relational_operators2",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local a: number | string = \"\"\n        local b: number | string = 1\n        local foo = a < b\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "code": "GenericError"
        },
        {
          "error": 0,
          "fields": {
            "message": "Types 'number | string' and 'number | string' cannot be compared with relational operator <"
          }
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:987 cli_38355_recursive_union
{
  "name": "cli_38355_recursive_union",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        --!strict\n        local _\n        _ += _ and _ or _ and _ or _ and _\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Unknown type used in + operation; consider adding a type annotation to '_'"
        }
      ]
    }
  ],
  "skip": {
    "newSolver": "does not pass on Luau's new solver upstream"
  }
},
  // TypeInfer.operators.test.cpp:1002 UnknownGlobalCompoundAssign
{
  "name": "UnknownGlobalCompoundAssign",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n            --!strict\n            a += 1\n            print(a)\n        ",
      "expect": [
        {
          "errors": "some"
        },
        {
          "error": 0,
          "message": "Unknown global 'a'; consider assigning to it first"
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:1047 strip_nil_from_lhs_or_operator
{
  "name": "strip_nil_from_lhs_or_operator",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n--!strict\nlocal a: number? = nil\nlocal b: number = a or 1\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:1058 strip_nil_from_lhs_or_operator2
{
  "name": "strip_nil_from_lhs_or_operator2",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n--!nonstrict\nlocal a: number? = nil\nlocal b: number = a or 1\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:1069 dont_strip_nil_from_rhs_or_operator
{
  "name": "dont_strip_nil_from_rhs_or_operator",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n--!strict\nlocal a: number? = nil\nlocal b: number = 1 or a\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "code": "TypeMismatch"
        },
        {
          "diagnosticType": [
            0,
            "wantedType"
          ],
          "sameAs": {
            "builtin": "number"
          }
        },
        {
          "error": 0,
          "fields": {
            "givenType": "number?"
          }
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:1085 operator_eq_verifies_types_do_intersect
{
  "name": "operator_eq_verifies_types_do_intersect",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type Array<T> = { [number]: T }\n        type Fiber = { id: number }\n        type null = {}\n\n        local fiberStack: Array<Fiber | null> = {}\n        local index = 0\n\n        local function f(fiber: Fiber)\n            local a = fiber ~= fiberStack[index]\n            local b = fiberStack[index] ~= fiber\n        end\n\n        return f\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:1106 operator_eq_operands_are_not_subtypes_of_each_other_but_has_overlap
{
  "name": "operator_eq_operands_are_not_subtypes_of_each_other_but_has_overlap",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local function f(a: string | number, b: boolean | number)\n            return a == b\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.operators.test.cpp:1121 operator_eq_completely_incompatible
{
  "name": "operator_eq_completely_incompatible",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local a: string | number = \"hi\"\n        local b: {x: string}? = {x = \"bye\"}\n\n        local r1 = a == b\n        local r2 = b == a\n    ",
      "expect": [
        {
          "errors": 2
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:1134 refine_and_or
{
  "name": "refine_and_or",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local t: {x: number?}? = {x = nil}\n        local u = t and t.x or 5\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "u",
          "equals": "number"
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:1146 infer_any_in_all_modes_when_lhs_is_unknown
{
  "name": "infer_any_in_all_modes_when_lhs_is_unknown",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local function f(x, y)\n            return x + y\n        end\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "f",
          "equals": "<T, U>(T, U) -> add<T, U>"
        }
      ],
      "mode": "strict",
      "ignoreMissingAnnotations": true
    },
    {
      "source": "\n        local function f(x, y)\n            return x + y\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ],
      "mode": "nonstrict",
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.operators.test.cpp:1181 infer_type_for_generic_subtraction
{
  "name": "infer_type_for_generic_subtraction",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local function f(x, y)\n            return x - y\n        end\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "f",
          "equals": "<T, U>(T, U) -> sub<T, U>"
        }
      ],
      "mode": "strict",
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.operators.test.cpp:1203 infer_type_for_generic_multiplication
{
  "name": "infer_type_for_generic_multiplication",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local function f(x, y)\n            return x * y\n        end\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "f",
          "equals": "<T, U>(T, U) -> mul<T, U>"
        }
      ],
      "mode": "strict",
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.operators.test.cpp:1225 infer_type_for_generic_division
{
  "name": "infer_type_for_generic_division",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local function f(x, y)\n            return x / y\n        end\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "f",
          "equals": "<T, U>(T, U) -> div<T, U>"
        }
      ],
      "mode": "strict",
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.operators.test.cpp:1247 infer_type_for_generic_floor_division
{
  "name": "infer_type_for_generic_floor_division",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local function f(x, y)\n            return x // y\n        end\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "f",
          "equals": "<T, U>(T, U) -> idiv<T, U>"
        }
      ],
      "mode": "strict",
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.operators.test.cpp:1269 infer_type_for_generic_exponentiation
{
  "name": "infer_type_for_generic_exponentiation",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local function f(x, y)\n            return x ^ y\n        end\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "f",
          "equals": "<T, U>(T, U) -> pow<T, U>"
        }
      ],
      "mode": "strict",
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.operators.test.cpp:1291 infer_type_for_generic_modulo
{
  "name": "infer_type_for_generic_modulo",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local function f(x, y)\n            return x % y\n        end\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "f",
          "equals": "<T, U>(T, U) -> mod<T, U>"
        }
      ],
      "mode": "strict",
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.operators.test.cpp:1313 infer_type_for_generic_concat
{
  "name": "infer_type_for_generic_concat",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local function f(x, y)\n            return x .. y\n        end\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "f",
          "equals": "<T, U>(T, U) -> concat<T, U>"
        }
      ],
      "mode": "strict",
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.operators.test.cpp:1335 equality_operations_succeed_if_any_union_branch_succeeds
{
  "name": "equality_operations_succeed_if_any_union_branch_succeeds",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        local mm = {}\n        type Foo = typeof(setmetatable({}, mm))\n        local x: Foo\n        local y: Foo?\n\n        local v1 = x == y\n        local v2 = y == x\n        local v3 = x ~= y\n        local v4 = y ~= x\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    },
    {
      "source": "\n        local mm1 = {\n            x = \"foo\",\n        }\n\n        local mm2 = {\n            y = \"bar\",\n        }\n\n        type Foo = typeof(setmetatable({}, mm1))\n        type Bar = typeof(setmetatable({}, mm2))\n\n        local x1: Foo\n        local x2: Foo?\n        local y1: Bar\n        local y2: Bar?\n\n        local v1 = x1 == y1\n        local v2 = x2 == y2\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Types Foo and Bar cannot be compared with == because they do not have the same metatable"
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:1376 expected_types_through_binary_and
{
  "name": "expected_types_through_binary_and",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        local x: \"a\" | \"b\" | boolean = math.random() > 0.5 and \"a\"\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:1385 expected_types_through_binary_or
{
  "name": "expected_types_through_binary_or",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        local x: \"a\" | \"b\" | boolean = math.random() > 0.5 or \"b\"\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:1394 unrelated_extern_types_cannot_be_compared
{
  "name": "unrelated_extern_types_cannot_be_compared",
  "fixture": "ExternTypeFixture",
  "checks": [
    {
      "source": "\n        local a = BaseClass.New()\n        local b = UnrelatedClass.New()\n\n        local c = a == b\n    ",
      "expect": [
        {
          "errors": 1
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:1406 unrelated_primitives_cannot_be_compared
{
  "name": "unrelated_primitives_cannot_be_compared",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local c = 5 == true\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "anyError": "CannotCompareUnrelatedTypes"
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:1420 mm_comparisons_must_return_a_boolean
  // The entire upstream body is #if 0 (CLI-115687): no executed snippet or assertions.
{
  "name": "mm_comparisons_must_return_a_boolean",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "",
      "expect": []
    }
  ]
},
  // TypeInfer.operators.test.cpp:1456 reworked_and
{
  "name": "reworked_and",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\nlocal a: number? = 5\nlocal b: boolean = (a or 1) > 10\nlocal c -- free\n\nlocal x = a and 1\nlocal y = 'a' and 1\nlocal z = b and 1\nlocal w = c and 1\n    ",
      "expect": [
        {
          "type": "x",
          "equals": "number?"
        },
        {
          "type": "y",
          "equals": "number"
        },
        {
          "type": "z",
          "equals": "false | number"
        },
        {
          "type": "w",
          "equals": "number?"
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:1482 reworked_or
{
  "name": "reworked_or",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\nlocal a: number | false = 5\nlocal b: number? = 6\nlocal c: boolean = true\nlocal d: true = true\nlocal e: false = false\nlocal f: nil = false\n\nlocal a1 = a or 'a'\nlocal b1 = b or 4\nlocal c1 = c or 'c'\nlocal d1 = d or 'd'\nlocal e1 = e or 'e'\nlocal f1 = f or 'f'\n    ",
      "expect": [
        {
          "type": "a1",
          "equals": "number | string"
        },
        {
          "type": "b1",
          "equals": "number"
        },
        {
          "type": "c1",
          "equals": "string | true"
        },
        {
          "type": "d1",
          "equals": "string | true"
        },
        {
          "type": "e1",
          "equals": "string"
        },
        {
          "type": "f1",
          "equals": "string"
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:1516 reducing_and
{
  "name": "reducing_and",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\ntype Foo = { name: string?, flag: boolean? }\nlocal arr: {Foo} = {}\n\nlocal function foo(arg: {name: string}?)\n    local name = if arg and arg.name then arg.name else nil\n\n    table.insert(arr, {\n        name = name or \"\",\n        flag = name ~= nil and name ~= \"\",\n    })\nend\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:1535 luau_polyfill_is_array_simplified
{
  "name": "luau_polyfill_is_array_simplified",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n     --!strict\n     return function(value: any) : boolean\n        if typeof(value) ~= \"number\" then\n           return false\n        end\n        if value % 1 ~= 0 or value < 1 then\n           return false\n        end\n        return true\n     end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:1553 luau_polyfill_is_array
{
  "name": "luau_polyfill_is_array",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n--!strict\nreturn function(value: any): boolean\n    if typeof(value) ~= \"table\" then\n        return false\n    end\n    if next(value) == nil then\n        -- an empty table is an empty array\n        return true\n    end\n\n    local length = #value\n\n    if length == 0 then\n        return false\n    end\n\n    local count = 0\n    local sum = 0\n    for key in pairs(value) do\n        if typeof(key) ~= \"number\" then\n            return false\n        end\n        if key % 1 ~= 0 or key < 1 then\n            return false\n        end\n        count += 1\n        sum += key\n    end\n\n    return sum == (count * (count + 1) / 2)\nend\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:1592 luau-polyfill.String.slice
{
  "name": "luau-polyfill.String.slice",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n--!strict\nlocal function slice(str: string, startIndexStr: string | number, lastIndexStr: (string | number)?): string\n\tlocal strLen, invalidBytePosition = utf8.len(str)\n\tassert(strLen ~= nil, (\"string `%s` has an invalid byte at position %s\"):format(str, tostring(invalidBytePosition)))\n    local startIndex = tonumber(startIndexStr)\n\n\n\t-- if no last index length set, go to str length + 1\n\tlocal lastIndex = strLen + 1\n\n\tassert(typeof(lastIndex) == \"number\", \"lastIndexStr should convert to number\")\n\n\tif lastIndex > strLen then\n\t\tlastIndex = strLen + 1\n\tend\n\n\tlocal startIndexByte = utf8.offset(str, startIndex)\n\n\treturn string.sub(str, startIndexByte, startIndexByte)\nend\n\nreturn slice\n\n\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:1624 luau-polyfill.Array.startswith
{
  "name": "luau-polyfill.Array.startswith",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n--!strict\nlocal function startsWith(value: string, substring: string, position: number?): boolean\n\t-- Luau FIXME: we have to use a tmp variable, as Luau doesn't understand the logic below narrow position to `number`\n\tlocal position_\n\tif position == nil or position < 1 then\n\t\tposition_ = 1\n\telse\n\t\tposition_ = position\n\tend\n\n\treturn value:find(substring, position_, true) == position_\nend\n\nreturn startsWith\n\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:1649 add_type_function_works
{
  "name": "add_type_function_works",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local function add(x, y)\n            return x + y\n        end\n\n        local a = add(1, 2)\n        local b = add(\"foo\", \"bar\")\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "type": "a",
          "equals": "number"
        },
        {
          "type": "b",
          "equals": "add<string, string>"
        },
        {
          "error": 0,
          "message": "Operator '+' could not be applied to operands of types string and string; there is no corresponding overload for __add"
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.operators.test.cpp:1673 normalize_strings_comparison
{
  "name": "normalize_strings_comparison",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\nlocal function sortKeysForPrinting(a: any, b)\n\tlocal typeofA = type(a)\n\tlocal typeofB = type(b)\n\t-- strings and numbers are sorted numerically/alphabetically\n\tif typeofA == typeofB and (typeofA == \"number\" or typeofA == \"string\") then\n\t\treturn a < b\n\tend\n\t-- sort the rest by type name\n\treturn typeofA < typeofB\nend\n",
      "expect": [
        {
          "errors": 0
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.operators.test.cpp:1691 compare_singleton_string_to_string
{
  "name": "compare_singleton_string_to_string",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        local function test(a: string, b: string)\n            if a == \"Pet\" and b == \"Pet\" then\n                return true\n            elseif a ~= b then\n                return a < b\n            else\n                return false\n            end\n        end\n",
      "expect": [
        {
          "errors": 0
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.operators.test.cpp:1712 no_infinite_expansion_of_free_type
{
  "name": "no_infinite_expansion_of_free_type",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        local tooltip = {}\n\n        function tooltip:Show()\n            local playerGui = self.Player:FindFirstChild(\"PlayerGui\")\n            for _,c in ipairs(playerGui:GetChildren()) do\n                if c:IsA(\"ScreenGui\") and c.DisplayOrder > self.Gui.DisplayOrder then\n                end\n            end\n        end\n    ",
      "expect": []
    }
  ]
},
  // TypeInfer.operators.test.cpp:1730 compound_operator_on_upvalue
{
  "name": "compound_operator_on_upvalue",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        local byteCursor: number = 0\n\n        local function advance(bytes: number)\n            byteCursor += bytes\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:1743 metatable_operator_follow
{
  "name": "metatable_operator_follow",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\nlocal t1 = {}\nlocal t2 = {}\nlocal mt = {}\n\nmt.__eq = function(a, b)\n    return false\nend\n\nsetmetatable(t1, mt)\nsetmetatable(t2, mt)\n\nif t1 == t2 then\n\nend\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:1765 overload_concat
{
  "name": "overload_concat",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        type classData = {\n            b:buffer;\n            len:number;\n        }\n        local metatable = {\n            __concat = function(self:cls,str:string):cls\n                buffer.writestring(self.b,self.len,str)\n                self.len+=#str\n                return self\n            end;\n        }\n\n        export type cls = typeof(setmetatable({}::classData, metatable))\n\n        --returns a long string\n        local new = function():cls\n            return setmetatable({\n                b = buffer.create(100_000::number);\n                len = 0;\n            }::classData,metatable)::cls\n        end\n        local class = new()\n\n        class ..= \"Hello\"\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.operators.test.cpp:1797 negated_integer_literal_is_a_constant
{
  "name": "negated_integer_literal_is_a_constant",
  "fixture": "BuiltinsFixture",
  "flags": {
    "LuauIntegerType2": true
  },
  "checks": [
    {
      "source": "\n        --!strict\n        local a = -4194626i\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "a",
          "equals": "integer"
        }
      ],
      "unparsed": {
        "divergence": "Luau's native 64-bit integers are unsupported"
      }
    }
  ]
},
  // TypeInfer.operators.test.cpp:1812 negating_a_non_literal_integer_is_an_error
{
  "name": "negating_a_non_literal_integer_is_an_error",
  "fixture": "BuiltinsFixture",
  "flags": {
    "LuauIntegerType2": true
  },
  "checks": [
    {
      "source": "\n        --!strict\n        local b = 5i\n        local c = -b\n        local d = -(5i)\n    ",
      "expect": [
        {
          "errors": 4
        }
      ],
      "unparsed": {
        "divergence": "Luau's native 64-bit integers are unsupported"
      }
    }
  ]
},
]);
