// Luau upstream 7d5f73364fdbbaa984fa545071630eba73cfea98, tests/TypeInfer.intersectionTypes.test.cpp
import { portUpstreamFile } from "./portedCases";

portUpstreamFile("TypeInfer.intersectionTypes.test.cpp", [
  // TypeInfer.intersectionTypes.test.cpp:18 select_correct_union_fn
{
  "name": "select_correct_union_fn",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A = (number) -> (string)\n        type B = (string) -> (number)\n\n        local function foo(f: A & B)\n            return f(10), f(\"a\")\n        end\n    ",
      "expect": [
        {
          "errors": 0
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
  // TypeInfer.intersectionTypes.test.cpp:36 table_combines
{
  "name": "table_combines",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A={a:number}\n        type B={b:string}\n\n        local c:A & B = {a=10, b=\"s\"}\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:48 table_combines_missing
{
  "name": "table_combines_missing",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A={a:number}\n        type B={b:string}\n\n        local c:A & B = {a=10}\n    ",
      "expect": [
        {
          "errors": 1
        }
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:60 impossible_type
{
  "name": "impossible_type",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local c:number&string = 10\n    ",
      "expect": [
        {
          "errors": 1
        }
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:69 table_extra_ok
{
  "name": "table_extra_ok",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A={a:number}\n        type B={b:string}\n\n        local function f(t: A & B): A\n            return t\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:83 fx_intersection_as_argument
{
  "name": "fx_intersection_as_argument",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A = (number) -> (string)\n        type B = (string) -> (number)\n        type C = (A) -> (number)\n\n        local function foo(f: A & B, g: C)\n            return g(f)\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:100 fx_union_as_argument_fails
{
  "name": "fx_union_as_argument_fails",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A = (number) -> (string)\n        type B = (string) -> (number)\n        type C = (A) -> (number)\n\n        local function foo(f: A | B, g: C)\n            return g(f)\n        end\n    ",
      "expect": [
        {
          "errors": "some"
        }
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:115 argument_is_intersection
{
  "name": "argument_is_intersection",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A = (number | boolean) -> number\n\n        local function foo(f: A)\n            f(5)\n            f(true)\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:129 should_still_pick_an_overload_whose_arguments_are_unions
{
  "name": "should_still_pick_an_overload_whose_arguments_are_unions",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A = (number) -> string\n        type B = (string) -> number\n\n        local function foo(f: A & B)\n            return f(1), f(\"five\")\n        end\n    ",
      "expect": [
        {
          "errors": 0
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
  // TypeInfer.intersectionTypes.test.cpp:147 propagates_name
{
  "name": "propagates_name",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A={a:number}\n        type B={b:string}\n\n        local function f(t: A & B)\n            return t\n        end\n    ",
      "expect": [
        {
          "decoratedSource": "\n        type A={a:number}\n        type B={b:string}\n\n        local function f(t: A & B): A&B\n            return t\n        end\n    "
        }
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:170 index_on_an_intersection_type_with_property_guaranteed_to_exist
{
  "name": "index_on_an_intersection_type_with_property_guaranteed_to_exist",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A = {x: {y: number}}\n        type B = {x: {y: number}}\n\n        local function f(t: A & B)\n            return t.x\n        end\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "f",
          "equals": "(A & B) -> { y: number }"
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:191 index_on_an_intersection_type_works_at_arbitrary_depth
{
  "name": "index_on_an_intersection_type_works_at_arbitrary_depth",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A = {x: {y: {z: {thing: string}}}}\n        type B = {x: {y: {z: {thing: string}}}}\n\n        local function f(t: A & B)\n            return t.x.y.z.thing\n        end\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "f",
          "equals": "(A & B) -> string"
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:212 index_on_an_intersection_type_with_mixed_types
{
  "name": "index_on_an_intersection_type_with_mixed_types",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A = {x: number}\n        type B = {x: string}\n\n        local function f(t: A & B)\n            return t.x\n        end\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "f",
          "equals": "(A & B) -> never"
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:233 index_on_an_intersection_type_with_one_part_missing_the_property
{
  "name": "index_on_an_intersection_type_with_one_part_missing_the_property",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A = {x: number}\n        type B = {}\n\n        local function f(t: A & B)\n            return t.x\n        end\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "f",
          "equals": "(A & B) -> number"
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:250 index_on_an_intersection_type_with_one_property_of_type_any
{
  "name": "index_on_an_intersection_type_with_one_property_of_type_any",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A = {y: number}\n        type B = {x: any}\n\n        local function f(t: A & B)\n            return t.x\n        end\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "f",
          "equals": "(A & B) -> any"
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:267 index_on_an_intersection_type_with_all_parts_missing_the_property
{
  "name": "index_on_an_intersection_type_with_all_parts_missing_the_property",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A = {}\n        type B = {}\n\n        local function f(t: A & B)\n            local x = t.x\n        end\n    ",
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
            "key": "x"
          }
        }
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:285 table_intersection_write
{
  "name": "table_intersection_write",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type X = { x: number }\n        type XY = X & { y: number }\n\n        function f(t: XY)\n            t.x = 10\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    },
    {
      "source": "\n        type X = {}\n        type XY = X & { x: number, y: number }\n\n        function f(t: XY)\n            t.x = 10\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    },
    {
      "source": "\n        type X = { x: number }\n        type Y = { y: number }\n        type XY = X & Y\n\n        function f(t: XY)\n            t.x = 10\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    },
    {
      "source": "\n        type A = { x: {y: number} }\n        type B = { x: {y: number} }\n\n        function f(t: A & B)\n            t.x = { y = 4 }\n            t.x.y = 40\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:334 table_intersection_write_sealed
{
  "name": "table_intersection_write_sealed",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type X = { x: number }\n        type Y = { y: number }\n        type XY = X & Y\n\n        function f(t: XY)\n            t.z = 10\n        end\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Cannot add property 'z' to table 'X & Y'"
        }
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:351 table_intersection_write_sealed_indirect
{
  "name": "table_intersection_write_sealed_indirect",
  "fixture": "Fixture",
  "flags": {
    "LuauCheckFunctionStatementTypes": true
  },
  "checks": [
    {
      "source": "\n        type X = { x: (number) -> number }\n        type Y = { y: (string) -> string }\n\n        type XY = X & Y\n\n        function f(t: XY)\n            function t.z(a:number) return a * 10 end\n            function t:y(a:number) return a * 10 end\n            function t:w(a:number) return a * 10 end\n        end\n    ",
      "expect": [
        {
          "errors": 4
        },
        {
          "error": 0,
          "message": "Cannot add property 'z' to table 'X & Y'"
        },
        {
          "error": 1,
          "code": "TypeMismatch"
        },
        {
          "error": 1,
          "fields": {
            "givenType": "number"
          }
        },
        {
          "error": 1,
          "fields": {
            "wantedType": "string"
          }
        },
        {
          "error": 2,
          "code": "TypeMismatch"
        },
        {
          "error": 2,
          "fields": {
            "givenType": "(string, number) -> string"
          }
        },
        {
          "error": 2,
          "fields": {
            "wantedType": "(string) -> string"
          }
        },
        {
          "error": 3,
          "message": "Cannot add property 'w' to table 'X & Y'"
        }
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:398 table_write_sealed_indirect
{
  "name": "table_write_sealed_indirect",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n    type XY = { x: (number) -> number, y: (string) -> string }\n\n    local xy : XY = {\n        x = function(a: number) return -a end,\n        y = function(a: string) return a .. \"b\" end\n    }\n    function xy.z(a:number) return a * 10 end\n    function xy:y(a:number) return a * 10 end\n    function xy:w(a:number) return a * 10 end\n    ",
      "expect": [
        {
          "errors": 4
        },
        {
          "error": 0,
          "message": "Expected this to be\n\t'(string) -> string'\nbut got\n\t'(string, number) -> string'\ncaused by:\n  Argument count mismatch. Function expects 2 arguments, but only 1 is specified"
        },
        {
          "error": 1,
          "message": "Cannot add property 'z' to table 'XY'"
        },
        {
          "error": 2,
          "message": "Expected this to be 'string', but got 'number'"
        },
        {
          "error": 3,
          "message": "Cannot add property 'w' to table 'XY'"
        }
      ]
    }
  ],
  "skip": {
    "newSolver": "does not pass on Luau's new solver upstream"
  }
},
  // TypeInfer.intersectionTypes.test.cpp:428 table_intersection_setmetatable
{
  "name": "table_intersection_setmetatable",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        function f(t: {} & {})\n            setmetatable(t, {})\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:439 error_detailed_intersection_part
{
  "name": "error_detailed_intersection_part",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\ntype X = { x: number }\ntype Y = { y: number }\ntype Z = { z: number }\ntype XYZ = X & Y & Z\nlocal a: XYZ = 3\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Expected this to be 'X & Y & Z', but got 'number'; \nthis is because \n\t * `number` is not a subtype of `X`\n\t * `number` is not a subtype of `Y`\n\t * `number` is not a subtype of `Z`"
        }
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:477 error_detailed_intersection_all
{
  "name": "error_detailed_intersection_all",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\ntype X = { x: number }\ntype Y = { y: number }\ntype Z = { z: number }\ntype XYZ = X & Y & Z\n\nfunction f(a: XYZ): number\n    return a\nend\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Expected this to be 'number', but got 'X & Y & Z'; \nthis is because \n\t * `X` is not a subtype of `number`\n\t * `Y` is not a subtype of `number`\n\t * `Z` is not a subtype of `number`"
        }
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:511 overload_is_not_a_function
{
  "name": "overload_is_not_a_function",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n--!nonstrict\nfunction _(...):((typeof(not _))&(typeof(not _)))&((typeof(not _))&(typeof(not _)))\n_(...)(setfenv,_,not _,\"\")[_] = nil\nend\ndo end\n_(...)(...,setfenv,_):_G()\n",
      "expect": []
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:523 no_stack_overflow_from_flattenintersection
{
  "name": "no_stack_overflow_from_flattenintersection",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local l0,l0\n        repeat\n        type t0 = ((any)|((any)&((any)|((any)&((any)|(any))))))&(t0)\n        function _(l0):(t0)&(t0)\n            while nil do\n            end\n        end\n        until _(_)(_)._\n    ",
      "expect": [
        {
          "errors": "some"
        }
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:539 intersect_bool_and_false
{
  "name": "intersect_bool_and_false",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f(x: boolean & false)\n            local y : false = x -- OK\n            local z : true = x  -- Not OK\n        end\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Expected this to be 'true', but got 'boolean & false'; \nthis is because \n\t * `boolean` is not a subtype of `true`\n\t * `false` is not a subtype of `true`"
        }
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:567 intersect_false_and_bool_and_false
{
  "name": "intersect_false_and_bool_and_false",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f(x: false & (boolean & false))\n            local y : false = x -- OK\n            local z : true = x  -- Not OK\n        end\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Expected this to be 'true', but got 'boolean & false & false'; \nthis is because \n\t * `boolean` is not a subtype of `true`\n\t * `false` is not a subtype of `true`"
        }
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:599 intersect_saturate_overloaded_functions
{
  "name": "intersect_saturate_overloaded_functions",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function foo(x: ((number?) -> number?) & ((string?) -> string?))\n            local y : (nil) -> nil = x -- Not OK (fixed in DCR)\n            local z : (number) -> number = x -- Not OK\n        end\n    ",
      "expect": [
        {
          "error": 0,
          "message": "Expected this to be\n\t'(nil) -> nil'\nbut got\n\t'((number?) -> number?) & ((string?) -> string?)'; \nthis is because \n\t * Expected the return type to be `nil`, but got `number`\n\t * Expected the return type to be `nil`, but got `string`"
        },
        {
          "error": 1,
          "message": "Expected this to be\n\t'(number) -> number'\nbut got\n\t'((number?) -> number?) & ((string?) -> string?)'; \nthis is because \n\t * Expected the 1st parameter to be a supertype of `number`, but got `string?`\n\t * Expected the return type to be `number`, but got `nil`\n\t * Expected the return type to be `number`, but got `string`"
        }
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:666 union_saturate_overloaded_functions
{
  "name": "union_saturate_overloaded_functions",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f(x: ((number) -> number) & ((string) -> string))\n            local y : ((number | string) -> (number | string)) = x -- OK\n            local z : ((number | boolean) -> (number | boolean)) = x -- Not OK\n        end\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Expected this to be\n\t'(boolean | number) -> boolean | number'\nbut got\n\t'((number) -> number) & ((string) -> string)'; none of the intersection parts are compatible"
        }
      ]
    }
  ],
  "skip": {
    "newSolver": "does not pass on Luau's new solver upstream"
  }
},
  // TypeInfer.intersectionTypes.test.cpp:688 intersection_of_tables
{
  "name": "intersection_of_tables",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f(x: { p : number?, q : string? } & { p : number?, q : number?, r : number? })\n            local y : { p : number?, q : nil, r : number? } = x -- OK\n            local z : { p : nil } = x -- Not OK\n        end\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Expected this to be '{ p: nil }', but got '{ p: number?, q: number?, r: number? } & { p: number?, q: string? }'; \nExpected property `p` to be exactly `nil`, but got `number`"
        }
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:722 intersection_of_tables_with_top_properties
{
  "name": "intersection_of_tables_with_top_properties",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f(x : { p : number?, q : any } & { p : unknown, q : string? })\n            local y : { p : number?, q : string? } = x -- OK\n            local z : { p : string?, q : number? } = x -- Not OK\n        end\n    ",
      "expect": [
        {
          "error": 0,
          "message": "Expected this to be\n\t'{ p: string?, q: number? }'\nbut got\n\t'{ p: number?, q: any } & { p: unknown, q: string? }'; \nthis is because \n\t * Expected property `p` to be exactly `string?`, but got `number`\n\t * Expected property `p` to be exactly `string?`, but got `unknown`\n\t * Expected property `p` to be exactly `string`, but got `number?`\n\t * Expected property `q` to be exactly `number?`, but got `any`\n\t * Expected property `q` to be exactly `number?`, but got `string`\n\t * Expected property `q` to be exactly `number`, but got `string?`"
        }
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:775 intersection_of_tables_with_never_properties
{
  "name": "intersection_of_tables_with_never_properties",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f(x : { p : number?, q : never } & { p : never, q : string? })\n            local y : { p : never, q : never } = x -- OK\n            local z : never = x -- OK\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:787 overloaded_functions_returning_intersections
{
  "name": "overloaded_functions_returning_intersections",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f(x : ((number?) -> ({ p : number } & { q : number })) & ((string?) -> ({ p : number } & { r : number })))\n            local y : (nil) -> { p : number, q : number, r : number} = x -- OK\n            local z : (number?) -> { p : number, q : number, r : number} = x -- Not OK\n        end\n    ",
      "expect": [
        {
          "errors": 2
        },
        {
          "error": 0,
          "message": "Expected this to be\n\t'(nil) -> { p: number, q: number, r: number }'\nbut got\n\t'((number?) -> { p: number } & { q: number }) & ((string?) -> { p: number } & { r: number })'; \nthis is because \n\t * Expected the return type to be `{ p: number, q: number, r: number }`, but got `{ p: number }`\n\t * Expected the return type to be `{ p: number, q: number, r: number }`, but got `{ q: number }`\n\t * Expected the return type to be `{ p: number, q: number, r: number }`, but got `{ r: number }`"
        },
        {
          "error": 1,
          "message": "Expected this to be\n\t'(number?) -> { p: number, q: number, r: number }'\nbut got\n\t'((number?) -> { p: number } & { q: number }) & ((string?) -> { p: number } & { r: number })'; \nthis is because \n\t * Expected the 1st parameter to be a supertype of `number`, but got `string?`\n\t * Expected the return type to be `{ p: number, q: number, r: number }`, but got `{ p: number }`\n\t * Expected the return type to be `{ p: number, q: number, r: number }`, but got `{ q: number }`\n\t * Expected the return type to be `{ p: number, q: number, r: number }`, but got `{ r: number }`"
        }
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:873 overloaded_functions_mentioning_generic
{
  "name": "overloaded_functions_mentioning_generic",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f<a>()\n            function g(x : ((number?) -> (a | number)) & ((string?) -> (a | string)))\n                local y : (nil) -> a = x -- OK\n                local z : (number?) -> a = x -- Not OK\n            end\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:898 overloaded_functions_mentioning_generics
{
  "name": "overloaded_functions_mentioning_generics",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f<a,b,c>()\n            function g(x : ((a?) -> (a | b)) & ((c?) -> (b | c)))\n                local y : (nil) -> ((a & c) | b) = x -- OK\n                local z : (a?) -> ((a & c) | b) = x -- Not OK\n            end\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:925 overloaded_functions_mentioning_generic_packs
{
  "name": "overloaded_functions_mentioning_generic_packs",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f<a...,b...>()\n            function g(x : ((number?, a...) -> (number?, b...)) & ((string?, a...) -> (string?, b...)))\n                local y : ((nil, a...) -> (nil, b...)) = x -- OK in the old solver, not OK in the new\n                local z : ((nil, b...) -> (nil, a...)) = x -- Not OK\n                local w : ((number?, a...) -> (number?, b...)) = x -- OK in both solvers\n            end\n        end\n    ",
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
            "wantedType": "(nil, a...) -> (nil, b...)"
          }
        },
        {
          "error": 0,
          "fields": {
            "givenType": "((number?, a...) -> (number?, b...)) & ((string?, a...) -> (string?, b...))"
          }
        },
        {
          "error": 1,
          "code": "TypeMismatch"
        },
        {
          "error": 1,
          "fields": {
            "wantedType": "(nil, b...) -> (nil, a...)"
          }
        },
        {
          "error": 1,
          "fields": {
            "givenType": "((number?, a...) -> (number?, b...)) & ((string?, a...) -> (string?, b...))"
          }
        },
        {
          "error": 0,
          "message": "Expected this to be\n\t'(nil, a...) -> (nil, b...)'\nbut got\n\t'((number?, a...) -> (number?, b...)) & ((string?, a...) -> (string?, b...))'; \nthis is because \n\t * Expected the 1st return value to be `nil`, but got `number`\n\t * Expected the 1st return value to be `nil`, but got `string`"
        },
        {
          "error": 1,
          "message": "Expected this to be\n\t'(nil, b...) -> (nil, a...)'\nbut got\n\t'((number?, a...) -> (number?, b...)) & ((string?, a...) -> (string?, b...))'; \nthis is because \n\t * Expected the 1st return value to be `nil`, but got `number`\n\t * Expected the 1st return value to be `nil`, but got `string`\n\t * Expected the parameter type pack tail to be a supertype of `b...`, but got `a...`\n\t * Expected the return type pack tail to be `a...`, but got `b...`"
        }
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:1017 overloadeded_functions_with_unknown_result
{
  "name": "overloadeded_functions_with_unknown_result",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f<a...,b...>()\n            function g(x : ((number) -> number) & ((nil) -> unknown))\n                local y : (number?) -> unknown = x -- OK\n                local z : (number?) -> number? = x -- Not OK\n            end\n        end\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Expected this to be\n\t'(number?) -> number?'\nbut got\n\t'((nil) -> unknown) & ((number) -> number)'; none of the intersection parts are compatible"
        }
      ]
    }
  ],
  "skip": {
    "newSolver": "does not pass on Luau's new solver upstream"
  }
},
  // TypeInfer.intersectionTypes.test.cpp:1041 overloadeded_functions_with_unknown_arguments
{
  "name": "overloadeded_functions_with_unknown_arguments",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f<a...,b...>()\n            function g(x : ((number) -> number?) & ((unknown) -> string?))\n                local y : (number) -> nil = x -- OK\n                local z : (number?) -> nil = x -- Not OK\n            end\n        end\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Expected this to be\n\t'(number?) -> nil'\nbut got\n\t'((number) -> number?) & ((unknown) -> string?)'; none of the intersection parts are compatible"
        }
      ]
    }
  ],
  "skip": {
    "newSolver": "does not pass on Luau's new solver upstream"
  }
},
  // TypeInfer.intersectionTypes.test.cpp:1065 overloadeded_functions_with_never_result
{
  "name": "overloadeded_functions_with_never_result",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n    function f<a...,b...>()\n        function g(x : ((number) -> number) & ((nil) -> never))\n            local y : (number?) -> number = x -- OK\n            local z : (number?) -> never = x -- Not OK\n        end\n    end\n    ",
      "expect": [
        {
          "error": 0,
          "message": "Expected this to be\n\t'(number?) -> number'\nbut got\n\t'((nil) -> never) & ((number) -> number)'; \nthis is because \n\t * Expected the 1st parameter to be a supertype of `nil`, but got `number`\n\t * Expected the 1st parameter to be a supertype of `number`, but got `nil`"
        },
        {
          "error": 1,
          "message": "Expected this to be\n\t'(number?) -> never'\nbut got\n\t'((nil) -> never) & ((number) -> number)'; \nthis is because \n\t * Expected the 1st parameter to be a supertype of `nil`, but got `number`\n\t * Expected the 1st parameter to be a supertype of `number`, but got `nil`\n\t * Expected the return type to be `never`, but got `number`"
        }
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:1137 overloadeded_functions_with_never_arguments
{
  "name": "overloadeded_functions_with_never_arguments",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f<a...,b...>()\n            function g(x : ((number) -> number?) & ((never) -> string?))\n                local y : (never) -> nil = x -- OK\n                local z : (number?) -> nil = x -- Not OK\n            end\n        end\n    ",
      "expect": [
        {
          "error": 0,
          "message": "Expected this to be\n\t'(never) -> nil'\nbut got\n\t'((never) -> string?) & ((number) -> number?)'; \nthis is because \n\t * Expected the return type to be `nil`, but got `number`\n\t * Expected the return type to be `nil`, but got `string`"
        },
        {
          "error": 1,
          "message": "Expected this to be\n\t'(number?) -> nil'\nbut got\n\t'((never) -> string?) & ((number) -> number?)'; \nthis is because \n\t * Expected the 1st parameter to be a supertype of `nil`, but got `never`\n\t * Expected the 1st parameter to be a supertype of `nil`, but got `number`\n\t * Expected the 1st parameter to be a supertype of `number`, but got `never`\n\t * Expected the return type to be `nil`, but got `number`\n\t * Expected the return type to be `nil`, but got `string`"
        }
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:1217 overloadeded_functions_with_overlapping_results_and_variadics
{
  "name": "overloadeded_functions_with_overlapping_results_and_variadics",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f(x : ((string?) -> (string | number)) & ((number?) -> ...number))\n            local y : ((nil) -> (number, number?)) = x -- OK\n            local z : ((string | number) -> (number, number?)) = x -- Not OK\n        end\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Expected this to be\n\t'(number | string) -> (number, number?)'\nbut got\n\t'((number?) -> (...number)) & ((string?) -> number | string)'; none of the intersection parts are compatible"
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
  // TypeInfer.intersectionTypes.test.cpp:1239 overloadeded_functions_with_weird_typepacks_1
{
  "name": "overloadeded_functions_with_weird_typepacks_1",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f<a...,b...>()\n            function g(x : (() -> a...) & (() -> b...))\n                local y : (() -> b...) & (() -> a...) = x -- OK\n                local z : () -> () = x -- Not OK\n            end\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:1264 overloadeded_functions_with_weird_typepacks_2
{
  "name": "overloadeded_functions_with_weird_typepacks_2",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f<a...,b...>()\n            function g(x : ((a...) -> ()) & ((b...) -> ()))\n                local y : ((b...) -> ()) & ((a...) -> ()) = x -- OK\n                local z : () -> () = x -- Not OK\n            end\n        end\n    ",
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
            "wantedType": "() -> ()"
          }
        },
        {
          "error": 0,
          "fields": {
            "givenType": "((a...) -> ()) & ((b...) -> ())"
          }
        }
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:1293 overloadeded_functions_with_weird_typepacks_3
{
  "name": "overloadeded_functions_with_weird_typepacks_3",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f<a...>()\n            function g(x : (() -> a...) & (() -> (number?,a...)))\n                local y : (() -> (number?,a...)) & (() -> a...) = x -- OK\n                local z : () -> (number) = x -- Not OK\n            end\n        end\n    ",
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
            "wantedType": "() -> number"
          }
        },
        {
          "error": 0,
          "fields": {
            "givenType": "(() -> (a...)) & (() -> (number?, a...))"
          }
        }
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:1323 overloadeded_functions_with_weird_typepacks_4
{
  "name": "overloadeded_functions_with_weird_typepacks_4",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f<a...>()\n            function g(x : ((a...) -> ()) & ((number,a...) -> number))\n                local y : ((number,a...) -> number) & ((a...) -> ()) = x -- OK\n                local z : (number?) -> () = x -- Not OK\n            end\n        end\n    ",
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
            "wantedType": "(number?) -> ()"
          }
        },
        {
          "error": 0,
          "fields": {
            "givenType": "((a...) -> ()) & ((number, a...) -> number)"
          }
        },
        {
          "error": 0,
          "message": "Expected this to be\n\t'(number?) -> ()'\nbut got\n\t'((a...) -> ()) & ((number, a...) -> number)'; \nthis is because \n\t * Expected the 1st parameter to be a supertype of `nil`, but got `number`\n\t * Expected the return types to be `()`, but got `number`\n\t * the parameter type pack tail is `a...` and the parameter types are `number?`, and `a...` is not a supertype of `number?`\n\t * the parameter type pack tail is `a...` and the parameters from the 1st onward are `number?`, and `a...` is not a supertype of `number?`"
        }
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:1386 intersect_metatables
{
  "name": "intersect_metatables",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n            function f(a: string?, b: string?)\n                local x = setmetatable({}, { p = 5, q = a })\n                local y = setmetatable({}, { q = b, r = \"hi\" })\n                local z = setmetatable({}, { p = 5, q = nil, r = \"hi\" })\n\n                type X = typeof(x)\n                type Y = typeof(y)\n                type Z = typeof(z)\n\n                function g(xy: X&Y, yx: Y&X): (Z, Z)\n                    return xy, yx\n                end\n\n                g(z, z)\n            end\n        ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ],
  "skip": {
    "newSolver": "Upstream returns before checking on the new solver: CLI-117121 intersection aliases are incompatible."
  }
},
  // TypeInfer.intersectionTypes.test.cpp:1438 intersect_metatable_subtypes
{
  "name": "intersect_metatable_subtypes",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        local x = setmetatable({ a = 5 }, { p = 5 })\n        local y = setmetatable({ b = \"hi\" }, { p = 5, q = \"hi\" })\n        local z = setmetatable({ a = 5, b = \"hi\" }, { p = 5, q = \"hi\" })\n\n        type X = typeof(x)\n        type Y = typeof(y)\n        type Z = typeof(z)\n\n        function f(xy: X&Y, yx: Y&X): (Z, Z)\n            return xy, yx\n        end\n\n        f(z, z)\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:1459 intersect_metatables_with_properties
{
  "name": "intersect_metatables_with_properties",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        local x = setmetatable({ a = 5 }, { p = 5 })\n        local y = setmetatable({ b = \"hi\" }, { q = \"hi\" })\n        local z = setmetatable({ a = 5, b = \"hi\" }, { p = 5, q = \"hi\" })\n\n        type X = typeof(x)\n        type Y = typeof(y)\n        type Z = typeof(z)\n\n        function f(xy: X&Y): Z\n            return xy\n        end\n\n        f(z)\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:1480 intersect_metatable_with_table
{
  "name": "intersect_metatable_with_table",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n            local x = setmetatable({ a = 5 }, { p = 5 })\n            local z = setmetatable({ a = 5, b = \"hi\" }, { p = 5 })\n\n            type X = typeof(x)\n            type Y = { b : string }\n            type Z = typeof(z)\n\n            function f(xy: X&Y, yx: Y&X): (Z, Z)\n                return xy, yx\n            end\n\n            f(z, z)\n        ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:1522 CLI-44817
{
  "name": "CLI-44817",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type X = {x: number}\n        type Y = {y: number}\n        type Z = {z: number}\n\n        type XY = {x: number, y: number}\n        type XYZ = {x:number, y: number, z: number}\n\n        function f(xy: XY, xyz: XYZ): (X&Y, X&Y&Z)\n            return xy, xyz\n        end\n\n        local xNy, xNyNz = f({x = 0, y = 0}, {x = 0, y = 0, z = 0})\n\n        local t1: XY = xNy -- Type 'X & Y' could not be converted into 'XY'\n        local t2: XY = xNyNz -- Type 'X & Y & Z' could not be converted into 'XY'\n        local t3: XYZ = xNyNz -- Type 'X & Y & Z' could not be converted into 'XYZ'\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:1546 less_greedy_unification_with_intersection_types
{
  "name": "less_greedy_unification_with_intersection_types",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local function f(t): { x: number } & { x: string }\n            local x = t.x\n            return t\n        end\n    ",
      "expect": [
        {
          "errors": 3
        },
        {
          "type": "f",
          "equals": "(never) -> { x: number } & { x: string }"
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:1569 less_greedy_unification_with_intersection_types_2
{
  "name": "less_greedy_unification_with_intersection_types_2",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local function f(t: { x: number } & { x: string })\n            return t.x\n        end\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "f",
          "equals": "({ x: number } & { x: string }) -> never"
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:1587 index_property_table_intersection_1
{
  "name": "index_property_table_intersection_1",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\ntype Foo = {\n\tBar: string,\n} & { Baz: number }\n\nfunction f(x: Foo)\n    return x.Bar\nend\n    ",
      "expect": [
        {
          "errors": 0
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:1604 index_property_table_intersection_2
{
  "name": "index_property_table_intersection_2",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        type Foo = {\n            Bar: string,\n        } & { Baz: number }\n\n        function f(x: Foo)\n            return x[\"Bar\"]\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:1621 cli_80596_simplify_degenerate_intersections
{
  "name": "cli_80596_simplify_degenerate_intersections",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A = {\n            x: number?,\n        }\n\n        type B = {\n            x: number?,\n        }\n\n        type C = A & B\n\n        function f(obj: C): number\n            return obj.x or 3\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:1644 cli_80596_simplify_more_realistic_intersections
{
  "name": "cli_80596_simplify_more_realistic_intersections",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A = {\n            x: number?,\n            y: string?,\n        }\n\n        type B = {\n            x: number?,\n            z: string?,\n        }\n\n        type C = A & B\n\n        function f(obj: C): number\n            return obj.x or 3\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:1669 narrow_intersection_nevers
{
  "name": "narrow_intersection_nevers",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        local function foo(player: Player?)\n            if player and player.Character then\n                print(player.Character)\n            end\n        end\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "typeAt": [
            3,
            23
          ],
          "equals": "Player & { read Character: ~(false?) }"
        }
      ],
      "definitions": [
        "\n        declare extern type Player with\n            Character: unknown\n        end\n    "
      ]
    }
  ]
},
  // TypeInfer.intersectionTypes.test.cpp:1689 bounds_propagate_into_free_intersection_bounds
{
  "name": "bounds_propagate_into_free_intersection_bounds",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        local function f<T>(a: T & string): T\n            return a\n        end\n\n        local b = f(\"hello\")\n        local c = f((\"world\" :: string))\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "b",
          "equals": "string"
        },
        {
          "type": "c",
          "equals": "string"
        }
      ]
    }
  ]
},
]);
