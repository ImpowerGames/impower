// Luau upstream 7d5f73364fdbbaa984fa545071630eba73cfea98, tests/TypeInfer.typeInstantiations.test.cpp
import { portUpstreamFile } from "./portedCases";

portUpstreamFile("TypeInfer.typeInstantiations.test.cpp", [
  // TypeInfer.typeInstantiations.test.cpp:18 as_expression_correct
{
  "name": "as_expression_correct",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        --!strict\n        local function f<T>(): T\n            return nil :: any\n        end\n\n        local correct = f<<number>>() + 5\n        ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.typeInstantiations.test.cpp:35 as_expression_incorrect
{
  "name": "as_expression_incorrect",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        --!strict\n        local function f<T>(): T\n            return nil :: any\n        end\n\n        local incorrect = f<<string>>() + 5\n        ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Operator '+' could not be applied to operands of types string and number; there is no corresponding overload for __add"
        }
      ]
    }
  ]
},
  // TypeInfer.typeInstantiations.test.cpp:64 as_stmt_correct
{
  "name": "as_stmt_correct",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        --!strict\n        local function f<T>(a: T, b: T)\n            return nil :: any\n        end\n\n        f<<number | string>>(1, \"a\")\n        ",
      "expect": [
        {
          "errors": 0
        }
      ],
      "ignoreMissingAnnotations": true,
      "unparsed": {
        "defect": 1376
      }
    }
  ]
},
  // TypeInfer.typeInstantiations.test.cpp:83 as_stmt_incorrect
{
  "name": "as_stmt_incorrect",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        --!strict\n        local function f<T>(a: T, b: T)\n            return nil :: any\n        end\n\n        f<<number | boolean>>(1, \"a\")\n        ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Expected this to be 'boolean | number', but got 'string'"
        }
      ],
      "ignoreMissingAnnotations": true,
      "unparsed": {
        "defect": 1376
      }
    }
  ]
},
  // TypeInfer.typeInstantiations.test.cpp:113 multiple_calls
{
  "name": "multiple_calls",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        --!strict\n        local function f<T>(): T\n            return nil :: any\n        end\n\n        local a: number = f<<number>>()\n        local b: string = f<<string>>()\n        ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.typeInstantiations.test.cpp:131 anonymous_type_inferred
{
  "name": "anonymous_type_inferred",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        --!strict\n        local function f<T, U>(): { a: T, b: U }\n            return nil :: any\n        end\n\n        local correct: { a: number, b: string } = f<<number>>()\n        local incorrect: { a: number, b: string } = f<<string>>()\n        ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "line": 7
        },
        {
          "anyError": "TypeMismatch"
        }
      ]
    }
  ]
},
  // TypeInfer.typeInstantiations.test.cpp:152 type_packs
{
  "name": "type_packs",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n    --!strict\n    local function f<T..., U...>(...: T...): U... end\n\n    local a: number, b: string = f<<(boolean, {}), (number, string)>>(true, {})\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ],
  "skip": {
    "newSolver": "Upstream explicitly forces DebugLuauForceOldSolver=true; its assertions specify only the old solver (generic pack count mismatch FIXME)."
  }
},
  // TypeInfer.typeInstantiations.test.cpp:168 type_packs_method
{
  "name": "type_packs_method",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n    --!strict\n    local t: {\n        f: <T..., U...>(self: any, T...) -> U...,\n    } = nil :: any\n\n    local a: number, b: string = t:f<<(boolean, {}), (number, string)>>(true, {})\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ],
  "skip": {
    "newSolver": "Upstream explicitly forces DebugLuauForceOldSolver=true; its assertions specify only the old solver (generic pack count mismatch FIXME)."
  }
},
  // TypeInfer.typeInstantiations.test.cpp:186 type_packs_incorrect
{
  "name": "type_packs_incorrect",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n    --!strict\n    local function f<T..., U...>(...: T...): U... end\n\n    local a: number, b: string = f<<(boolean, {}), (number, string)>>(true, \"uh oh\")\n    ",
      "expect": [
        {
          "anyError": "TypeMismatch"
        }
      ]
    }
  ],
  "skip": {
    "newSolver": "Upstream explicitly forces DebugLuauForceOldSolver=true; its assertions specify only the old solver (generic pack count mismatch FIXME)."
  }
},
  // TypeInfer.typeInstantiations.test.cpp:202 type_packs_incorrect_method
{
  "name": "type_packs_incorrect_method",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n    --!strict\n    local t: {\n        f: <T..., U...>(self: any, T...) -> U...,\n    } = nil :: any\n\n    local a: number, b: string = t:f<<(boolean, {}), (number, string)>>(true, \"uh oh\")\n    ",
      "expect": [
        {
          "anyError": "TypeMismatch"
        }
      ]
    }
  ],
  "skip": {
    "newSolver": "Upstream explicitly forces DebugLuauForceOldSolver=true; its assertions specify only the old solver (generic pack count mismatch FIXME)."
  }
},
  // TypeInfer.typeInstantiations.test.cpp:220 dot_index_call
{
  "name": "dot_index_call",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        --!strict\n        local t = {\n            f = function<T>(): T\n                return nil :: any\n            end,\n        }\n\n        local correct: number = t.f<<number>>()\n        local incorrect: number = t.f<<string>>()\n        ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "line": 9
        }
      ]
    }
  ]
},
  // TypeInfer.typeInstantiations.test.cpp:241 method_index_call
{
  "name": "method_index_call",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        --!strict\n        local t = {\n            f = function<T>(self: any): T\n                return nil :: any\n            end,\n        }\n\n        local correct: number = t:f<<number>>()\n        local incorrect: number = t:f<<string>>()\n        ",
      "expect": [
        {
          "errors": 1
        },
        {
          "anyError": "TypeMismatch"
        },
        {
          "error": 0,
          "line": 9
        }
      ]
    }
  ]
},
  // TypeInfer.typeInstantiations.test.cpp:263 stored_as_variable
{
  "name": "stored_as_variable",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        --!strict\n        local function f<T>(): T\n            return nil :: any\n        end\n\n        local fNumber = f<<number>>\n\n        local correct: number = fNumber()\n        local incorrect: string = fNumber()\n        ",
      "expect": [
        {
          "errors": 1
        },
        {
          "anyError": "TypeMismatch"
        },
        {
          "error": 0,
          "line": 9
        }
      ]
    }
  ]
},
  // TypeInfer.typeInstantiations.test.cpp:285 not_a_function
{
  "name": "not_a_function",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        --!strict\n        local oops = 3\n        local stub = oops<<number>>\n        ",
      "expect": [
        {
          "errors": 1
        },
        {
          "anyError": "InstantiateGenericsOnNonFunction"
        },
        {
          "error": 0,
          "message": "Cannot instantiate type parameters on something without type parameters."
        }
      ]
    }
  ]
},
  // TypeInfer.typeInstantiations.test.cpp:302 metatable_call
{
  "name": "metatable_call",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        --!strict\n        local t = setmetatable({}, {\n            __call = function<T>(self): T\n                return nil :: any\n            end,\n        })\n\n        t<<number>>()\n        ",
      "expect": [
        {
          "errors": 1
        },
        {
          "anyError": "InstantiateGenericsOnNonFunction"
        },
        {
          "error": 0,
          "message": "Luau does not currently support explicitly instantiating a table with a `__call` metamethod.                 You may be able to work around this by creating a function that calls the table, and using that instead."
        }
      ]
    }
  ]
},
  // TypeInfer.typeInstantiations.test.cpp:324 method_call_incomplete
{
  "name": "method_call_incomplete",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        --!strict\n        local t = {\n            f = function<T, U>(self: any): T | U\n                return nil :: any\n            end,\n        }\n\n        local correct: number | string = t:f<<number>>()\n        local incorrect: number | string = t:f<<boolean>>()\n        ",
      "expect": [
        {
          "errors": 1
        },
        {
          "anyError": "TypeMismatch"
        },
        {
          "error": 0,
          "line": 9
        }
      ]
    }
  ]
},
  // TypeInfer.typeInstantiations.test.cpp:346 too_many_provided
{
  "name": "too_many_provided",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        --!strict\n        local function f<T>() end\n\n        f<<number, string>>()\n        ",
      "expect": [
        {
          "errors": 1
        },
        {
          "anyError": "TypeInstantiationCountMismatch"
        },
        {
          "error": 0,
          "message": "Too many type parameters passed to 'f', which is typed as <T>(...any) -> (). Expected at most 1 type parameter, but 2 provided."
        }
      ]
    }
  ]
},
  // TypeInfer.typeInstantiations.test.cpp:377 too_many_provided_type_packs
{
  "name": "too_many_provided_type_packs",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        --!strict\n        local function f<T...>(): (T...) end\n\n        f<<(string, number), (true, false)>>()\n        ",
      "expect": [
        {
          "errors": 1
        },
        {
          "anyError": "TypeInstantiationCountMismatch"
        },
        {
          "error": 0,
          "message": "Too many type parameters passed to 'f', which is typed as <T...>(...any) -> (T...). Expected at most 1 type pack, but 2 provided."
        }
      ]
    }
  ]
},
  // TypeInfer.typeInstantiations.test.cpp:408 too_many_provided_method
{
  "name": "too_many_provided_method",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        --!strict\n        local t = {\n            f = function<T>(self: any) end,\n        }\n\n        t:f<<number, string>>()\n        ",
      "expect": [
        {
          "errors": 1
        },
        {
          "anyError": "TypeInstantiationCountMismatch"
        },
        {
          "error": 0,
          "line": 6
        },
        {
          "error": 0,
          "message": "Too many type parameters passed to function typed as <T>(any) -> (). Expected at most 1 type parameter, but 2 provided."
        }
      ]
    }
  ]
},
  // TypeInfer.typeInstantiations.test.cpp:442 too_many_type_packs_provided_method
{
  "name": "too_many_type_packs_provided_method",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        --!strict\n        local t = {\n            f = function<T...>(self: any): (T...) end,\n        }\n\n        t:f<<(number, string), (true, false)>>()\n        ",
      "expect": [
        {
          "errors": 1
        },
        {
          "anyError": "TypeInstantiationCountMismatch"
        },
        {
          "error": 0,
          "line": 6
        },
        {
          "error": 0,
          "message": "Too many type parameters passed to function typed as <T...>(any) -> (T...). Expected at most 1 type pack, but 2 provided."
        }
      ]
    }
  ]
},
  // TypeInfer.typeInstantiations.test.cpp:476 function_intersections
{
  "name": "function_intersections",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        --!strict\n        local f: (<T>(T) -> T) & (<T>(T?) -> T) = nil :: any\n        f<<number>>()\n        ",
      "expect": [
        {
          "errors": 1
        },
        {
          "anyError": "InstantiateGenericsOnNonFunction"
        },
        {
          "error": 0,
          "line": 3
        },
        {
          "error": 0,
          "message": "Luau does not currently support explicitly instantiating an overloaded function type."
        }
      ]
    }
  ]
},
  // TypeInfer.typeInstantiations.test.cpp:493 incomplete_type_packs
{
  "name": "incomplete_type_packs",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n            local f: <A, T...>() -> (A, T...) = nil :: any\n            local correct: string, b: number, c: boolean = f<<string>>()\n            local incorrect: number, b: number, c: boolean = f<<string>>()\n        ",
      "expect": [
        {
          "errors": 1
        },
        {
          "anyError": "TypeMismatch"
        },
        {
          "error": 0,
          "line": 3
        }
      ]
    }
  ]
},
  // TypeInfer.typeInstantiations.test.cpp:509 replacing_generic_with_generic
{
  "name": "replacing_generic_with_generic",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local foo: <A, B>() -> (A, B) = nil :: any\n\n        local function bar<T>()\n            return foo<<T, number>>()\n        end\n\n        local baz, quxx = bar<<string>>()\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "baz",
          "equals": "string"
        },
        {
          "type": "quxx",
          "equals": "number"
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.typeInstantiations.test.cpp:533 unknown_type_in_explicit_type_instantiation
{
  "name": "unknown_type_in_explicit_type_instantiation",
  "fixture": "Fixture",
  "flags": {
    "LuauStrictVisitInstantiatedType": true
  },
  "checks": [
    {
      "source": "\n        local function f<T>() end\n        f<<Typo>>()\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Unknown type 'Typo'"
        }
      ]
    }
  ]
},
  // TypeInfer.typeInstantiations.test.cpp:546 unknown_type_pack_in_explicit_type_instantiation
{
  "name": "unknown_type_pack_in_explicit_type_instantiation",
  "fixture": "Fixture",
  "flags": {
    "LuauStrictVisitInstantiatedType": true
  },
  "checks": [
    {
      "source": "\n        local function f<T...>() end\n        f<<(Typo)>>()\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Unknown type 'Typo'"
        }
      ]
    }
  ]
},
  // TypeInfer.typeInstantiations.test.cpp:559 typeof_in_method_call_type_args_no_crash
{
  "name": "typeof_in_method_call_type_args_no_crash",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local t = {}\n        function t:f<T, U>() end\n\n        local x = 5\n        globl = 42\n\n        t:f<<typeof(x), string>>()\n        t:f<<number, typeof(x)>>()\n        t:f<<typeof(globl), unknown>>()\n        t:f<<typeof(t.f), unknown>>()\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "code": "UnknownSymbol"
        }
      ]
    }
  ]
},
  // TypeInfer.typeInstantiations.test.cpp:579 typeof_local_in_type_pack_no_crash
{
  "name": "typeof_local_in_type_pack_no_crash",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local t = {}\n        function t:f<T...>() end\n\n        local x = 5\n\n        t:f<<(string, typeof(x))>>()\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
]);
