// Luau upstream 7d5f73364fdbbaa984fa545071630eba73cfea98, tests/TypeInfer.generics.test.cpp
import { portUpstreamFile } from "./portedCases";

portUpstreamFile("TypeInfer.generics.test.cpp", [
  // TypeInfer.generics.test.cpp:19 check_generic_function
{
  "name": "check_generic_function",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function id<a>(x:a): a\n            return x\n        end\n        local x: string = id(\"hi\")\n        local y: number = id(37)\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "x",
          "equals": "string"
        },
        {
          "type": "y",
          "equals": "number"
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:33 check_generic_local_function
{
  "name": "check_generic_local_function",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local function id<a>(x:a): a\n            return x\n        end\n        local x: string = id(\"hi\")\n        local y: number = id(37)\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "x",
          "equals": "string"
        },
        {
          "type": "y",
          "equals": "number"
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:47 check_generic_local_function2
{
  "name": "check_generic_local_function2",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local function id<a>(x:a): a\n            return x\n        end\n        local x = id(\"hi\")\n        local y = id(37)\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "x",
          "equals": "string"
        },
        {
          "type": "y",
          "equals": "number"
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:61 unions_and_generics
{
  "name": "unions_and_generics",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type foo = <T>(T | {T}) -> T\n        local foo = (nil :: any) :: foo\n\n        type Test = number | {number}\n        local res = foo(1 :: Test)\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "res",
          "equals": "number"
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:79 check_generic_typepack_function
{
  "name": "check_generic_typepack_function",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function id<a...>(...: a...): (a...) return ... end\n        local x: string, y: boolean = id(\"hi\", true)\n        local z: number = id(37)\n        id()\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:90 types_before_typepacks
{
  "name": "types_before_typepacks",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f<a,b...>() end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:98 local_vars_can_be_polytypes
{
  "name": "local_vars_can_be_polytypes",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local function id<a>(x:a):a return x end\n        local f: <a>(a)->a = id\n        local x: string = f(\"hi\")\n        local y: number = f(37)\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:109 inferred_local_vars_can_be_polytypes
{
  "name": "inferred_local_vars_can_be_polytypes",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        local function id(x) return x end\n        print(\"This is bogus\") -- TODO: CLI-39916\n        local f = id\n        local x: string = f(\"hi\")\n        local y: number = f(37)\n    ",
      "expect": [
        {
          "errors": 0
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.generics.test.cpp:124 local_vars_can_be_instantiated_polytypes
{
  "name": "local_vars_can_be_instantiated_polytypes",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        local function id(x) return x end\n        print(\"This is bogus\") -- TODO: CLI-39916\n        local f: (number)->number = id\n        local g: (string)->string = id\n    ",
      "expect": [
        {
          "errors": 0
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.generics.test.cpp:138 properties_can_be_polytypes
{
  "name": "properties_can_be_polytypes",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local t = {}\n        t.m = function<a>(x: a):a return x end\n        local x: string = t.m(\"hi\")\n        local y: number = t.m(37)\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:149 properties_can_be_instantiated_polytypes
{
  "name": "properties_can_be_instantiated_polytypes",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local t: { m: (number)->number } = { m = function(x:number) return x+1 end }\n        local function id<a>(x:a):a return x end\n        t.m = id\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:159 check_nested_generic_function
{
  "name": "check_nested_generic_function",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local function f()\n            local function id<a>(x:a): a\n                return x\n            end\n            local x: string = id(\"hi\")\n            local y: number = id(37)\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:173 check_recursive_generic_function
{
  "name": "check_recursive_generic_function",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local function id<a>(x:a):a\n            local y: string = id(\"hi\")\n            local z: number = id(37)\n            return x\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:185 check_mutual_generic_functions
{
  "name": "check_mutual_generic_functions",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function id1<a>(x:a):a\n            local y: string = id2(\"hi\")\n            local z: number = id2(37)\n            return x\n        end\n\n        function id2<a>(x:a):a\n            local y: string = id1(\"hi\")\n            local z: number = id1(37)\n            return x\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:203 check_mutual_generic_functions_unannotated
{
  "name": "check_mutual_generic_functions_unannotated",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function id1(x)\n            local y: string = id2(\"hi\")\n            local z: number = id2(37)\n            return x\n        end\n\n        function id2(x)\n            local y: string = id1(\"hi\")\n            local z: number = id1(37)\n            return x\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.generics.test.cpp:227 check_mutual_generic_functions_errors
{
  "name": "check_mutual_generic_functions_errors",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function id1(x)\n            local y: string = id2(37) -- odd\n            local z: number = id2(\"hi\") -- even\n            return x\n        end\n\n        function id2(x)\n            local y: string = id1(37) -- odd\n            local z: number = id1(\"hi\") -- even\n            return x\n        end\n    ",
      "expect": [
        {
          "errors": 4
        },
        {
          "error": 0,
          "code": "TypeMismatch",
          "fields": {
            "wantedType": "string",
            "givenType": "number"
          }
        },
        {
          "error": 1,
          "code": "TypeMismatch",
          "fields": {
            "wantedType": "number",
            "givenType": "string"
          }
        },
        {
          "error": 2,
          "code": "TypeMismatch",
          "fields": {
            "wantedType": "string",
            "givenType": "number"
          }
        },
        {
          "error": 3,
          "code": "TypeMismatch",
          "fields": {
            "wantedType": "number",
            "givenType": "string"
          }
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.generics.test.cpp:269 generic_functions_in_types
{
  "name": "generic_functions_in_types",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type T = { id: <a>(a) -> a }\n        local x: T = { id = function<a>(x:a):a return x end }\n        local y: string = x.id(\"hi\")\n        local z: number = x.id(37)\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:280 generic_factories
{
  "name": "generic_factories",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type T<a> = { id: (a) -> a }\n        type Factory = { build: <a>() -> T<a> }\n\n        local f: Factory = {\n            build = function<a>(): T<a>\n                return {\n                    id = function(x:a):a\n                        return x\n                    end\n                }\n            end\n        }\n        local y: string = f.build().id(\"hi\")\n        local z: number = f.build().id(37)\n    ",
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
  // TypeInfer.generics.test.cpp:303 factories_of_generics
{
  "name": "factories_of_generics",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type T = { id: <a>(a) -> a }\n        type Factory = { build: () -> T }\n\n        local f: Factory = {\n            build = function(): T\n                return {\n                    id = function<a>(x:a):a\n                        return x\n                    end\n                }\n            end\n        }\n        local x: T = f.build()\n        local y: string = x.id(\"hi\")\n        local z: number = x.id(37)\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:326 infer_generic_function
{
  "name": "infer_generic_function",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function id(x)\n            return x\n        end\n        local x: string = id(\"hi\")\n        local y: number = id(37)\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "id",
          "kind": "FunctionType",
          "generics": 1,
          "genericPacks": 0
        },
        {
          "type": "id",
          "path": [
            {
              "argument": 0
            }
          ],
          "sameAs": {
            "type": "id",
            "path": [
              {
                "generic": 0
              }
            ]
          }
        },
        {
          "type": "id",
          "path": [
            {
              "result": 0
            }
          ],
          "sameAs": {
            "type": "id",
            "path": [
              {
                "generic": 0
              }
            ]
          }
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.generics.test.cpp:352 infer_generic_local_function
{
  "name": "infer_generic_local_function",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local function id(x)\n            return x\n        end\n        local x: string = id(\"hi\")\n        local y: number = id(37)\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "id",
          "kind": "FunctionType",
          "generics": 1,
          "genericPacks": 0
        },
        {
          "type": "id",
          "path": [
            {
              "argument": 0
            }
          ],
          "sameAs": {
            "type": "id",
            "path": [
              {
                "generic": 0
              }
            ]
          }
        },
        {
          "type": "id",
          "path": [
            {
              "result": 0
            }
          ],
          "sameAs": {
            "type": "id",
            "path": [
              {
                "generic": 0
              }
            ]
          }
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.generics.test.cpp:378 infer_nested_generic_function
{
  "name": "infer_nested_generic_function",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local function f()\n            local function id(x)\n                return x\n            end\n            local x: string = id(\"hi\")\n            local y: number = id(37)\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:392 calling_self_generic_methods
{
  "name": "calling_self_generic_methods",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local x = {}\n        function x:id(x) return x end\n        function x:f()\n            local x: string = self:id(\"hi\")\n            local y: number = self:id(37)\n        end\n    ",
      "expect": [
        {
          "errors": "some"
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:406 infer_generic_property
{
  "name": "infer_generic_property",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local t = {}\n        t.m = function(x) return x end\n        local x: string = t.m(\"hi\")\n        local y: number = t.m(37)\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:417 function_arguments_can_be_polytypes
{
  "name": "function_arguments_can_be_polytypes",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local function f(g: <a>(a)->a)\n            local x: number = g(37)\n            local y: string = g(\"hi\")\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:428 function_results_can_be_polytypes
{
  "name": "function_results_can_be_polytypes",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local function f() : <a>(a)->a\n            local function id<a>(x:a):a return x end\n            return id\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:439 type_parameters_can_be_polytypes
{
  "name": "type_parameters_can_be_polytypes",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local function id<a>(x:a):a return x end\n        local f: <a>(a)->a = id(id)\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:448 dont_leak_generic_types
{
  "name": "dont_leak_generic_types",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local function f(y)\n            -- this will only typecheck if we infer z: any\n            -- so f: (any)->(any)\n            local z = y\n            local function id(x)\n                z = x -- this assignment is what forces z: any\n                return x\n            end\n            local x: string = id(\"hi\")\n            local y: number = id(37)\n            return z\n        end\n        -- so this assignment should fail\n        local b: boolean = f(true)\n    ",
      "expect": [
        {
          "errors": 0
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.generics.test.cpp:479 dont_leak_inferred_generic_types
{
  "name": "dont_leak_inferred_generic_types",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local function f(y)\n            local z = y\n            local function id(x)\n                z = x\n                return x\n            end\n            local x: string = id(\"hi\")\n            local y: number = id(37)\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.generics.test.cpp:505 dont_substitute_bound_types
{
  "name": "dont_substitute_bound_types",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type T = { m: <a>(a) -> T }\n        function f(t : T)\n            local x: T = t.m(37)\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:517 dont_unify_bound_types
{
  "name": "dont_unify_bound_types",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type F = <a>() -> <b>(a, b) -> a\n        type G = <b>(b, b) -> b\n        local f: F = function<a>()\n          local x\n          return function<b>(y: a, z: b): a\n            if not(x) then x = y end\n            return x\n          end\n        end\n        -- This assignment shouldn't typecheck\n        -- If it does, it means we instantiated\n        -- f as () -> <b>(X, b) -> X, then unified X to be b\n        local g: G = f()\n        -- Oh dear, if that works then the type system is unsound\n        local a : string = g(\"not a number\", \"hi\")\n        local b : number = g(5, 37)\n    ",
      "expect": [
        {
          "errors": "some"
        }
      ],
      "unparsed": {
        "defect": 1375
      }
    }
  ]
},
  // TypeInfer.generics.test.cpp:540 mutable_state_polymorphism
{
  "name": "mutable_state_polymorphism",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        --!strict\n        -- Our old friend the polymorphic identity function\n        local function id(x) return x end\n        local a: string = id(\"hi\")\n        local b: number = id(37)\n\n        -- This allows <a>(a)->a to be expressed without generic function syntax\n        type Id = typeof(id)\n\n        -- This function should have type\n        -- <a>() -> (a) -> a\n        -- not type\n        -- () -> <a>(a) -> a\n        local function ohDear(): Id\n          local y\n          function oh(x)\n            -- Returns the same x every time it's called\n            if not(y) then y = x end\n            return y\n          end\n          return oh\n        end\n\n        -- oh dear, f claims to polymorphic which it shouldn't be\n        local f: Id = ohDear()\n\n        -- the first call sets y\n        local a: string = f(\"not a number\")\n        -- so b has value \"not a number\" at run time\n        local b: number = f(37)\n    ",
      "expect": [
        {
          "errors": "some"
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:580 rank_N_types_via_typeof
{
  "name": "rank_N_types_via_typeof",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        --!strict\n        local function id(x) return x end\n        local x: string = id(\"hi\")\n        local y: number = id(37)\n        -- This allows <a>(a)->a to be expressed without generic function syntax\n        type Id = typeof(id)\n        -- The rank 1 restriction causes this not to typecheck, since it's\n        -- declared as returning a polytype.\n        local function returnsId(): Id\n          return id\n        end\n        -- So this won't typecheck\n        local f: Id = returnsId()\n        local a: string = f(\"hi\")\n        local b: number = f(37)\n    ",
      "expect": [
        {
          "errors": 0
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.generics.test.cpp:605 duplicate_generic_types
{
  "name": "duplicate_generic_types",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f<a,a>(x:a):a return x end\n    ",
      "expect": [
        {
          "errors": 1
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:613 duplicate_generic_type_packs
{
  "name": "duplicate_generic_type_packs",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f<a...,a...>() end\n    ",
      "expect": [
        {
          "errors": 1
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:621 typepacks_before_types
{
  "name": "typepacks_before_types",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f<a...,b>() end\n    ",
      "expect": [
        {
          "errors": 1
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:629 variadic_generics
{
  "name": "variadic_generics",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f<a>(...: a) end\n\n        type F<a> = (...a) -> ...a\n    ",
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
  // TypeInfer.generics.test.cpp:640 generic_type_pack_syntax
{
  "name": "generic_type_pack_syntax",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f<a...>(...: a...): (a...) return ... end\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "f",
          "equals": "<a...>(a...) -> (a...)"
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:650 generic_type_pack_parentheses
{
  "name": "generic_type_pack_parentheses",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f<a...>(...: a...): any return (...) end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:664 better_mismatch_error_messages
{
  "name": "better_mismatch_error_messages",
  "fixture": "Fixture",
  "flags": {
    "LuauStrictVisitInstantiatedType": true
  },
  "checks": [
    {
      "source": "\n        function f<T>(...: T...)\n            return ...\n        end\n\n        function g<T...>(a: T)\n            return a\n        end\n    ",
      "expect": [
        {
          "errors": 2
        },
        {
          "error": 0,
          "code": "SwappedGenericTypeParameter"
        },
        {
          "error": 0,
          "fields": {
            "name": "T"
          }
        },
        {
          "error": 1,
          "code": "SwappedGenericTypeParameter"
        },
        {
          "error": 1,
          "fields": {
            "name": "T"
          }
        },
        {
          "error": 0,
          "fields": {
            "kind": "Pack"
          }
        },
        {
          "error": 1,
          "fields": {
            "kind": "Type"
          }
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.generics.test.cpp:693 reject_clashing_generic_and_pack_names
{
  "name": "reject_clashing_generic_and_pack_names",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f<a, a...>() end\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "code": "DuplicateGenericParameter"
        },
        {
          "error": 0,
          "fields": {
            "parameterName": "a"
          }
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:705 instantiation_sharing_types
{
  "name": "instantiation_sharing_types",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f(z)\n          local o = {}\n          o.x = o\n          o.y = {5}\n          o.z = z\n          return o\n        end\n        local o1 = f(true)\n        local x1, y1, z1 = o1.x, o1.y, o1.z\n        local o2 = f(\"hi\")\n        local x2, y2, z2 = o2.x, o2.y, o2.z\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "y1",
          "sameAs": {
            "type": "y2"
          }
        },
        {
          "type": "x1",
          "notSameAs": {
            "type": "x2"
          }
        },
        {
          "type": "z1",
          "notSameAs": {
            "type": "z2"
          }
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.generics.test.cpp:729 quantification_sharing_types
{
  "name": "quantification_sharing_types",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f(x) return {5} end\n        function g(x, y) return f(x) end\n        local z1 = f(5)\n        local z2 = g(true, \"hi\")\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "z1",
          "sameAs": {
            "type": "z2"
          }
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.generics.test.cpp:744 typefuns_sharing_types
{
  "name": "typefuns_sharing_types",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type T<a> = { x: {a}, y: {number} }\n        local o1: T<boolean> = { x = {true}, y = {5} }\n        local x1, y1 = o1.x, o1.y\n        local o2: T<string> = { x = {\"hi\"}, y = {37} }\n        local x2, y2 = o2.x, o2.y\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "y1",
          "sameAs": {
            "type": "y2"
          }
        },
        {
          "type": "x1",
          "notSameAs": {
            "type": "x2"
          }
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:759 bound_tables_do_not_clone_original_fields
{
  "name": "bound_tables_do_not_clone_original_fields",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\nlocal exports = {}\nlocal nested = {}\n\nnested.name = function(t, k)\n    local a = t.x.y\n    return rawget(t, k)\nend\n\nexports.nested = nested\nreturn exports\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:777 instantiated_function_argument_names_old_solver
{
  "name": "instantiated_function_argument_names_old_solver",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local function f<T, U...>(a: T, ...: U...) end\n\n        f(1, 2, 3)\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "typeAt": [
            3,
            8
          ]
        },
        {
          "typeAt": [
            3,
            8
          ],
          "equals": "(a: number, number, number) -> ()"
        }
      ]
    }
  ],
  "skip": {
    "newSolver": "does not pass on Luau's new solver upstream"
  }
},
  // TypeInfer.generics.test.cpp:796 error_detailed_function_mismatch_generic_types
{
  "name": "error_detailed_function_mismatch_generic_types",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\ntype C = () -> ()\ntype D = <T>() -> ()\n\nlocal c: C\nlocal d: D = c\n    ",
      "expect": [
        {
          "errors": 2
        },
        {
          "error": 0,
          "code": "GenericTypeCountMismatch"
        },
        {
          "error": 0,
          "fields": {
            "subTyGenericCount": 1
          }
        },
        {
          "error": 0,
          "fields": {
            "superTyGenericCount": 0
          }
        },
        {
          "error": 1,
          "code": "TypeMismatch"
        },
        {
          "error": 1,
          "fields": {
            "givenType": "() -> ()"
          }
        },
        {
          "error": 1,
          "fields": {
            "wantedType": "<T>() -> ()"
          }
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:827 generic_function_mismatch_with_argument
{
  "name": "generic_function_mismatch_with_argument",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\ntype C = (number) -> ()\ntype D = <T>(number) -> ()\n\nlocal c: C\nlocal d: D = c\n    ",
      "expect": [
        {
          "errors": 2
        },
        {
          "error": 0,
          "code": "GenericTypeCountMismatch"
        },
        {
          "error": 0,
          "fields": {
            "subTyGenericCount": 1
          }
        },
        {
          "error": 0,
          "fields": {
            "superTyGenericCount": 0
          }
        },
        {
          "error": 1,
          "code": "TypeMismatch"
        },
        {
          "error": 1,
          "fields": {
            "givenType": "(number) -> ()"
          }
        },
        {
          "error": 1,
          "fields": {
            "wantedType": "<T>(number) -> ()"
          }
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:859 error_detailed_function_mismatch_generic_pack
{
  "name": "error_detailed_function_mismatch_generic_pack",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\ntype C = () -> ()\ntype D = <T...>() -> ()\n\nlocal c: C\nlocal d: D = c\n    ",
      "expect": [
        {
          "errors": 2
        },
        {
          "error": 0,
          "code": "GenericTypePackCountMismatch"
        },
        {
          "error": 0,
          "fields": {
            "subTyGenericPackCount": 1
          }
        },
        {
          "error": 0,
          "fields": {
            "superTyGenericPackCount": 0
          }
        },
        {
          "error": 1,
          "code": "TypeMismatch"
        },
        {
          "error": 1,
          "fields": {
            "givenType": "() -> ()"
          }
        },
        {
          "error": 1,
          "fields": {
            "wantedType": "<T...>() -> ()"
          }
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:891 generic_functions_dont_cache_type_parameters
{
  "name": "generic_functions_dont_cache_type_parameters",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n-- See https://github.com/luau-lang/luau/issues/332\n-- This function has a type parameter with the same name as clones,\n-- so if we cache type parameter names for functions these get confused.\n-- function id<Z>(x : Z) : Z\nfunction id<X>(x : X) : X\n  return x\nend\n\nfunction clone<X, Y>(dict: {[X]:Y}): {[X]:Y}\n  local copy = {}\n  for k, v in pairs(dict) do\n    copy[k] = v\n  end\n  return copy\nend\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:914 generic_functions_should_be_memory_safe
{
  "name": "generic_functions_should_be_memory_safe",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n--!strict\n-- At one point this produced a UAF\ntype T<a> = { a: U<a>, b: a }\ntype U<a> = { c: T<a>?, d : a }\nlocal x: T<number> = { a = { c = nil, d = 5 }, b = 37 }\nx.a.c = x\nlocal y: T<string> = { a = { c = nil, d = 5 }, b = 37 }\ny.a.c = y\n    ",
      "expect": [
        {
          "errors": 2
        },
        {
          "error": 0,
          "code": "TypeMismatch"
        },
        {
          "error": 1,
          "code": "TypeMismatch"
        },
        {
          "error": 0,
          "location": [
            7,
            42,
            7,
            43
          ]
        },
        {
          "error": 0,
          "fields": {
            "givenType": "number"
          }
        },
        {
          "error": 0,
          "fields": {
            "wantedType": "string"
          }
        },
        {
          "error": 1,
          "location": [
            7,
            51,
            7,
            53
          ]
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
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:955 generic_type_pack_unification1
{
  "name": "generic_type_pack_unification1",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n--!strict\ntype Dispatcher = {\n\tuseMemo: <T...>(create: () -> T...) -> T...\n}\n\nlocal TheDispatcher: Dispatcher = {\n\tuseMemo = function<U...>(create: () -> U...): U...\n\t\treturn create()\n\tend\n}\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:973 generic_type_pack_unification2
{
  "name": "generic_type_pack_unification2",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n--!strict\ntype Dispatcher = {\n\tuseMemo: <T...>(create: () -> T...) -> T...\n}\n\nlocal TheDispatcher: Dispatcher = {\n\tuseMemo = function(create)\n\t\treturn create()\n\tend\n}\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:991 generic_type_pack_unification3
{
  "name": "generic_type_pack_unification3",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n--!strict\ntype Dispatcher = {\n\tuseMemo: <S,T...>(arg: S, create: (S) -> T...) -> T...\n}\n\nlocal TheDispatcher: Dispatcher = {\n\tuseMemo = function<T,U...>(arg: T, create: (T) -> U...): U...\n\t\treturn create(arg)\n\tend\n}\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:1009 generic_argument_count_too_few
{
  "name": "generic_argument_count_too_few",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\nfunction test(a: number)\n    return 1\nend\n\nfunction wrapper<A...>(f: (A...) -> number, ...: A...)\nend\n\nwrapper(test)\n    ",
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
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.generics.test.cpp:1037 generic_argument_count_too_many
{
  "name": "generic_argument_count_too_many",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\nfunction test2(a: number, b: string)\n    return 1\nend\n\nfunction wrapper<A...>(f: (A...) -> number, ...: A...)\nend\n\nwrapper(test2, 1, \"\", 3)\n    ",
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
            "expected": 3
          }
        },
        {
          "error": 0,
          "fields": {
            "actual": 4
          }
        },
        {
          "error": 0,
          "fields": {
            "context": "Arg"
          }
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.generics.test.cpp:1065 generic_argument_count_just_right
{
  "name": "generic_argument_count_just_right",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\nfunction test2(a: number, b: string)\n    return 1\nend\n\nfunction wrapper<A...>(f: (A...) -> number, ...: A...)\nend\n\nwrapper(test2, 1, \"\")\n    ",
      "expect": [
        {
          "errors": 0
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.generics.test.cpp:1083 generic_argument_pack_type_inferred_from_return
{
  "name": "generic_argument_pack_type_inferred_from_return",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function test2(a: number)\n            return \"hello\"\n        end\n\n        function wrapper<A...>(f: (number) -> A..., ...: A...)\n        end\n\n        wrapper(test2, 1)\n    ",
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
            "givenType": "number"
          }
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.generics.test.cpp:1113 generic_argument_pack_type_inferred_from_return_no_error
{
  "name": "generic_argument_pack_type_inferred_from_return_no_error",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\nfunction test2(a: number)\n    return \"hello\"\nend\n\nfunction wrapper<A...>(f: (number) -> A..., ...: A...)\nend\n\nwrapper(test2, \"hello\")\n    ",
      "expect": [
        {
          "errors": 0
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.generics.test.cpp:1131 nested_generic_argument_type_packs
{
  "name": "nested_generic_argument_type_packs",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\nfunction test2(a: number)\n    return 3\nend\n\nfunction foo<B...>(f: (B...) -> number, ...: B...)\n    return f(...)\nend\n\n-- want A... to contain a generic type pack too\n\nfunction wrapper<A...>(f: (A...) -> number, ...: A...)\nend\n\n-- A... = ((B...) -> number, B...))\n-- B... = (number)\n-- A... = ((number) -> number, number)\nwrapper(foo, test2, 3) -- ok\nwrapper(foo, test2, 3, 3) -- not ok (too many args)\nwrapper(foo, test2) -- not ok (not enough args)\nwrapper(foo, test2, \"3\") -- not ok (type mismatch, string instead of number)\n    ",
      "expect": [
        {
          "errors": 3
        },
        {
          "error": 0,
          "location": [
            18,
            0,
            18,
            7
          ]
        },
        {
          "error": 0,
          "code": "CountMismatch"
        },
        {
          "error": 0,
          "fields": {
            "expected": 3
          }
        },
        {
          "error": 0,
          "fields": {
            "actual": 4
          }
        },
        {
          "error": 0,
          "fields": {
            "context": "Arg"
          }
        },
        {
          "error": 1,
          "location": [
            19,
            0,
            19,
            7
          ]
        },
        {
          "error": 1,
          "code": "CountMismatch"
        },
        {
          "error": 1,
          "fields": {
            "expected": 3
          }
        },
        {
          "error": 1,
          "fields": {
            "actual": 2
          }
        },
        {
          "error": 1,
          "fields": {
            "context": "Arg"
          }
        },
        {
          "error": 2,
          "location": [
            20,
            20,
            20,
            23
          ]
        },
        {
          "error": 2,
          "code": "TypeMismatch"
        },
        {
          "error": 2,
          "fields": {
            "wantedType": "number"
          }
        },
        {
          "error": 2,
          "fields": {
            "givenType": "string"
          }
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.generics.test.cpp:1189 generic_function
{
  "name": "generic_function",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function id(x) return x end\n        local a = id(55)\n        local b = id(nil)\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "id",
          "equals": "<T>(T) -> T"
        },
        {
          "type": "a",
          "equals": "number"
        },
        {
          "type": "b",
          "equals": "nil"
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.generics.test.cpp:1206 generic_table_method
{
  "name": "generic_table_method",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local T = {}\n\n        function T:bar(i)\n            return i\n        end\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "T",
          "kind": "TableType",
          "hasProperty": [
            "bar"
          ]
        },
        {
          "type": "T",
          "path": [
            {
              "property": "bar"
            }
          ],
          "kind": "FunctionType"
        },
        {
          "type": "T",
          "path": [
            {
              "property": "bar"
            },
            {
              "argument": 1
            }
          ],
          "kind": "GenericType"
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.generics.test.cpp:1239 correctly_instantiate_polymorphic_member_functions
{
  "name": "correctly_instantiate_polymorphic_member_functions",
  "fixture": "Fixture",
  "flags": {
    "DebugLuauAssertOnForcedConstraint": true
  },
  "checks": [
    {
      "source": "\n        local T = {}\n\n        function T:foo()\n            return T:bar(5)\n        end\n\n        function T:bar(i)\n            return i\n        end\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "T",
          "kind": "TableType",
          "hasProperty": [
            "foo"
          ]
        },
        {
          "type": "T",
          "path": [
            {
              "property": "foo"
            }
          ],
          "kind": "FunctionType"
        },
        {
          "type": "T",
          "path": [
            {
              "property": "foo"
            },
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
  // TypeInfer.generics.test.cpp:1288 instantiate_cyclic_generic_function
{
  "name": "instantiate_cyclic_generic_function",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f(o)\n            o:method()\n        end\n\n        function g(o)\n            f(o)\n        end\n    ",
      "expect": [
        {
          "type": "g",
          "kind": "FunctionType"
        },
        {
          "type": "g",
          "path": [
            {
              "argument": 0
            }
          ],
          "kind": "TableType",
          "hasProperty": [
            "method"
          ]
        },
        {
          "type": "g",
          "path": [
            {
              "argument": 0
            },
            {
              "property": "method"
            }
          ],
          "kind": "FunctionType"
        },
        {
          "type": "g",
          "path": [
            {
              "argument": 0
            },
            {
              "property": "method"
            },
            {
              "argument": 0
            }
          ],
          "sameAs": {
            "type": "g",
            "path": [
              {
                "argument": 0
              }
            ]
          }
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:1324 instantiate_generic_function_in_assignments
{
  "name": "instantiate_generic_function_in_assignments",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function foo(a, b)\n            return a(b)\n        end\n\n        function bar()\n            local c: ((number)->number, number)->number = foo -- no error\n            c = foo -- no error\n            local d: ((number)->number, string)->number = foo -- error from arg 2 (string) not being convertible to number from the call a(b)\n        end\n    ",
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
            "wantedType": "((number) -> number, string) -> number"
          }
        },
        {
          "error": 0,
          "fields": {
            "givenType": "<T, U...>((T) -> (U...), T) -> (U...)"
          }
        },
        {
          "error": 0,
          "fields": {
            "givenType": "((number) -> number, number) -> number"
          }
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.generics.test.cpp:1355 instantiate_generic_function_in_assignments2
{
  "name": "instantiate_generic_function_in_assignments2",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function foo(a, b)\n            return a(b)\n        end\n\n        function bar()\n            local _: (string, string)->number = foo -- string cannot be converted to (string)->number\n        end\n    ",
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
            "wantedType": "(string, string) -> number"
          }
        },
        {
          "error": 0,
          "fields": {
            "givenType": "<T, U...>((T) -> (U...), T) -> (U...)"
          }
        },
        {
          "error": 0,
          "fields": {
            "givenType": "((string) -> number, string) -> number"
          }
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.generics.test.cpp:1384 self_recursive_instantiated_param
{
  "name": "self_recursive_instantiated_param",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\ntype Table = { a: number }\ntype Self<T> = T\nlocal a: Self<Table>\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "a",
          "equals": "Table<Table>"
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:1400 no_stack_overflow_from_quantifying
{
  "name": "no_stack_overflow_from_quantifying",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function _(l0:t0): (any, ()->())\n        end\n\n        type t0 = t0 | {}\n    ",
      "expect": [
        {
          "errors": "some"
        },
        {
          "alias": "t0"
        },
        {
          "alias": "t0",
          "equals": "any"
        },
        {
          "anyError": "OccursCheckFailed"
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:1429 infer_generic_function_function_argument
{
  "name": "infer_generic_function_function_argument",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n            local function sum<a>(x: a, y: a, f: (a, a) -> add<a>)\n                return f(x, y)\n            end\n            return sum(2, 3, function<T>(a: T, b: T): add<T> return a + b end)\n        ",
      "expect": [
        {
          "errors": 0
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.generics.test.cpp:1459 infer_generic_function_function_argument_2
{
  "name": "infer_generic_function_function_argument_2",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        local function map<a, b>(arr: {a}, f: (a) -> b): {b}\n            local r = {}\n            for i,v in ipairs(arr) do\n                table.insert(r, f(v))\n            end\n            return r\n        end\n        local a = {1, 2, 3}\n        local r = map(a, function(a: number) return a + a > 100 end)\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "r",
          "equals": "{boolean}"
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:1477 infer_generic_function_function_argument_3
{
  "name": "infer_generic_function_function_argument_3",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        local function foldl<a, b>(arr: {a}, init: b, f: (b, a) -> b)\n            local r = init\n            for i,v in ipairs(arr) do\n                r = f(r, v)\n            end\n            return r\n        end\n        local a = {1, 2, 3}\n        local r = foldl(a, {s=0,c=0}, function(a: {s: number, c: number}, b: number) return {s = a.s + b, c = a.c + 1} end)\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "r",
          "equals": "{ c: number, s: number } | { c: number, s: number }"
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.generics.test.cpp:1500 infer_generic_function_function_argument_overloaded_pt_1
{
  "name": "infer_generic_function_function_argument_overloaded_pt_1",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local g12: (<T>(T, (T) -> T) -> T) & (<T>(T, T, (T, T) -> T) -> T)\n\n        local a = g12(1, function(x) return x + x end)\n        local b = g12(1, 2, function(x, y) return x + y end)\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "type": "a",
          "equals": "number | number"
        },
        {
          "type": "b",
          "equals": "add<unknown, unknown> | number"
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:1524 infer_generic_function_function_overloaded_pt_2
{
  "name": "infer_generic_function_function_overloaded_pt_2",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local g12: (<T>(T, (T) -> T) -> T) & (<T>(T, T, (T, T) -> T) -> T)\n\n        local a = g12({x=1}, function(x) return {x=-x.x} end)\n        local b = g12({x=1}, {x=2}, function(x, y) return {x=x.x + y.x} end)\n    ",
      "expect": [
        {
          "errors": 2
        },
        {
          "type": "a",
          "equals": "{ x: number } | { x: unm<unknown> }"
        },
        {
          "type": "b",
          "equals": "{ x: add<unknown, unknown> } | { x: number } | { x: number }"
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:1548 do_not_infer_generic_functions
{
  "name": "do_not_infer_generic_functions",
  "fixture": "BuiltinsFixture",
  "flags": {
    "LuauRemovePrimitiveTypeConstraintAndSubtypingUnifier": true
  },
  "checks": [
    {
      "source": "\n            local function sum<T>(x: T, y: T, z: (T, T) -> T) return z(x, y) end\n\n            local function sumrec(f: typeof(sum))\n                return sum(2, 3, function<X>(g: X, h: X): add<X, X> return g + h end)\n            end\n\n            local b = sumrec(sum) -- ok\n            local c = sumrec(\n                function(d, e, f)\n                    return f(d, e)\n                end\n            ) -- type binders are not inferred\n        ",
      "expect": [
        {
          "type": "b",
          "equals": "number | number"
        },
        {
          "type": "sum",
          "equals": "<T>(T, T, (T, T) -> T) -> T"
        },
        {
          "typeAt": [
            7,
            29
          ],
          "equals": "<T>(T, T, (T, T) -> T) -> T"
        },
        {
          "errors": 0
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.generics.test.cpp:1597 do_not_infer_generic_functions_2
{
  "name": "do_not_infer_generic_functions_2",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        type t = <a>(a, a, (a, a) -> a) -> a\n        type u = (number, number, <X>(X, X) -> X) -> number\n\n        local foo = (nil :: any) :: t\n        local bar : u = foo\n        ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:1612 substitution_with_bound_table
{
  "name": "substitution_with_bound_table",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A = { x: number }\n        local a: A = { x = 1 }\n        local b = a\n        type B = typeof(b)\n        type X<T> = T\n        local c: X<B>\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:1626 apply_type_function_nested_generics1
{
  "name": "apply_type_function_nested_generics1",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        --!strict\n        type MyObject = {\n            getReturnValue: <V>(cb: () -> V) -> V\n        }\n        local object: MyObject = {\n            getReturnValue = function<U>(cb: () -> U): U\n                return cb()\n            end,\n        }\n\n        type ComplexObject<T> = {\n            id: T,\n            nested: MyObject\n        }\n\n        local complex: ComplexObject<string> = {\n            id = \"Foo\",\n            nested = object,\n        }\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:1654 apply_type_function_nested_generics2
{
  "name": "apply_type_function_nested_generics2",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n--!strict\ntype MyObject = {\n\tgetReturnValue: <V>(cb: () -> V) -> V\n}\ntype ComplexObject<T> = {\n\tid: T,\n\tnested: MyObject\n}\n\nfunction f(complex: ComplexObject<string>)\n    local x = complex.nested.getReturnValue(function(): string\n        return \"\"\n    end)\n\n    local y = complex.nested.getReturnValue(function()\n        return 3\n    end)\nend\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:1681 apply_type_function_nested_generics3
{
  "name": "apply_type_function_nested_generics3",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local getReturnValue: <V>(cb: () -> V) -> V = nil :: any\n\n        local y = getReturnValue(function() return nil :: any end)\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:1695 quantify_functions_with_no_generics
{
  "name": "quantify_functions_with_no_generics",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function foo(f, x)\n            return f(x)\n        end\n    ",
      "expect": [
        {
          "type": "foo",
          "equals": "<T, U...>((T) -> (U...), T) -> (U...)"
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:1706 quantify_functions_even_if_they_have_an_explicit_generic
{
  "name": "quantify_functions_even_if_they_have_an_explicit_generic",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function foo<X>(f, x: X)\n            return f(x)\n        end\n    ",
      "expect": [
        {
          "type": "foo",
          "equals": "<X, T...>((X) -> (T...), X) -> (T...)"
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:1717 no_extra_quantification_for_generic_functions
{
  "name": "no_extra_quantification_for_generic_functions",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function foo<X, Y>(f : (X) -> Y, x: X)\n            return f(x)\n        end\n    ",
      "expect": [
        {
          "type": "foo",
          "equals": "<X, Y>((X) -> Y, X) -> Y"
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:1728 do_not_always_instantiate_generic_intersection_types
{
  "name": "do_not_always_instantiate_generic_intersection_types",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        --!strict\n        type Array<T> = { [number]: T }\n\n        type Array_Statics = {\n            new: <T>() -> Array<T>,\n        }\n\n        local _Arr : Array<any> & Array_Statics = {} :: Array_Statics\n    ",
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
  // TypeInfer.generics.test.cpp:1745 hof_subtype_instantiation_regression
{
  "name": "hof_subtype_instantiation_regression",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n--!strict\n\nlocal function defaultSort<T>(a: T, b: T)\n    return true\nend\ntype A = any\nreturn function<T>(array: {T}): {T}\n    table.sort(array, defaultSort)\n    return array\nend\n    ",
      "expect": [
        {
          "errors": 0
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.generics.test.cpp:1765 higher_rank_polymorphism_should_not_accept_instantiated_arguments
{
  "name": "higher_rank_polymorphism_should_not_accept_instantiated_arguments",
  "fixture": "BuiltinsFixture",
  "flags": {
    "LuauInstantiateInSubtyping": true
  },
  "checks": [
    {
      "source": "\n--!strict\n\nlocal function instantiate(f: <a>(a) -> a): (number) -> number\n    return f\nend\n\ninstantiate(function(x: string) return \"foo\" end)\n    ",
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
            "wantedType": "<a>(a) -> a"
          }
        },
        {
          "error": 0,
          "fields": {
            "givenType": "<a>(string) -> string"
          }
        }
      ]
    }
  ],
  "skip": {
    "newSolver": "does not pass on Luau's new solver upstream"
  }
},
  // TypeInfer.generics.test.cpp:1792 bidirectional_checking_and_generalization_play_nice
{
  "name": "bidirectional_checking_and_generalization_play_nice",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local foo = function(a)\n            return a()\n        end\n\n        local a = foo(function() return 1 end)\n        local b = foo(function() return \"bar\" end)\n    ",
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
  // TypeInfer.generics.test.cpp:1809 generalization_no_cyclic_intersections
{
  "name": "generalization_no_cyclic_intersections",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        local f, t, n = pairs({\"foo\"})\n        local k, v = f(t)\n    ",
      "expect": [
        {
          "type": "f",
          "equals": "({string}, number?) -> (number?, string)"
        },
        {
          "type": "t",
          "equals": "{string}"
        },
        {
          "type": "k",
          "equals": "number?"
        },
        {
          "type": "v",
          "equals": "string"
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:1822 missing_generic_type_parameter
{
  "name": "missing_generic_type_parameter",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f(x: T): T return x end\n    ",
      "expect": [
        {
          "errors": 2
        },
        {
          "error": 0,
          "code": "UnknownSymbol"
        },
        {
          "error": 1,
          "code": "UnknownSymbol"
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:1834 generic_implicit_explicit_name_clash
{
  "name": "generic_implicit_explicit_name_clash",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function apply<a>(func, argument: a)\n            return func(argument)\n        end\n    ",
      "expect": [
        {
          "type": "apply",
          "equals": "<a, T...>((a) -> (T...), a) -> (T...)"
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:1847 generic_type_functions_work_in_subtyping
{
  "name": "generic_type_functions_work_in_subtyping",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        local function addOne<T>(x: T): add<T, number> return x + 1 end\n\n        local function six(): number\n            return addOne(5)\n        end\n    ",
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
  // TypeInfer.generics.test.cpp:1865 generic_type_subtyping_nested_bounds_with_new_mappings
{
  "name": "generic_type_subtyping_nested_bounds_with_new_mappings",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\ntype Dispatch<A> = (A) -> ()\ntype BasicStateAction<S> = ((S) -> S) | S\n\nfunction updateReducer<S, I, A>(reducer: (S, A) -> S, initialArg: I, init: ((I) -> S)?): (S, Dispatch<A>)\n    return 1 :: any, 2 :: any\nend\n\nfunction basicStateReducer<S>(state: S, action: BasicStateAction<S>): S\n    return action\nend\n\nfunction updateState<S>(initialState: (() -> S) | S): (S, Dispatch<BasicStateAction<S>>)\n    return updateReducer(basicStateReducer, initialState)\nend\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:1892 generic_type_packs_shouldnt_be_bound_to_themselves
{
  "name": "generic_type_packs_shouldnt_be_bound_to_themselves",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\nexport type t1<T...> = {\n    foo: (self: t1<T...>, bar: (T...) -> ()) -> ()\n}\n\nexport type t2<T...> = {\n    baz: (self: t2<T...>) -> t1<T...>,\n}\n\nexport type t3<T...> = {\n    f: (self: t3<T...>, T...)->  (),\n    g: t1<T...>,\n    h: t1<(Player, T...)>\n}\n\nlocal t2 = {}\n\nfunction t2.new<T...>(): t2<T...>\nend\n\nlocal function create_t3<T...>(): t3<T...>\n    local t2_1 = t2.new()\n    local t2_2 = t2.new()\n    local my_t3 = {\n        f = function(_self: t3<T...>, ...: T...) end,\n        g = t2_1:baz(),\n        h = t2_2:baz()\n    }\n    return my_t3\nend\n    ",
      "expect": [
        {
          "errors": 2
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:1934 follow_bound_type_packs_in_generic_type_visitor
{
  "name": "follow_bound_type_packs_in_generic_type_visitor",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\nfunction (_(_,_,nil))\n(if l0 then typeof else `{_:_()}`,typeof).n0<A...,A...>(l0)\nfunction _:_():typeof<A...>()\nend\nfunction _:_().typeof<A...>()\nend\nend\n    ",
      "expect": [],
      "malformed": "Pinned Luau parser reports 26 syntax errors; upstream only requires checking this malformed fuzzer source not to crash."
    }
  ]
},
  // TypeInfer.generics.test.cpp:1948 generic_packs_in_contravariant_position
{
  "name": "generic_packs_in_contravariant_position",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\nfunction f<A>(foo: (A) -> ()): () end\nfunction g<B...>(...: B...): () end\nf(g)\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:1959 generic_packs_in_contravariant_position_2
{
  "name": "generic_packs_in_contravariant_position_2",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\nfunction f(foo: (number) -> (number)): () end\ntype T = <A...>(A...) -> A...\nlocal t: T\nf(t)\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:1971 generic_packs_in_contravariant_position_3
{
  "name": "generic_packs_in_contravariant_position_3",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\nfunction f(foo: <B...>(B...) -> B...): () end\ntype T = <A...>(A...) -> A...\nlocal t: T\nf(t)\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:1983 generic_packs_in_contravariant_position_4
{
  "name": "generic_packs_in_contravariant_position_4",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\nfunction f(foo: <A...>(A...) -> A...): () end\ntype T = <B..., C...>(B...) -> C...\nlocal t: T\nf(t)\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:1997 generic_packs_in_contravariant_position_5
{
  "name": "generic_packs_in_contravariant_position_5",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\nfunction f(foo: (number) -> number): () end\ntype T = <A...>(A...) -> number\nlocal t: T\nf(t)\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:2009 generic_packs_in_contravariant_position_6
{
  "name": "generic_packs_in_contravariant_position_6",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\nfunction f(foo: (...number) -> number): () end\ntype T = <A...>(A...) -> number\nlocal t: T\nf(t)\n    ",
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
  // TypeInfer.generics.test.cpp:2021 generic_packs_in_contravariant_position_7
{
  "name": "generic_packs_in_contravariant_position_7",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\nfunction f(foo: () -> ()): () end\ntype T = <A...>() -> A...\nlocal t: T\nf(t)\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:2033 generic_packs_in_contravariant_position_8
{
  "name": "generic_packs_in_contravariant_position_8",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\nfunction f(foo: () -> ()): () end\ntype T = <A...>(A...) -> A...\nlocal t: T\nf(t)\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:2045 nested_generic_packs
{
  "name": "nested_generic_packs",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\ntype T = <A...>(A...) -> (<A...>(A...) -> ())\ntype U = (string) -> ((number) -> ())\nlocal t: T\nlocal u: U = t\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:2059 ensure_that_invalid_generic_instantiations_error
{
  "name": "ensure_that_invalid_generic_instantiations_error",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local func: <T>(T, (T) -> ()) -> () = nil :: any\n        local foobar: (number) -> () = nil :: any\n        func({}, foobar)\n    ",
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
  // TypeInfer.generics.test.cpp:2071 ensure_that_invalid_generic_instantiations_error_1
{
  "name": "ensure_that_invalid_generic_instantiations_error_1",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        --!strict\n\n        function insert<T>(arr: {T}, value: T)\n            return arr\n        end\n\n        local a: {number} = {}\n\n        local b = insert(a, \"five\")\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "code": "TypeMismatch"
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.generics.test.cpp:2091 xpcall_should_work_with_generics
{
  "name": "xpcall_should_work_with_generics",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n--!strict\nlocal v: (number) -> (number) = nil :: any\n\nlocal x = 3\n\nxpcall(v, print, x)\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:2105 gh1985_array_of_union_for_generic
{
  "name": "gh1985_array_of_union_for_generic",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        local function clear<T>(arr: { T }) table.clear(arr) end\n        local a: { true | false }\n        -- This obviously shouldn't error, '{ true | false }' should fit '{ T }'\n        -- TypeError: The generic type parameter Twas found to have invalid bounds. Its lower bounds were [true, false], and its upper bounds were [true].\n        clear(a)\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:2118 gh1985_array_of_union_for_generic_2
{
  "name": "gh1985_array_of_union_for_generic_2",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        local function id<T>(arr: { T }): { T } return arr end\n        local a: { true | false }\n        local b = id(a)\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:2129 table_isfrozen_and_clear_work_on_any_table
{
  "name": "table_isfrozen_and_clear_work_on_any_table",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        type Array<T> = { [number]: T }\n        type Object = { [string]: any }\n\n        return function(t: Object | Array<any>)\n            if not table.isfrozen(t) then\n                table.clear(t)\n            end\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:2143 cli_179086_dont_ignore_explicit_variadics
{
  "name": "cli_179086_dont_ignore_explicit_variadics",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        --!strict\n\n        type Example<T...> = { Method: (T...) -> () }\n\n        local function CreateExample<T...>(Method: (T...) -> ()): Example<T...>\n            local self = {}\n            self.Method = Method\n            return self\n        end\n\n        local Object: Example<string> = CreateExample(function(a: string) end)\n\n        Object.Method(\"Hello World!\")\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:2162 oss_2075_generic_packs_should_not_be_dropped
{
  "name": "oss_2075_generic_packs_should_not_be_dropped",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        local function f<Return...>(callback: () -> Return...) end\n\n        f(function()\n            return 3\n        end)\n\n        local function g<Rest...>(callback: (x: string, Rest...) -> any) end\n        g(error)\n\n        type X<T...> = {\n            value: () -> T...,\n        }\n\n        local function foo<T...>(x: X<T...>) end\n\n        local function bar(x: X<string, number>)\n            foo(x)\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:2186 variadic_generics_dont_leak
{
  "name": "variadic_generics_dont_leak",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local function makeApplier<A..., R...>(f: (A...) -> (R...))\n            return function (... : A...): R...\n                f(...)\n            end\n        end\n        local function add(x: number, y: number): number return x + y end\n        local f = makeApplier(add)\n    ",
      "expect": [
        {
          "type": "f",
          "equals": "(number, number) -> number"
        }
      ]
    }
  ]
},
  // TypeInfer.generics.test.cpp:2201 id_function_do_not_leak_generic
{
  "name": "id_function_do_not_leak_generic",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local function id<T>(t: T) return t end\n        local function foo(x)\n            id(x)\n        end\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "foo",
          "equals": "(unknown) -> ()"
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.generics.test.cpp:2217 cli_185450_instantiate_generics_prior_to_pushing
{
  "name": "cli_185450_instantiate_generics_prior_to_pushing",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        export type Parent = {\n            Func1:<P...> (self: Parent, value: boolean, P...) -> (Parent?),\n            Func2: (self: Parent, value: boolean) -> (Parent?),\n        }\n\n        export type Child = {\n            Parent: Parent,\n            Func: (self: Child) -> (Child?),\n        }\n\n        local Parent = {} :: Parent\n        local Child = {} :: Child\n\n        function Parent:Func1(value, ...)\n            if value then return self else return nil end\n        end\n\n        function Parent:Func2(value)\n            if value then return self else return nil end\n        end\n\n        function Child:Func()\n            if math.random() > 0.5 then return self else return nil end\n        end\n    ",
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
