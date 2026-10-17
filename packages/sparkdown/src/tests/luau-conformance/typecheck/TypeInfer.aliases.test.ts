// Luau upstream 7d5f73364fdbbaa984fa545071630eba73cfea98, tests/TypeInfer.aliases.test.cpp
import { portUpstreamFile } from "./portedCases";

portUpstreamFile("TypeInfer.aliases.test.cpp", [
  // TypeInfer.aliases.test.cpp:21 basic_alias
{
  "name": "basic_alias",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type T = number\n        local x: T = 1\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "x",
          "equals": "number"
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:32 cyclic_function_type_in_type_alias
{
  "name": "cyclic_function_type_in_type_alias",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type F = () -> F?\n        local function f()\n            return f\n        end\n\n        local g: F = f\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "g",
          "equals": "t1 where t1 = () -> t1?"
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.aliases.test.cpp:49 names_are_ascribed
{
  "name": "names_are_ascribed",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type T = { x: number }\n        local x: T\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "x",
          "equals": "T"
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:60 cannot_steal_hoisted_type_alias
{
  "name": "cannot_steal_hoisted_type_alias",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local x: T = \"foo\"\n        type T = number\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "code": "TypeMismatch",
          "location": [
            1,
            21,
            1,
            26
          ],
          "fields": {
            "wantedType": "number",
            "givenType": "string"
          },
          "moduleMatchesCheck": true
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:110 mismatched_generic_type_param
{
  "name": "mismatched_generic_type_param",
  "fixture": "Fixture",
  "flags": {
    "LuauStrictVisitInstantiatedType": true
  },
  "checks": [
    {
      "source": "\n        type T<A> = (A...) -> ()\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Generic type 'A' is used as a variadic type parameter; consider changing 'A' to 'A...' in the generic argument list"
        },
        {
          "error": 0,
          "location": [
            1,
            21,
            1,
            25
          ]
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:126 mismatched_generic_pack_type_param
{
  "name": "mismatched_generic_pack_type_param",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type T<A...> = (A) -> ()\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Variadic type parameter 'A...' is used as a regular generic type; consider changing 'A...' to 'A' in the generic argument list"
        },
        {
          "error": 0,
          "location": [
            1,
            24,
            1,
            25
          ]
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:140 default_type_parameter
{
  "name": "default_type_parameter",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type T<A = number, B = string> = { a: A, b: B }\n        local x: T<string> = { a = \"foo\", b = \"bar\" }\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "x",
          "equals": "T<string, string>"
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:151 default_pack_parameter
{
  "name": "default_pack_parameter",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type T<A... = (number, string)> = { fn: (A...) -> () }\n        local x: T\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "x",
          "equals": "T<number, string>"
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:162 saturate_to_first_type_pack
{
  "name": "saturate_to_first_type_pack",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type T<A, B, C...> = { fn: (A, B) -> C... }\n        local x: T<string, number, string, boolean>\n        local f = x.fn\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "x",
          "equals": "T<string, number, string, boolean>"
        },
        {
          "type": "f",
          "equals": "(string, number) -> (string, boolean)"
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:175 cyclic_types_of_named_table_fields_do_not_expand_when_stringified
{
  "name": "cyclic_types_of_named_table_fields_do_not_expand_when_stringified",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        --!strict\n        type Node = { Parent: Node?; }\n\n        function f(node: Node)\n            node.Parent = 1\n        end\n    ",
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
            "wantedType": "Node?"
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
  // TypeInfer.aliases.test.cpp:194 mutually_recursive_aliases
{
  "name": "mutually_recursive_aliases",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        --!strict\n        type T = { f: number, g: U }\n        type U = { h: number, i: T? }\n        local x: T = { f = 37, g = { h = 5, i = nil } }\n        x.g.i = x\n        local y: T = { f = 3, g = { h = 5, i = nil } }\n        y.g.i = y\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:209 generic_aliases
{
  "name": "generic_aliases",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type T<a> = { v: a }\n        local x: T<number> = { v = 123 }\n        local y: T<string> = { v = \"foo\" }\n        local bad: T<number> = { v = \"foo\" }\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "location": [
            4,
            37,
            4,
            42
          ]
        },
        {
          "error": 0,
          "message": "Expected this to be 'number', but got 'string'"
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:225 dependent_generic_aliases
{
  "name": "dependent_generic_aliases",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type T<a> = { v: a }\n        type U<a> = { t: T<a> }\n        local x: U<number> = { t = { v = 123 } }\n        local bad: U<number> = { t = { v = \"foo\" } }\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "location": [
            4,
            43,
            4,
            48
          ]
        },
        {
          "error": 0,
          "message": "Expected this to be 'number', but got 'string'"
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:241 mutually_recursive_generic_aliases
{
  "name": "mutually_recursive_generic_aliases",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        --!strict\n        type T<a> = { f: a, g: U<a> }\n        type U<a> = { h: a, i: T<a>? }\n        local x: T<number> = { f = 37, g = { h = 5, i = nil } }\n        x.g.i = x\n        local y: T<string> = { f = \"hi\", g = { h = \"lo\", i = nil } }\n        y.g.i = y\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:256 mutually_recursive_types_errors
{
  "name": "mutually_recursive_types_errors",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        --!strict\n        type T<a> = { f: a, g: U<a> }\n        type U<b> = { h: b, i: T<b>? }\n        local x: T<number> = { f = 37, g = { h = 5, i = nil } }\n        x.g.i = x\n        local y: T<string> = { f = \"hi\", g = { h = 5, i = nil } }\n        y.g.i = y\n    ",
      "expect": [
        {
          "errors": "some"
        },
        {
          "everyError": {
            "messageExcludes": "VALUELESS"
          }
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:283 use_table_name_and_generic_params_in_errors
{
  "name": "use_table_name_and_generic_params_in_errors",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type Pair<T, U> = {first: T, second: U}\n        local a: Pair<string, number>\n        local b: Pair<string, string>\n\n        a = b\n    ",
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
            "wantedType": "Pair<string, number>"
          }
        },
        {
          "error": 0,
          "fields": {
            "givenType": "Pair<string, string>"
          }
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:302 dont_stop_typechecking_after_reporting_duplicate_type_definition
{
  "name": "dont_stop_typechecking_after_reporting_duplicate_type_definition",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A = number\n        type A = string -- Redefinition of type 'A', previously defined at line 1\n        local foo: string = 1 -- \"Type 'number' could not be converted into 'string'\"\n    ",
      "expect": [
        {
          "errors": 2
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:313 stringify_type_alias_of_recursive_template_table_type
{
  "name": "stringify_type_alias_of_recursive_template_table_type",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type Table<T> = { a: T }\n        type Wrapped = Table<Wrapped>\n        local l: Wrapped = 2\n        ",
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
            "wantedType": "Wrapped"
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
  // TypeInfer.aliases.test.cpp:330 stringify_type_alias_of_recursive_template_table_type2
{
  "name": "stringify_type_alias_of_recursive_template_table_type2",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type Table<T> = { a: T }\n        type Wrapped = (Table<Wrapped>) -> string\n        local l: Wrapped = 2\n    ",
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
            "wantedType": "t1 where t1 = ({ a: t1 }) -> string"
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
  // TypeInfer.aliases.test.cpp:347 cli_38393_recursive_intersection_oom
{
  "name": "cli_38393_recursive_intersection_oom",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function _(l0:(t0)&((t0)&(((t0)&((t0)->()))->(typeof(_),typeof(# _)))),l39,...):any\n        end\n        type t0<t0> = ((typeof(_))&((t0)&(((typeof(_))&(t0))->typeof(_))),{n163:any,})->(any,typeof(_))\n        _(_)\n    ",
      "expect": []
    }
  ]
},
  // TypeInfer.aliases.test.cpp:358 type_alias_fwd_declaration_is_precise
{
  "name": "type_alias_fwd_declaration_is_precise",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local foo: Id<number> = 1\n        type Id<T> = T\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:368 corecursive_types_generic
{
  "name": "corecursive_types_generic",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A<T> = {v:T, b:B<T>}\n        type B<T> = {v:T, a:A<T>}\n\n        function f(a: A<number>)\n            return a\n        end\n    ",
      "expect": [
        {
          "decoratedSource": "\n        type A<T> = {v:T, b:B<T>}\n        type B<T> = {v:T, a:A<T>}\n\n        function f(a: A<number>): A<number>\n            return a\n        end\n    "
        },
        {
          "errors": 0
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.aliases.test.cpp:396 corecursive_function_types
{
  "name": "corecursive_function_types",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A = () -> (number, B)\n        type B = () -> (string, A)\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "alias": "A",
          "equals": "t1 where t1 = () -> (number, () -> (string, t1))"
        },
        {
          "alias": "B",
          "equals": "t1 where t1 = () -> (string, () -> (number, t1))"
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:409 generic_param_remap
{
  "name": "generic_param_remap",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        -- An example of a forwarded use of a type that has different type arguments than parameters\n        type A<T,U> = {t:T, u:U, next:A<U,T>?}\n        local aa:A<number,string> = { t = 5, u = 'hi', next = { t = 'lo', u = 8 } }\n        local bb = aa\n    ",
      "expect": [
        {
          "decoratedSource": "\n\n        type A<T,U> = {t:T, u:U, next:A<U,T>?}\n        local aa:A<number,string> = { t = 5, u = 'hi', next = { t = 'lo', u = 8 } }\n        local bb:A<number,string>=aa\n    "
        },
        {
          "errors": "some"
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:431 export_type_and_type_alias_are_duplicates
{
  "name": "export_type_and_type_alias_are_duplicates",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        export type Foo = number\n        type Foo = number\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "code": "DuplicateTypeDefinition"
        },
        {
          "error": 0,
          "fields": {
            "name": "Foo"
          }
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:445 reported_location_is_correct_when_type_alias_are_duplicates
{
  "name": "reported_location_is_correct_when_type_alias_are_duplicates",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A = string\n        type B = number\n        type C = string\n        type B = number\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "code": "DuplicateTypeDefinition"
        },
        {
          "error": 0,
          "fields": {
            "name": "B"
          }
        },
        {
          "error": 0,
          "fieldLocations": {
            "previousLocation": {
              "present": true,
              "line": 2
            }
          }
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:463 stringify_optional_parameterized_alias
{
  "name": "stringify_optional_parameterized_alias",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type Node<T> = { value: T, child: Node<T>? }\n\n        local function visitor<T>(node: Node<T>?)\n            local a: Node<T>\n\n            if node then\n                a = node.child -- Observe the output of the error message.\n            end\n        end\n    ",
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
            "givenType": "Node<T>?"
          }
        },
        {
          "error": 0,
          "fields": {
            "wantedType": "Node<T>"
          }
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:485 general_require_multi_assign
{
  "name": "general_require_multi_assign",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        local Foo, Bar = require(workspace.A), require(workspace.B)\n\n        local a: Foo.myvec2\n        local b: Bar.myvec3\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "a",
          "module": "workspace/C",
          "kind": "TableType",
          "properties": 2
        },
        {
          "type": "b",
          "module": "workspace/C",
          "kind": "TableType",
          "properties": 3
        }
      ],
      "module": "workspace/C",
      "moduleSources": {
        "workspace/A": "\n        export type myvec2 = {x: number, y: number}\n        return {}\n    ",
        "workspace/B": "\n        export type myvec3 = {x: number, y: number, z: number}\n        return {}\n    ",
        "workspace/C": "\n        local Foo, Bar = require(workspace.A), require(workspace.B)\n\n        local a: Foo.myvec2\n        local b: Bar.myvec3\n    "
      },
      "unparsed": {
        "defect": 879
      }
    }
  ]
},
  // TypeInfer.aliases.test.cpp:518 type_alias_import_mutation
{
  "name": "type_alias_import_mutation",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "type t10<x> = typeof(table)",
      "expect": [
        {
          "errors": 0
        },
        {
          "global": "table",
          "equals": "typeof(table)",
          "kind": "TableType",
          "instantiatedTypeParameters": 0
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:533 type_alias_local_mutation
{
  "name": "type_alias_local_mutation",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type Cool = { a: number, b: string }\n        local c: Cool = { a = 1, b = \"s\" }\n        type NotCool<x> = Cool\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "c"
        },
        {
          "type": "c",
          "equals": "Cool"
        },
        {
          "type": "c",
          "kind": "TableType"
        },
        {
          "type": "c",
          "instantiatedTypeParameters": 0
        }
      ]
    }
  ],
  "skip": {
    "newSolver": "does not pass on Luau's new solver upstream"
  }
},
  // TypeInfer.aliases.test.cpp:554 type_alias_local_rename
{
  "name": "type_alias_local_rename",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\ntype Cool = { a: number, b: string }\ntype NotCool = Cool\nlocal c: Cool = { a = 1, b = \"s\" }\nlocal d: NotCool = { a = 1, b = \"s\" }\n",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "c"
        },
        {
          "type": "c",
          "equals": "Cool"
        },
        {
          "type": "d"
        },
        {
          "type": "d",
          "equals": "NotCool"
        }
      ]
    }
  ],
  "skip": {
    "newSolver": "does not pass on Luau's new solver upstream"
  }
},
  // TypeInfer.aliases.test.cpp:575 type_alias_local_synthetic_mutation
{
  "name": "type_alias_local_synthetic_mutation",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\nlocal c = { a = 1, b = \"s\" }\ntype Cool = typeof(c)\n",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "c"
        },
        {
          "type": "c",
          "kind": "TableType"
        },
        {
          "type": "c",
          "name": "Cool"
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:591 type_alias_of_an_imported_recursive_type
{
  "name": "type_alias_of_an_imported_recursive_type",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\nexport type X = { a: number, b: X? }\nreturn {}\n    ",
      "expect": [
        {
          "errors": 0
        }
      ],
      "module": "game/A",
      "moduleSources": {
        "game/A": "\nexport type X = { a: number, b: X? }\nreturn {}\n    "
      }
    },
    {
      "source": "\nlocal Import = require(game.A)\ntype X = Import.X\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "importedAlias": [
            "Import",
            "X"
          ]
        },
        {
          "alias": "X"
        },
        {
          "importedAlias": [
            "Import",
            "X"
          ],
          "sameAs": {
            "alias": "X"
          }
        }
      ],
      "moduleSources": {
        "game/A": "\nexport type X = { a: number, b: X? }\nreturn {}\n    "
      },
      "unparsed": {
        "defect": 879
      }
    }
  ]
},
  // TypeInfer.aliases.test.cpp:617 type_alias_of_an_imported_recursive_generic_type
{
  "name": "type_alias_of_an_imported_recursive_generic_type",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        export type X<T, U> = { a: T, b: U, C: X<T, U>? }\n        return {}\n    ",
      "expect": [
        {
          "errors": 0
        }
      ],
      "module": "game/A",
      "moduleSources": {
        "game/A": "\n        export type X<T, U> = { a: T, b: U, C: X<T, U>? }\n        return {}\n    "
      }
    },
    {
      "source": "\n        local Import = require(game.A)\n        type X<T, U> = Import.X<T, U>\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "importedAlias": [
            "Import",
            "X"
          ]
        },
        {
          "alias": "X"
        },
        {
          "importedAlias": [
            "Import",
            "X"
          ],
          "printedSameAs": {
            "alias": "X"
          },
          "options": {
            "exhaustive": true
          }
        }
      ],
      "moduleSources": {
        "game/A": "\n        export type X<T, U> = { a: T, b: U, C: X<T, U>? }\n        return {}\n    "
      },
      "unparsed": {
        "defect": 879
      }
    },
    {
      "source": "\n        local Import = require(game.A)\n        type X<T, U> = Import.X<U, T>\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "importedAlias": [
            "Import",
            "X"
          ],
          "equals": "t1 where t1 = { C: t1?, a: T, b: U }",
          "options": {
            "exhaustive": true
          }
        },
        {
          "alias": "X",
          "equals": "t1 where t1 = { C: t1?, a: U, b: T }",
          "options": {
            "exhaustive": true
          }
        }
      ],
      "moduleSources": {
        "game/A": "\n        export type X<T, U> = { a: T, b: U, C: X<T, U>? }\n        return {}\n    "
      },
      "unparsed": {
        "defect": 879
      }
    }
  ]
},
  // TypeInfer.aliases.test.cpp:666 module_export_free_type_leak
{
  "name": "module_export_free_type_leak",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\nfunction get()\n    return function(obj) return true end\nend\n\nexport type f = typeof(get())\n    ",
      "expect": [
        {
          "errors": 0
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.aliases.test.cpp:681 module_export_wrapped_free_type_leak
{
  "name": "module_export_wrapped_free_type_leak",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\nfunction get()\n    return {a = 1, b = function(obj) return true end}\nend\n\nexport type f = typeof(get())\n    ",
      "expect": [
        {
          "errors": 0
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.aliases.test.cpp:697 mutually_recursive_types_restriction_ok
{
  "name": "mutually_recursive_types_restriction_ok",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type Tree<T> = { data: T, children: Forest<T> }\n        type Forest<T> = {Tree<T>}\n    ",
      "expect": [
        {
          "errors": 0
        }
      ],
      "unparsed": {
        "defect": 1370
      }
    }
  ]
},
  // TypeInfer.aliases.test.cpp:707 mutually_recursive_types_restriction_not_ok_1
{
  "name": "mutually_recursive_types_restriction_not_ok_1",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        -- OK because forwarded types are used with their parameters.\n        type Tree<T> = { data: T, children: Forest<T> }\n        type Forest<T> = {Tree<{T}>}\n    ",
      "expect": [
        {
          "errors": "some"
        }
      ],
      "unparsed": {
        "defect": 1370
      }
    }
  ]
},
  // TypeInfer.aliases.test.cpp:718 mutually_recursive_types_restriction_not_ok_2
{
  "name": "mutually_recursive_types_restriction_not_ok_2",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        -- Not OK because forwarded types are used with different types than their parameters.\n        type Forest<T> = {Tree<{T}>}\n        type Tree<T> = { data: T, children: Forest<T> }\n    ",
      "expect": [
        {
          "errors": "some"
        }
      ],
      "unparsed": {
        "defect": 1370
      }
    }
  ]
},
  // TypeInfer.aliases.test.cpp:729 mutually_recursive_types_swapsies_ok
{
  "name": "mutually_recursive_types_swapsies_ok",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type Tree1<T,U> = { data: T, children: {Tree2<U,T>} }\n        type Tree2<U,T> = { data: U, children: {Tree1<T,U>} }\n    ",
      "expect": [
        {
          "errors": 0
        }
      ],
      "unparsed": {
        "defect": 1370
      }
    }
  ]
},
  // TypeInfer.aliases.test.cpp:739 mutually_recursive_types_swapsies_not_ok
{
  "name": "mutually_recursive_types_swapsies_not_ok",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type Tree1<T,U> = { data: T, children: {Tree2<U,T>} }\n        type Tree2<T,U> = { data: U, children: {Tree1<T,U>} }\n    ",
      "expect": [
        {
          "errors": "some"
        }
      ],
      "unparsed": {
        "defect": 1370
      }
    }
  ]
},
  // TypeInfer.aliases.test.cpp:749 free_variables_from_typeof_in_aliases
{
  "name": "free_variables_from_typeof_in_aliases",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        function f(x) return x[1] end\n        -- x has type X? for a free type variable X\n        local x = f ({})\n        type ContainsFree<a> = { this: a, that: typeof(x) }\n        type ContainsContainsFree = { that: ContainsFree<number> }\n    ",
      "expect": [
        {
          "errors": 0
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.aliases.test.cpp:764 non_recursive_aliases_that_reuse_a_generic_name
{
  "name": "non_recursive_aliases_that_reuse_a_generic_name",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type Array<T> = { [number]: T }\n        type Tuple<T, V> = Array<T | V>\n\n        local p: Tuple<number, string>\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "type": "p",
          "equals": "{number | string}",
          "options": {
            "exhaustive": true
          }
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:786 do_not_quantify_unresolved_aliases
{
  "name": "do_not_quantify_unresolved_aliases",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        --!strict\n\n        local KeyPool = {}\n\n        local function newkey(pool: KeyPool, index)\n            return {}\n        end\n\n        function newKeyPool()\n            local pool = {\n                available = {} :: {Key},\n            }\n\n            return setmetatable(pool, KeyPool)\n        end\n\n        export type KeyPool = typeof(newKeyPool())\n        export type Key = typeof(newkey(newKeyPool(), 1))\n    ",
      "expect": [
        {
          "errors": 0
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.aliases.test.cpp:820 generic_typevars_are_not_considered_to_escape_their_scope_if_they_are_reused_in_multiple_aliases
{
  "name": "generic_typevars_are_not_considered_to_escape_their_scope_if_they_are_reused_in_multiple_aliases",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type Array<T> = {T}\n        type Exclude<T, V> = T\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:837 forward_declared_alias_is_not_clobbered_by_prior_unification_with_any
{
  "name": "forward_declared_alias_is_not_clobbered_by_prior_unification_with_any",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        local function x()\n            local y: FutureType = {}::any\n            return 1\n        end\n        type FutureType = { foo: typeof(x()) }\n        local d: FutureType = { smth = true } -- missing error, 'd' is resolved to 'any'\n    ",
      "expect": [
        {
          "type": "d",
          "equals": "{ foo: number }",
          "options": {
            "exhaustive": true
          }
        },
        {
          "errors": 1
        }
      ],
      "ignoreMissingAnnotations": true
    }
  ]
},
  // TypeInfer.aliases.test.cpp:856 recursive_types_restriction_ok
{
  "name": "recursive_types_restriction_ok",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type Tree<T> = { data: T, children: {Tree<T>} }\n    ",
      "expect": [
        {
          "errors": 0
        }
      ],
      "unparsed": {
        "defect": 1370
      }
    }
  ]
},
  // TypeInfer.aliases.test.cpp:865 recursive_types_restriction_not_ok
{
  "name": "recursive_types_restriction_not_ok",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        -- this would be an infinite type if we allowed it\n        type Tree<T> = { data: T, children: {Tree<{T}>} }\n    ",
      "expect": [
        {
          "errors": "some"
        }
      ],
      "unparsed": {
        "defect": 1370
      }
    }
  ]
},
  // TypeInfer.aliases.test.cpp:875 report_shadowed_aliases
{
  "name": "report_shadowed_aliases",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type MyString = string\n        type string = number\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Redefinition of type 'string'"
        },
        {
          "alias": "MyString"
        },
        {
          "alias": "string"
        },
        {
          "alias": "MyString",
          "kind": "PrimitiveType",
          "equals": "string"
        },
        {
          "alias": "string",
          "kind": "PrimitiveType",
          "equals": "string"
        }
      ]
    }
  ],
  "skip": {
    "newSolver": "does not pass on Luau's new solver upstream"
  }
},
  // TypeInfer.aliases.test.cpp:899 it_is_ok_to_shadow_user_defined_alias
{
  "name": "it_is_ok_to_shadow_user_defined_alias",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type T = number\n\n        do\n            type T = string\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:912 cannot_create_cyclic_type_with_unknown_module
{
  "name": "cannot_create_cyclic_type_with_unknown_module",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type AAA = B.AAA\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "Unknown type 'B.AAA'"
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:922 type_alias_locations
{
  "name": "type_alias_locations",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type T = number\n\n        do\n            type T = string\n            type X = boolean\n        end\n    ",
      "expect": [
        {
          "scopes": {
            "minimum": 1,
            "aliases": [
              {
                "scope": 0,
                "name": "T",
                "location": [
                  1,
                  13,
                  1,
                  14
                ]
              },
              {
                "scopeAt": [
                  4,
                  0
                ],
                "name": "T",
                "location": [
                  4,
                  17,
                  4,
                  18
                ]
              },
              {
                "scopeAt": [
                  4,
                  0
                ],
                "name": "X",
                "location": [
                  5,
                  17,
                  5,
                  18
                ]
              }
            ]
          }
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:959 dont_lose_track_of_PendingExpansionTypes_after_substitution
{
  "name": "dont_lose_track_of_PendingExpansionTypes_after_substitution",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        local RCD = require(script.Parent.Parent.Parent.ReactCurrentDispatcher)\n\n        local function resolveDispatcher(): RCD.Dispatcher\n            return (nil :: any) :: RCD.Dispatcher\n        end\n\n        function useState<S>(\n            initialState: (() -> S) | S\n        ): (S, RCD.Dispatch<RCD.BasicStateAction<S>>)\n            local dispatcher = resolveDispatcher()\n            return dispatcher.useState(initialState)\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ],
      "module": "game/React/React/ReactHooks",
      "moduleSources": {
        "game/ReactCurrentDispatcher": "\n        export type BasicStateAction<S> = ((S) -> S) | S\n        export type Dispatch<A> = (A) -> ()\n\n        export type Dispatcher = {\n            useState: <S>(initialState: (() -> S) | S) -> (S, Dispatch<BasicStateAction<S>>),\n        }\n\n        return {}\n    ",
        "game/React/React/ReactHooks": "\n        local RCD = require(script.Parent.Parent.Parent.ReactCurrentDispatcher)\n\n        local function resolveDispatcher(): RCD.Dispatcher\n            return (nil :: any) :: RCD.Dispatcher\n        end\n\n        function useState<S>(\n            initialState: (() -> S) | S\n        ): (S, RCD.Dispatch<RCD.BasicStateAction<S>>)\n            local dispatcher = resolveDispatcher()\n            return dispatcher.useState(initialState)\n        end\n    "
      },
      "unparsed": {
        "defect": 879
      }
    }
  ]
},
  // TypeInfer.aliases.test.cpp:994 another_thing_from_roact
{
  "name": "another_thing_from_roact",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type Map<K, V> = { [K]: V }\n        type Set<T> = { [T]: boolean }\n\n        type FiberRoot = {\n            pingCache: Map<Wakeable, (Set<any> | Map<Wakeable, Set<any>>)> | nil,\n        }\n\n        type Wakeable = {\n            andThen: (self: Wakeable) -> nil | Wakeable,\n        }\n\n        local function attachPingListener(root: FiberRoot, wakeable: Wakeable, lanes: number)\n            local pingCache: Map<Wakeable, (Set<any> | Map<Wakeable, Set<any>>)> | nil = root.pingCache\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:1023 alias_expands_to_bare_reference_to_imported_type
{
  "name": "alias_expands_to_bare_reference_to_imported_type",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        local A = require(script.Parent.A)\n\n        type Object = A.Object\n        type ReadOnly<T> = T\n\n        local function f(): ReadOnly<Object>\n            return nil :: any\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ],
      "module": "game/B",
      "moduleSources": {
        "game/A": "\n        --!strict\n        export type Object = {[string]: any}\n        return {}\n    ",
        "game/B": "\n        local A = require(script.Parent.A)\n\n        type Object = A.Object\n        type ReadOnly<T> = T\n\n        local function f(): ReadOnly<Object>\n            return nil :: any\n        end\n    "
      },
      "unparsed": {
        "defect": 879
      }
    }
  ]
},
  // TypeInfer.aliases.test.cpp:1046 table_types_record_the_property_locations
{
  "name": "table_types_record_the_property_locations",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type Table = {\n            create: () -> ()\n        }\n\n        local x: Table\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "alias": "Table",
          "kind": "TableType",
          "hasProperty": [
            "create"
          ],
          "propertyLocations": {
            "create": {
              "location": null,
              "typeLocation": [
                2,
                12,
                2,
                18
              ]
            }
          }
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:1069 typeof_is_not_a_valid_alias_name
{
  "name": "typeof_is_not_a_valid_alias_name",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type typeof = number\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "message": "typeof cannot be used as an identifier for a type function or alias"
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:1087 fuzzer_bug_doesnt_crash
{
  "name": "fuzzer_bug_doesnt_crash",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\ntype t0 = (t0<t0...>)\n",
      "expect": [
        {
          "errors": "some"
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:1096 recursive_type_alias_warns
{
  "name": "recursive_type_alias_warns",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\ntype Foo<T> = Foo<T>\n",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "code": "OccursCheckFailed"
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:1107 recursive_type_alias_bad_pack_use_warns
{
  "name": "recursive_type_alias_bad_pack_use_warns",
  "fixture": "Fixture",
  "flags": {
    "LuauStrictVisitInstantiatedType": true
  },
  "checks": [
    {
      "source": "\ntype Foo<T> = Foo<T...>\n",
      "expect": [
        {
          "errors": 4
        },
        {
          "anyError": "GenericError"
        },
        {
          "error": 3,
          "message": "Generic type 'Foo<T>' expects 1 type argument, but none are specified"
        },
        {
          "error": 0,
          "code": "OccursCheckFailed"
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
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:1128 corecursive_aliases
{
  "name": "corecursive_aliases",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\ntype Foo<T> = Bar<T>\ntype Bar<T> = Foo<T>\n",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "code": "OccursCheckFailed"
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:1140 should_also_occurs_check
{
  "name": "should_also_occurs_check",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\ntype Foo<T> = Foo<T> | string\n",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "code": "OccursCheckFailed"
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:1150 type_alias_adds_reduce_constraint_for_type_function
{
  "name": "type_alias_adds_reduce_constraint_for_type_function",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n    type plus<T> = add<number, T>\n\n    local sum: plus<number> = 10\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:1164 bound_type_in_alias_segfault
{
  "name": "bound_type_in_alias_segfault",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        --!nonstrict\n        type Map<T, V> = {[K]: V}\n        function foo:bar(): Config<any, any> end\n        type Config<TSource, TContext> = Map<TSource, TContext> & { fields: FieldConfigMap<any, any>}\n        export type FieldConfig<TSource, TContext, TArgs> = {[string]: any}\n        export type FieldConfigMap<TSource, TContext> = Map<string, FieldConfig<TSource, TContext>>\n    ",
      "expect": [
        {
          "errors": 2
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:1180 gh1632_no_infinite_recursion_in_normalization
{
  "name": "gh1632_no_infinite_recursion_in_normalization",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        type Node<T> = {\n            value: T,\n            next: Node<T>?,\n            -- remove `prev`, solves issue\n            prev: Node<T>?,\n        };\n\n        type List<T> = {\n            head: Node<T>?\n        }\n\n        local function IsFront(list: List<any>, nodeB: Node<any>)\n            -- remove if statement below, solves issue\n            if (list.head == nodeB) then\n            end\n        end\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:1208 exported_alias_location_is_accessible_on_module
{
  "name": "exported_alias_location_is_accessible_on_module",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        export type Value = string\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "exportedAlias": "Value",
          "definitionLocation": [
            1,
            8,
            1,
            34
          ]
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:1222 exported_type_function_location_is_accessible_on_module
{
  "name": "exported_type_function_location_is_accessible_on_module",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        export type function Apply()\n        end\n    ",
      "expect": [
        {
          "errors": 0
        },
        {
          "exportedAlias": "Apply",
          "definitionLocation": [
            1,
            8,
            2,
            11
          ]
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:1241 fuzzer_cursed_type_aliases
{
  "name": "fuzzer_cursed_type_aliases",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        export type t1<t0...> = t4<t0...>\n        export type t4<t2, t0...> = t4<t0...>\n    ",
      "expect": []
    }
  ]
},
  // TypeInfer.aliases.test.cpp:1251 type_alias_dont_crash_on_bad_name
{
  "name": "type_alias_dont_crash_on_bad_name",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type typeof = typeof(nil :: any)\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "code": "ReservedIdentifier"
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:1262 type_alias_dont_crash_on_duplicate_with_typeof
{
  "name": "type_alias_dont_crash_on_duplicate_with_typeof",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A = typeof(nil :: any)\n        type A = typeof(nil :: any)\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "code": "DuplicateTypeDefinition"
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:1277 fuzzer_more_cursed_aliases
{
  "name": "fuzzer_more_cursed_aliases",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\nexport type t138 = t0<t138>\nexport type t0<t0,t10,t10,t109> = t0\n    ",
      "expect": []
    }
  ]
},
  // TypeInfer.aliases.test.cpp:1285 evaluating_generic_default_type_shouldnt_ice
{
  "name": "evaluating_generic_default_type_shouldnt_ice",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\nlocal A = {}\ntype B<T = typeof(A)> = unknown\n",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:1301 evaluating_generic_default_type_pack_shouldnt_ice
{
  "name": "evaluating_generic_default_type_pack_shouldnt_ice",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\nlocal A = {}\ntype B<T... = ...typeof(A)> = unknown\n",
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
  // TypeInfer.aliases.test.cpp:1317 evaluating_generic_default_type_for_symbol_before_definition_is_an_error
{
  "name": "evaluating_generic_default_type_for_symbol_before_definition_is_an_error",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\ntype B<T = typeof(A)> = unknown\nlocal A = {}\n",
      "expect": [
        {
          "errors": 1
        },
        {
          "anyError": "UnknownSymbol"
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:1332 evaluating_generic_default_type_pack_for_symbol_before_definition_is_an_error
{
  "name": "evaluating_generic_default_type_pack_for_symbol_before_definition_is_an_error",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\ntype B<T... = ...typeof(A)> = unknown\nlocal A = {}\n",
      "expect": [
        {
          "errors": 1
        },
        {
          "anyError": "UnknownSymbol"
        }
      ],
      "unparsed": {
        "defect": 876
      }
    }
  ]
},
  // TypeInfer.aliases.test.cpp:1347 dont_allow_redefining_builtin_types
{
  "name": "dont_allow_redefining_builtin_types",
  "fixture": "BuiltinsFixture",
  "flags": {
    "LuauDisallowRedefiningBuiltinTypes": true
  },
  "checks": [
    {
      "source": "\n        type number = string\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "anyError": "DuplicateTypeDefinition"
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:1358 only_report_single_error_for_missing_generics_1
{
  "name": "only_report_single_error_for_missing_generics_1",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type t0<A> = {[t0]: t0<A>}\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "code": "IncorrectGenericParameterCount"
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:1370 only_report_single_error_for_missing_generics_2
{
  "name": "only_report_single_error_for_missing_generics_2",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type Tree<A> = { [string]: Tree }\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "code": "IncorrectGenericParameterCount"
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:1382 cyclic_type_alias_through_generic_does_not_assert
{
  "name": "cyclic_type_alias_through_generic_does_not_assert",
  "fixture": "Fixture",
  "checks": [
    {
      "source": "\n        type A = B\n        type B = { x: C<any> }\n        type C<T> = A\n    ",
      "expect": [
        {
          "errors": 1
        },
        {
          "error": 0,
          "code": "RecursiveRestraintViolation"
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:1403 unpack_doesnt_emplace_typeof_type
{
  "name": "unpack_doesnt_emplace_typeof_type",
  "fixture": "BuiltinsFixture",
  "checks": [
    {
      "source": "\n        local Obj = {}\n\n        local function g(): number\n            return 42\n        end\n\n        local val: typeof(Obj.Foo.Bar) = g()\n\n        Obj.Foo = {}\n        Obj.Foo.Bar = 42\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
  // TypeInfer.aliases.test.cpp:1421 unused_type_arguments
{
  "name": "unused_type_arguments",
  "fixture": "BuiltinsFixture",
  "flags": {
    "LuauInstantiationCheckArguments": true
  },
  "checks": [
    {
      "source": "\n        type Foo<T> = {}\n        export type Export<T> = {Foo<Foo<T>>}\n    ",
      "expect": [
        {
          "errors": 0
        }
      ],
      "unparsed": {
        "defect": 1370
      }
    }
  ]
},
  // TypeInfer.aliases.test.cpp:1431 type_argument_duplicate_pending_expansions
{
  "name": "type_argument_duplicate_pending_expansions",
  "fixture": "BuiltinsFixture",
  "flags": {
    "LuauInstantiationCheckArguments": true,
    "LuauInstantiationCheckArgumentsDedup": true
  },
  "checks": [
    {
      "source": "\ntype Sym<Kind = string> = { text: Kind }\ntype Data<T, U> = { [number]: T, separators: { Sym<U> } }\ntype MT<T, U> = { __iter: (Data<T, U>) -> (({ [number]: T }, number?) -> (number?, T), { T }) }\ntype Combined<T, U> = setmetatable<Data<T, U>, MT<T, U>>\n\ntype Instantiate0 = { typeArguments: Combined<Pack1 | Pack2 | Pack3 | Pack4, \",\"> }\ntype Instantiate1 = { typeArguments: Combined<Pack1 | Pack2 | Pack3 | Pack4, \",\"> }\ntype Instantiate2 = { typeArguments: Combined<Pack1 | Pack2 | Pack3 | Pack4, \",\"> }\ntype Instantiate3 = { typeArguments: Combined<Pack1 | Pack2 | Pack3 | Pack4, \",\"> }\ntype Instantiate4 = { typeArguments: Combined<Pack1 | Pack2 | Pack3 | Pack4, \",\"> }\ntype Instantiate5 = { typeArguments: Combined<Pack1 | Pack2 | Pack3 | Pack4, \",\"> }\ntype Instantiate6 = { typeArguments: Combined<Pack1 | Pack2 | Pack3 | Pack4, \",\"> }\ntype Instantiate7 = { typeArguments: Combined<Pack1 | Pack2 | Pack3 | Pack4, \",\"> }\ntype Instantiate8 = { typeArguments: Combined<Pack1 | Pack2 | Pack3 | Pack4, \",\"> }\ntype Instantiate9 = { typeArguments: Combined<Pack1 | Pack2 | Pack3 | Pack4, \",\"> }\n\ntype Pack1a = { a: Sym<\"a\">, b: Sym<\"b\">, c: Sym<\"c\">, d: Sym<\"d\">, e: Sym<\"e\">, f: Sym<\"e\"> }\ntype Pack1b = { a: Sym<\"a\">, b: Sym<\"b\">, c: Sym<\"c\">, d: Sym<\"d\">, e: Sym<\"e\">, f: Sym<\"e\"> }\ntype Pack1c = { a: Sym<\"a\">, b: Sym<\"b\">, c: Sym<\"c\">, d: Sym<\"d\">, e: Sym<\"e\">, f: Sym<\"e\"> }\ntype Pack1d = { a: Sym<\"a\">, b: Sym<\"b\">, c: Sym<\"c\">, d: Sym<\"d\">, e: Sym<\"e\">, f: Sym<\"e\"> }\ntype Pack1e = { a: Sym<\"a\">, b: Sym<\"b\">, c: Sym<\"c\">, d: Sym<\"d\">, e: Sym<\"e\">, f: Sym<\"e\"> }\ntype Pack1 = Pack1a | Pack1b | Pack1c | Pack1d | Pack1e\n\ntype Pack2a = { a: Sym<\"a\">, b: Sym<\"b\">, c: Sym<\"c\">, d: Sym<\"d\">, e: Sym<\"e\">, f: Sym<\"e\"> }\ntype Pack2b = { a: Sym<\"a\">, b: Sym<\"b\">, c: Sym<\"c\">, d: Sym<\"d\">, e: Sym<\"e\">, f: Sym<\"e\"> }\ntype Pack2c = { a: Sym<\"a\">, b: Sym<\"b\">, c: Sym<\"c\">, d: Sym<\"d\">, e: Sym<\"e\">, f: Sym<\"e\"> }\ntype Pack2d = { a: Sym<\"a\">, b: Sym<\"b\">, c: Sym<\"c\">, d: Sym<\"d\">, e: Sym<\"e\">, f: Sym<\"e\"> }\ntype Pack2e = { a: Sym<\"a\">, b: Sym<\"b\">, c: Sym<\"c\">, d: Sym<\"d\">, e: Sym<\"e\">, f: Sym<\"e\"> }\ntype Pack2 = Pack2a | Pack2b | Pack2c | Pack2d | Pack2e\n\ntype Pack3a = { a: Sym<\"a\">, b: Sym<\"b\">, c: Sym<\"c\">, d: Sym<\"d\">, e: Sym<\"e\">, f: Sym<\"e\"> }\ntype Pack3b = { a: Sym<\"a\">, b: Sym<\"b\">, c: Sym<\"c\">, d: Sym<\"d\">, e: Sym<\"e\">, f: Sym<\"e\"> }\ntype Pack3c = { a: Sym<\"a\">, b: Sym<\"b\">, c: Sym<\"c\">, d: Sym<\"d\">, e: Sym<\"e\">, f: Sym<\"e\"> }\ntype Pack3d = { a: Sym<\"a\">, b: Sym<\"b\">, c: Sym<\"c\">, d: Sym<\"d\">, e: Sym<\"e\">, f: Sym<\"e\"> }\ntype Pack3e = { a: Sym<\"a\">, b: Sym<\"b\">, c: Sym<\"c\">, d: Sym<\"d\">, e: Sym<\"e\">, f: Sym<\"e\"> }\ntype Pack3 = Pack3a | Pack3b | Pack3c | Pack3d | Pack3e\n\ntype Pack4a = { a: Sym<\"a\">, b: Sym<\"b\">, c: Sym<\"c\">, d: Sym<\"d\">, e: Sym<\"e\">, f: Sym<\"e\"> }\ntype Pack4b = { a: Sym<\"a\">, b: Sym<\"b\">, c: Sym<\"c\">, d: Sym<\"d\">, e: Sym<\"e\">, f: Sym<\"e\"> }\ntype Pack4c = { a: Sym<\"a\">, b: Sym<\"b\">, c: Sym<\"c\">, d: Sym<\"d\">, e: Sym<\"e\">, f: Sym<\"e\"> }\ntype Pack4d = { a: Sym<\"a\">, b: Sym<\"b\">, c: Sym<\"c\">, d: Sym<\"d\">, e: Sym<\"e\">, f: Sym<\"e\"> }\ntype Pack4e = { a: Sym<\"a\">, b: Sym<\"b\">, c: Sym<\"c\">, d: Sym<\"d\">, e: Sym<\"e\">, f: Sym<\"e\"> }\ntype Pack4 = Pack4a | Pack4b | Pack4c | Pack4d | Pack4e\n    ",
      "expect": [
        {
          "errors": 0
        }
      ],
      "unparsed": {
        "defect": 1370
      }
    }
  ]
},
  // TypeInfer.aliases.test.cpp:1485 blocked_type_alias_do_not_leak_generic_arguments
{
  "name": "blocked_type_alias_do_not_leak_generic_arguments",
  "fixture": "BuiltinsFixture",
  "flags": {
    "LuauBlockingTypeAliasExpansion": true
  },
  "checks": [
    {
      "source": "\ntype Alias<Generic> = typeof(getmetatable(... :: Generic))\n\ntype Value = { x: number, y: number }\ntype Meta = setmetatable<Value, { __len : (Value) -> number }>\n\nlocal foo: Alias<Meta>\n\nlocal x: number = foo.__len({ x = 1, y = 2})\n\nreturn foo\n    ",
      "expect": [
        {
          "errors": 0
        }
      ]
    }
  ]
},
]);
