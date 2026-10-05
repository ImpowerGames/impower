// Port of tests/TypeInfer.typePacks.test.cpp at luau-lang/luau@7d5f73364fdbbaa984fa545071630eba73cfea98.
// Sources are verbatim; expectations select upstream's new-solver branches.
import { portUpstreamFile } from "./portedCases";

portUpstreamFile("TypeInfer.typePacks.test.cpp", [
  // TypeInfer.typePacks.test.cpp:21 TEST_CASE_FIXTURE(Fixture, "infer_multi_return")
  // PENDING ASSERTION AUDIT: CHECK_EQ(2, returns.size())
  // PENDING ASSERTION AUDIT: CHECK_EQ(getBuiltins()->numberType, follow(returns[0]))
  // PENDING ASSERTION AUDIT: CHECK_EQ(getBuiltins()->numberType, follow(returns[1]))
  // PENDING ASSERTION AUDIT: CHECK(!tail)
  {
    "name": "infer_multi_return",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        function take_two()
            return 2, 2
        end
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "take_two",
            "kind": "FunctionType"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:44 TEST_CASE_FIXTURE(Fixture, "empty_varargs_should_return_nil_when_not_in_tail_position")
  {
    "name": "empty_varargs_should_return_nil_when_not_in_tail_position",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local a, b = ..., 1
    `,
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:53 TEST_CASE_FIXTURE(Fixture, "self_and_varargs_should_work")
  {
    "name": "self_and_varargs_should_work",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local t = {}
        function t:f(...) end
        t:f(1)
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
  // TypeInfer.typePacks.test.cpp:65 TEST_CASE_FIXTURE(Fixture, "last_element_of_return_statement_can_itself_be_a_pack")
  // PENDING ASSERTION AUDIT: REQUIRE_EQ(3, rets.size())
  // PENDING ASSERTION AUDIT: CHECK_EQ(getBuiltins()->numberType, follow(rets[0]))
  // PENDING ASSERTION AUDIT: CHECK_EQ(getBuiltins()->numberType, follow(rets[1]))
  // PENDING ASSERTION AUDIT: CHECK_EQ(getBuiltins()->numberType, follow(rets[2]))
  // PENDING ASSERTION AUDIT: CHECK(!tail)
  {
    "name": "last_element_of_return_statement_can_itself_be_a_pack",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        function take_two()
            return 2, 2
        end

        function take_three()
            return 1, take_two()
        end
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "take_three",
            "kind": "FunctionType"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:94 TEST_CASE_FIXTURE(Fixture, "higher_order_function")
  {
    "name": "higher_order_function",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        function apply(f, g, x)
            return f(g(x))
        end
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "apply",
            "equals": "<T, U..., V...>((V...) -> (U...), (T) -> (V...), T) -> (U...)"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:111 TEST_CASE_FIXTURE(Fixture, "return_type_should_be_empty_if_nothing_is_returned")
  // PENDING ASSERTION AUDIT: CHECK_EQ(0, size(fTy->retTypes))
  // PENDING ASSERTION AUDIT: CHECK_EQ(0, size(gTy->retTypes))
  {
    "name": "return_type_should_be_empty_if_nothing_is_returned",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        function f() end
        function g() return end
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "f",
            "kind": "FunctionType"
          },
          {
            "type": "g",
            "kind": "FunctionType"
          }
        ]
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:126 TEST_CASE_FIXTURE(Fixture, "no_return_size_should_be_zero")
  // PENDING ASSERTION AUDIT: CHECK_EQ(1, size(follow(fTy->retTypes)))
  // PENDING ASSERTION AUDIT: CHECK_EQ(0, size(gTy->retTypes))
  // PENDING ASSERTION AUDIT: CHECK_EQ(0, size(hTy->retTypes))
  {
    "name": "no_return_size_should_be_zero",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        function f(a:any) return a end
        function g() return end
        function h() end

        g(h())
        f(g(),h())
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "f",
            "kind": "FunctionType"
          },
          {
            "type": "g",
            "kind": "FunctionType"
          },
          {
            "type": "h",
            "kind": "FunctionType"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:152 TEST_CASE_FIXTURE(Fixture, "varargs_inference_through_multiple_scopes")
  {
    "name": "varargs_inference_through_multiple_scopes",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local function f(...)
            do
                local a: string = ...
                local b: number = ...
            end
        end

        f("foo")
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
  // TypeInfer.typePacks.test.cpp:169 TEST_CASE_FIXTURE(Fixture, "multiple_varargs_inference_are_not_confused")
  {
    "name": "multiple_varargs_inference_are_not_confused",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        local function f(...)
            local a: string = ...

            return function(...)
                local b: number = ...
            end
        end

        f("foo", "bar")(1, 2)
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
  // TypeInfer.typePacks.test.cpp:187 TEST_CASE_FIXTURE(Fixture, "parenthesized_varargs_returns_any")
  {
    "name": "parenthesized_varargs_returns_any",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        --!strict
        local value

        local function f(...)
            value = ...
        end
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "value",
            "equals": "any"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:203 TEST_CASE_FIXTURE(Fixture, "variadic_packs")
  // PENDING SETUP AUDIT: install globals foo:(...number)->number and bar:(number,...string)->number.
  {
    "name": "variadic_packs",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        --!strict

        foo(1, 2, 3, "foo")
        bar(1, "foo", "bar", 3)
    `,
        "expect": [
          {
            "errors": 2
          },
          {
            "error": 0,
            "location": [
              3,
              21,
              3,
              26
            ]
          },
          {
            "error": 1,
            "location": [
              4,
              29,
              4,
              30
            ]
          },
          {
            "error": 0,
            "code": "TypeMismatch",
            "location": [
              3,
              21,
              3,
              26
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
              4,
              29,
              4,
              30
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
  // TypeInfer.typePacks.test.cpp:256 TEST_CASE_FIXTURE(Fixture, "variadic_pack_syntax")
  {
    "name": "variadic_pack_syntax",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        --!strict

        local function foo(...: number)
        end

        foo(1, 2, 3, 4, 5, 6)
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "foo",
            "equals": "(...number) -> ()"
          }
        ]
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:271 TEST_CASE_FIXTURE(Fixture, "type_pack_hidden_free_tail_infinite_growth")
  {
    "name": "type_pack_hidden_free_tail_infinite_growth",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
--!nonstrict
if _ then
    _[function(l0)end],l0 = _
elseif _ then
    return l0(nil)
elseif 1 / l0(nil) then
elseif _ then
    return #_,l0()
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
  // TypeInfer.typePacks.test.cpp:288 TEST_CASE_FIXTURE(Fixture, "variadic_argument_tail")
  {
    "name": "variadic_argument_tail",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
local _ = function():((...any)->(...any),()->())
    return function() end, function() end
end
for y in _() do
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
  // TypeInfer.typePacks.test.cpp:301 TEST_CASE_FIXTURE(Fixture, "type_alias_type_packs")
  // PENDING ASSERTION AUDIT: REQUIRE(ttvA->instantiatedTypeParams.size() == 1)
  // PENDING ASSERTION AUDIT: REQUIRE(ttvA->instantiatedTypePackParams.size() == 1)
  // PENDING ASSERTION AUDIT: CHECK_EQ(toString(ttvA->instantiatedTypeParams[0], {true}), "number")
  // PENDING ASSERTION AUDIT: CHECK_EQ(toString(ttvA->instantiatedTypePackParams[0], {true}), "()")
  // PENDING ASSERTION AUDIT: REQUIRE(ttvB->instantiatedTypeParams.size() == 1)
  // PENDING ASSERTION AUDIT: REQUIRE(ttvB->instantiatedTypePackParams.size() == 1)
  // PENDING ASSERTION AUDIT: CHECK_EQ(toString(ttvB->instantiatedTypeParams[0], {true}), "string")
  // PENDING ASSERTION AUDIT: CHECK_EQ(toString(ttvB->instantiatedTypePackParams[0], {true}), "number")
  // PENDING ASSERTION AUDIT: REQUIRE(ttvC->instantiatedTypeParams.size() == 1)
  // PENDING ASSERTION AUDIT: REQUIRE(ttvC->instantiatedTypePackParams.size() == 1)
  // PENDING ASSERTION AUDIT: CHECK_EQ(toString(ttvC->instantiatedTypeParams[0], {true}), "string")
  // PENDING ASSERTION AUDIT: CHECK_EQ(toString(ttvC->instantiatedTypePackParams[0], {true}), "number, boolean")
  {
    "name": "type_alias_type_packs",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
type Packed<T...> = (T...) -> T...
local a: Packed<>
local b: Packed<number>
local c: Packed<string, number>
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "alias": "Packed"
          },
          {
            "alias": "Packed",
            "equals": "(T...) -> (T...)"
          },
          {
            "type": "a",
            "equals": "() -> ()"
          },
          {
            "type": "b",
            "equals": "(number) -> number"
          },
          {
            "type": "c",
            "equals": "(string, number) -> (string, number)"
          }
        ]
      },
      {
        "source": `
-- (U..., T) cannot be parsed right now
type Packed<T, U...> = { f: (a: T, U...) -> (T, U...) }
local a: Packed<number>
local b: Packed<string, number>
local c: Packed<string, number, boolean>
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "alias": "Packed"
          },
          {
            "alias": "Packed",
            "equals": "Packed<T, U...>"
          },
          {
            "alias": "Packed",
            "equals": "{ f: (T, U...) -> (T, U...) }",
            "options": {
              "exhaustive": true
            }
          },
          {
            "type": "a",
            "kind": "TableType"
          },
          {
            "type": "a",
            "equals": "Packed<number>"
          },
          {
            "type": "a",
            "equals": "{ f: (number) -> number }",
            "options": {
              "exhaustive": true
            }
          },
          {
            "type": "b",
            "kind": "TableType"
          },
          {
            "type": "b",
            "equals": "Packed<string, number>"
          },
          {
            "type": "b",
            "equals": "{ f: (string, number) -> (string, number) }",
            "options": {
              "exhaustive": true
            }
          },
          {
            "type": "c",
            "kind": "TableType"
          },
          {
            "type": "c",
            "equals": "Packed<string, number, boolean>"
          },
          {
            "type": "c",
            "equals": "{ f: (string, number, boolean) -> (string, number, boolean) }",
            "options": {
              "exhaustive": true
            }
          }
        ]
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:365 TEST_CASE_FIXTURE(BuiltinsFixture, "type_alias_type_packs_import")
  // PENDING ASSERTION AUDIT: REQUIRE(tf)
  // PENDING ASSERTION AUDIT: CHECK_EQ(toString(*tf), "Packed<T, U...>")
  // PENDING ASSERTION AUDIT: CHECK_EQ(toString(*tf, {true}), "{ a: T, b: (U...) -> () }")
  // PENDING MODULE AUDIT: shared game/A resolver and imported alias Packed from Import.
  {
    "name": "type_alias_type_packs_import",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
export type Packed<T, U...> = { a: T, b: (U...) -> () }
return {}
    `,
        "expect": [
          {
            "errors": 0
          }
        ],
        "module": "game/A"
      },
      {
        "source": `
local Import = require(game.A)
local a: Import.Packed<number>
local b: Import.Packed<string, number>
local c: Import.Packed<string, number, boolean>
local d: { a: typeof(c) }
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "a",
            "equals": "{ a: number, b: () -> () }",
            "options": {
              "exhaustive": true
            }
          },
          {
            "type": "b",
            "equals": "{ a: string, b: (number) -> () }",
            "options": {
              "exhaustive": true
            }
          },
          {
            "type": "c",
            "equals": "{ a: string, b: (number, boolean) -> () }",
            "options": {
              "exhaustive": true
            }
          },
          {
            "type": "d",
            "equals": "{ a: Packed<string, number, boolean> }"
          }
        ],
        "unparsed": {
          "defect": 879
        }
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:396 TEST_CASE_FIXTURE(BuiltinsFixture, "type_pack_type_parameters")
  // PENDING MODULE AUDIT: shared game/A resolver.
  {
    "name": "type_pack_type_parameters",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
export type Packed<T, U...> = { a: T, b: (U...) -> () }
return {}
    `,
        "module": "game/A",
        "expect": []
      },
      {
        "source": `
local Import = require(game.A)
type Alias<S, T, R...> = Import.Packed<S, (T, R...)>
local a: Alias<string, number, boolean>

type B<X...> = Import.Packed<string, X...>
type C<X...> = Import.Packed<string, (number, X...)>
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "alias": "Alias"
          },
          {
            "alias": "Alias",
            "equals": "Alias<S, T, R...>"
          },
          {
            "alias": "Alias",
            "equals": "{ a: S, b: (T, R...) -> () }",
            "options": {
              "exhaustive": true
            }
          },
          {
            "type": "a",
            "equals": "{ a: string, b: (number, boolean) -> () }",
            "options": {
              "exhaustive": true
            }
          },
          {
            "alias": "B"
          },
          {
            "alias": "B",
            "equals": "B<X...>"
          },
          {
            "alias": "B",
            "equals": "{ a: string, b: (X...) -> () }",
            "options": {
              "exhaustive": true
            }
          },
          {
            "alias": "C"
          },
          {
            "alias": "C",
            "equals": "C<X...>"
          },
          {
            "alias": "C",
            "equals": "{ a: string, b: (number, X...) -> () }",
            "options": {
              "exhaustive": true
            }
          }
        ],
        "unparsed": {
          "defect": 879
        }
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:431 TEST_CASE_FIXTURE(Fixture, "type_alias_type_packs_nested")
  {
    "name": "type_alias_type_packs_nested",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
type Packed1<T...> = (T...) -> (T...)
type Packed2<T...> = (Packed1<T...>, T...) -> (Packed1<T...>, T...)
type Packed3<T...> = (Packed2<T...>, T...) -> (Packed2<T...>, T...)
type Packed4<T...> = (Packed3<T...>, T...) -> (Packed3<T...>, T...)
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "alias": "Packed4"
          },
          {
            "alias": "Packed4",
            "equals": "((((T...) -> (T...), T...) -> ((T...) -> (T...), T...), T...) -> (((T...) -> (T...), T...) -> ((T...) -> (T...), T...), T...), T...) -> ((((T...) -> (T...), T...) -> ((T...) -> (T...), T...), T...) -> (((T...) -> (T...), T...) -> ((T...) -> (T...), T...), T...), T...)"
          }
        ]
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:451 TEST_CASE_FIXTURE(Fixture, "type_alias_type_pack_variadic")
  {
    "name": "type_alias_type_pack_variadic",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
type X<T...> = (T...) -> (string, T...)

type D = X<...number>
type E = X<(number, ...string)>
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "alias": "D"
          },
          {
            "alias": "E"
          },
          {
            "alias": "D",
            "equals": "(...number) -> (string, ...number)"
          },
          {
            "alias": "E",
            "equals": "(number, ...string) -> (string, number, ...string)"
          }
        ],
        "unparsed": {
          "defect": 876
        }
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:470 TEST_CASE_FIXTURE(Fixture, "type_alias_type_pack_multi")
  {
    "name": "type_alias_type_pack_multi",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
type Y<T..., U...> = (T...) -> (U...)
type A<S...> = Y<S..., S...>
type B<S...> = Y<(number, ...string), S...>

type Z<T, U...> = (T) -> (U...)
type E<S...> = Z<number, S...>
type F<S...> = Z<number, (string, S...)>

type W<T, U..., V...> = (T, U...) -> (T, V...)
type H<S..., R...> = W<number, S..., R...>
type I<S..., R...> = W<number, (string, S...), R...>
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "alias": "A",
            "equals": "(S...) -> (S...)"
          },
          {
            "alias": "B",
            "equals": "(number, ...string) -> (S...)"
          },
          {
            "alias": "E",
            "equals": "(number) -> (S...)"
          },
          {
            "alias": "F",
            "equals": "(number) -> (string, S...)"
          },
          {
            "alias": "H",
            "equals": "(number, S...) -> (number, R...)"
          },
          {
            "alias": "I",
            "equals": "(number, string, S...) -> (number, R...)"
          }
        ],
        "unparsed": {
          "defect": 876
        }
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:498 TEST_CASE_FIXTURE(Fixture, "type_alias_type_pack_explicit")
  {
    "name": "type_alias_type_pack_explicit",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
type X<T...> = (T...) -> (T...)

type A<S...> = X<(S...)>
type B = X<()>
type C = X<(number)>
type D = X<(number, string)>
type E = X<(...number)>
type F = X<(string, ...number)>
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "alias": "A",
            "equals": "(S...) -> (S...)"
          },
          {
            "alias": "B",
            "equals": "() -> ()"
          },
          {
            "alias": "C",
            "equals": "(number) -> number"
          },
          {
            "alias": "D",
            "equals": "(number, string) -> (number, string)"
          },
          {
            "alias": "E",
            "equals": "(...number) -> (...number)"
          },
          {
            "alias": "F",
            "equals": "(string, ...number) -> (string, ...number)"
          }
        ],
        "unparsed": {
          "defect": 876
        }
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:521 TEST_CASE_FIXTURE(Fixture, "type_alias_type_pack_explicit_multi")
  {
    "name": "type_alias_type_pack_explicit_multi",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
type Y<T..., U...> = (T...) -> (U...)

type A = Y<(number, string), (boolean)>
type B = Y<(), ()>
type C<S...> = Y<...string, (number, S...)>
type D<X...> = Y<X..., (number, string, X...)>
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "alias": "A",
            "equals": "(number, string) -> boolean"
          },
          {
            "alias": "B",
            "equals": "() -> ()"
          },
          {
            "alias": "C",
            "equals": "(...string) -> (number, S...)"
          },
          {
            "alias": "D",
            "equals": "(X...) -> (number, string, X...)"
          }
        ],
        "unparsed": {
          "defect": 876
        }
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:540 TEST_CASE_FIXTURE(Fixture, "type_alias_type_pack_explicit_multi_tostring")
  {
    "name": "type_alias_type_pack_explicit_multi_tostring",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
type Y<T..., U...> = { f: (T...) -> (U...) }

local a: Y<(number, string), (boolean)>
local b: Y<(), ()>
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "a",
            "equals": "Y<(number, string), (boolean)>"
          },
          {
            "type": "b",
            "equals": "Y<(), ()>"
          }
        ]
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:555 TEST_CASE_FIXTURE(Fixture, "type_alias_backwards_compatible")
  {
    "name": "type_alias_backwards_compatible",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        type X<T> = () -> T
        type Y<T, U> = (T) -> U

        type A = X<(number)>
        type B = Y<(number), (boolean)>
        type C = Y<(number), boolean>
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "alias": "A",
            "equals": "() -> number"
          },
          {
            "alias": "B",
            "equals": "(number) -> boolean"
          },
          {
            "alias": "C",
            "equals": "(number) -> boolean"
          }
        ]
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:573 TEST_CASE_FIXTURE(Fixture, "type_alias_type_packs_errors")
  {
    "name": "type_alias_type_packs_errors",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
type Packed<T, U, V...> = (T, U) -> (V...)
local b: Packed<number>
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "message": "Generic type 'Packed<T, U, V...>' expects at least 2 type arguments, but only 1 is specified"
          }
        ]
      },
      {
        "source": `
type Packed<T, U> = (T, U) -> ()
type B<X...> = Packed<number, string, X...>
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "message": "Generic type 'Packed<T, U>' expects 0 type pack arguments, but 1 is specified"
          }
        ]
      },
      {
        "source": `
type Packed<T..., U...> = (T...) -> (U...)
type Other<S...> = Packed<S..., string>
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "message": "Type parameters must come before type pack parameters"
          }
        ]
      },
      {
        "source": `
type Packed<T, U> = (T) -> U
type Other<S...> = Packed<number, S...>
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "message": "Generic type 'Packed<T, U>' expects 2 type arguments, but only 1 is specified"
          }
        ]
      },
      {
        "source": `
type Packed<T..., U...> = (T...) -> (U...)
type Other = Packed<>
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "message": "Generic type 'Packed<T..., U...>' expects 2 type pack arguments, but none are specified"
          }
        ]
      },
      {
        "source": `
type Packed<T..., U...> = (T...) -> (U...)
type Other = Packed<number, string>
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "message": "Generic type 'Packed<T..., U...>' expects 2 type pack arguments, but only 1 is specified"
          }
        ]
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:624 TEST_CASE_FIXTURE(Fixture, "type_alias_instantiated_but_missing_parameter_list")
  {
    "name": "type_alias_instantiated_but_missing_parameter_list",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
type Packed<T...> = (T...) -> T...
local a: Packed
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "message": "Generic type 'Packed<T...>' expects 1 type pack argument, but none are specified"
          }
        ]
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:638 TEST_CASE_FIXTURE(Fixture, "type_alias_default_type_explicit")
  {
    "name": "type_alias_default_type_explicit",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
type Y<T, U = string> = { a: T, b: U }

local a: Y<number, number> = { a = 2, b = 3 }
local b: Y<number> = { a = 2, b = "s" }
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "a",
            "equals": "Y<number, number>"
          },
          {
            "type": "b",
            "equals": "Y<number, string>"
          }
        ]
      },
      {
        "source": `
type Y<T = string> = { a: T }

local a: Y<number> = { a = 2 }
local b: Y<> = { a = "s" }
local c: Y = { a = "s" }
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "a",
            "equals": "Y<number>"
          },
          {
            "type": "b",
            "equals": "Y<string>"
          },
          {
            "type": "c",
            "equals": "Y<string>"
          }
        ]
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:667 TEST_CASE_FIXTURE(Fixture, "type_alias_default_type_self")
  {
    "name": "type_alias_default_type_self",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
type Y<T, U = T> = { a: T, b: U }

local a: Y<number> = { a = 2, b = 3 }
local b: Y<string> = { a = "h", b = "s" }
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "a",
            "equals": "Y<number, number>"
          },
          {
            "type": "b",
            "equals": "Y<string, string>"
          }
        ]
      },
      {
        "source": `
type Y<T, U = (T, T) -> string> = { a: T, b: U }

local a: Y<number>
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "a",
            "equals": "Y<number, (number, number) -> string>"
          }
        ]
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:692 TEST_CASE_FIXTURE(Fixture, "type_alias_default_type_chained")
  {
    "name": "type_alias_default_type_chained",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
type Y<T, U = T, V = U> = { a: T, b: U, c: V }

local a: Y<number>
local b: Y<number, string>
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "a",
            "equals": "Y<number, number, number>"
          },
          {
            "type": "b",
            "equals": "Y<number, string, string>"
          }
        ]
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:707 TEST_CASE_FIXTURE(Fixture, "type_alias_default_type_pack_explicit")
  {
    "name": "type_alias_default_type_pack_explicit",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
type Y<T... = (string, number)> = { a: (T...) -> () }
local a: Y<>
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "a",
            "equals": "Y<string, number>"
          }
        ]
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:719 TEST_CASE_FIXTURE(Fixture, "type_alias_default_type_pack_self_ty")
  {
    "name": "type_alias_default_type_pack_self_ty",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
type Y<T, U... = ...T> = { a: T, b: (U...) -> T }

local a: Y<number>
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "a",
            "equals": "Y<number, ...number>"
          }
        ],
        "unparsed": {
          "defect": 876
        }
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:732 TEST_CASE_FIXTURE(Fixture, "type_alias_default_type_pack_self_tp")
  {
    "name": "type_alias_default_type_pack_self_tp",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
type Y<T..., U... = T...> = { a: (T...) -> U... }
local a: Y<number, string>
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "a",
            "equals": "Y<(number, string), (number, string)>"
          }
        ]
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:744 TEST_CASE_FIXTURE(Fixture, "type_alias_default_type_pack_self_chained_tp")
  {
    "name": "type_alias_default_type_pack_self_chained_tp",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
type Y<T..., U... = T..., V... = U...> = { a: (T...) -> U..., b: (T...) -> V... }
local a: Y<number, string>
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "a",
            "equals": "Y<(number, string), (number, string), (number, string)>"
          }
        ]
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:756 TEST_CASE_FIXTURE(Fixture, "type_alias_default_mixed_self")
  {
    "name": "type_alias_default_mixed_self",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
type Y<T, U = T, V... = ...number, W... = (T, U, V...)> = { a: (T, U, V...) -> W... }
local a: Y<number>
local b: Y<number, string>
local c: Y<number, string, ...boolean>
local d: Y<number, string, ...boolean, ...() -> ()>
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "a",
            "equals": "Y<number, number, ...number, (number, number, ...number)>"
          },
          {
            "type": "b",
            "equals": "Y<number, string, ...number, (number, string, ...number)>"
          },
          {
            "type": "c",
            "equals": "Y<number, string, ...boolean, (number, string, ...boolean)>"
          },
          {
            "type": "d",
            "equals": "Y<number, string, ...boolean, ...() -> ()>"
          }
        ],
        "unparsed": {
          "defect": 876
        }
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:774 TEST_CASE_FIXTURE(Fixture, "type_alias_default_type_errors")
  {
    "name": "type_alias_default_type_errors",
    "fixture": "Fixture",
    "flags": {
      "LuauStrictVisitInstantiatedType": true
    },
    "checks": [
      {
        "source": `
            type Y<T = T> = { a: T }
            local a: Y = { a = 2 }
        `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "message": "Unknown type 'T'"
          }
        ],
        "mode": "strict"
      },
      {
        "source": `
            type Y<T = T> = { a: T }
            local a: Y = { a = 2 }
        `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "message": "Unknown type 'T'"
          }
        ],
        "mode": "nonstrict"
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:790 TEST_CASE_FIXTURE(Fixture, "type_alias_default_type_errors2")
  {
    "name": "type_alias_default_type_errors2",
    "fixture": "Fixture",
    "flags": {
      "LuauStrictVisitInstantiatedType": true
    },
    "checks": [
      {
        "source": `
            type Y<T... = T...> = { a: (T...) -> () }
            local a: Y<>
        `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "message": "Unknown type 'T'"
          }
        ],
        "mode": "strict"
      },
      {
        "source": `
            type Y<T... = T...> = { a: (T...) -> () }
            local a: Y<>
        `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "message": "Unknown type 'T'"
          }
        ],
        "mode": "nonstrict"
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:806 TEST_CASE_FIXTURE(Fixture, "type_alias_default_type_errors3")
  {
    "name": "type_alias_default_type_errors3",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        type Y<T = string, U... = ...string> = { a: (T) -> U... }
        local a: Y<...number>
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "message": "Type parameters must come before type pack parameters"
          }
        ],
        "unparsed": {
          "defect": 876
        }
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:820 TEST_CASE_FIXTURE(Fixture, "type_alias_default_type_errors4")
  {
    "name": "type_alias_default_type_errors4",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        type Packed<T> = (T) -> T
        local a: Packed
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "message": "Generic type 'Packed<T>' expects 1 type argument, but none are specified"
          }
        ]
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:834 TEST_CASE_FIXTURE(Fixture, "type_alias_default_type_errors5")
  {
    "name": "type_alias_default_type_errors5",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        type Y<T, U = T, V> = { a: T }
        local a: Y<number>
    `,
        "expect": [
          {
            "errors": "some"
          }
        ]
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:844 TEST_CASE_FIXTURE(Fixture, "type_alias_default_type_errors6")
  {
    "name": "type_alias_default_type_errors6",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        type Y<T..., U... = T..., V...> = { a: T }
        local a: Y<...number>
    `,
        "expect": [
          {
            "errors": "some"
          }
        ],
        "malformed": "The V... type pack has no default after another type pack has a default."
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:854 TEST_CASE_FIXTURE(BuiltinsFixture, "type_alias_default_export")
  // PENDING MODULE AUDIT: shared Module/Types and Module/Users resolver; named module-specific type queries.
  {
    "name": "type_alias_default_export",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
export type A<T, U = string> = { a: T, b: U }
export type B<T, U = T> = { a: T, b: U }
export type C<T, U = (T, T) -> string> = { a: T, b: U }
export type D<T, U = T, V = U> = { a: T, b: U, c: V }
export type E<T... = (string, number)> = { a: (T...) -> () }
export type F<T, U... = ...T> = { a: T, b: (U...) -> T }
export type G<T..., U... = ()> = { b: (U...) -> T... }
export type H<T... = ()> = { b: (T...) -> T... }
return {}
    `,
        "expect": [
          {
            "errors": 0
          }
        ],
        "module": "Module/Types",
        "unparsed": {
          "defect": 876
        }
      },
      {
        "source": `
local Types = require(script.Parent.Types)

local a: Types.A<number>
local b: Types.B<number>
local c: Types.C<number>
local d: Types.D<number>
local e: Types.E<>
local eVoid: Types.E<()>
local f: Types.F<number>
local g: Types.G<...number>
local h: Types.H<>
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "a",
            "equals": "A<number, string>"
          },
          {
            "type": "b",
            "equals": "B<number, number>"
          },
          {
            "type": "c",
            "equals": "C<number, (number, number) -> string>"
          },
          {
            "type": "d",
            "equals": "D<number, number, number>"
          },
          {
            "type": "e",
            "equals": "E<string, number>"
          },
          {
            "type": "eVoid",
            "equals": "E<>"
          },
          {
            "type": "f",
            "equals": "F<number, ...number>"
          },
          {
            "type": "g",
            "equals": "G<...number, ()>"
          },
          {
            "type": "h",
            "equals": "H<>"
          }
        ],
        "module": "Module/Users",
        "unparsed": {
          "defect": 879
        }
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:899 TEST_CASE_FIXTURE(Fixture, "type_alias_default_type_skip_brackets")
  {
    "name": "type_alias_default_type_skip_brackets",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
type Y<T... = ...string> = (T...) -> number
local a: Y
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "a",
            "equals": "(...string) -> number"
          }
        ],
        "unparsed": {
          "defect": 876
        }
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:911 TEST_CASE_FIXTURE(Fixture, "type_alias_defaults_confusing_types")
  {
    "name": "type_alias_defaults_confusing_types",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
type A<T, U = T, V... = ...any, W... = V...> = (T, V...) -> (U, W...)
type B = A<string, (number)>
type C = A<string, (number), (boolean)>
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "alias": "B",
            "equals": "(string, ...any) -> (number, ...any)",
            "options": {
              "exhaustive": true
            }
          },
          {
            "alias": "C",
            "equals": "(string, boolean) -> (number, boolean)",
            "options": {
              "exhaustive": true
            }
          }
        ],
        "unparsed": {
          "defect": 876
        }
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:925 TEST_CASE_FIXTURE(Fixture, "type_alias_defaults_recursive_type")
  {
    "name": "type_alias_defaults_recursive_type",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
type F<K = string, V = (K) -> ()> = (K) -> V
type R = { m: F<R> }
    `,
        "expect": [
          {
            "errors": 0
          },
          {
            "alias": "R",
            "equals": "t1 where t1 = { m: (t1) -> (t1) -> () }",
            "options": {
              "exhaustive": true
            }
          }
        ]
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:937 TEST_CASE_FIXTURE(Fixture, "pack_tail_unification_check")
  {
    "name": "pack_tail_unification_check",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
local a: () -> (number, ...string)
local b: () -> (number, ...boolean)
a = b
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "message": "Expected this to be\n\t'() -> (number, ...string)'\nbut got\n\t'() -> (number, ...boolean)'; \nExpected the variadic return value to be `string`, but got `boolean`"
          }
        ],
        "unparsed": {
          "defect": 876
        }
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:978 TEST_CASE_FIXTURE(Fixture, "function_return_count_mismatch_reports_expected_return_pack")
  {
    "name": "function_return_count_mismatch_reports_expected_return_pack",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
local x: () -> number
local y: () -> (string, boolean) = x
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "message": "Expected this to be\n\t'() -> (string, boolean)'\nbut got\n\t'() -> number'; \nExpected to return `(string, boolean)`, but got `number`"
          }
        ]
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:1009 TEST_CASE_FIXTURE(Fixture, "function_return_count_mismatch_through_union_reports_expected_return_pack")
  // PENDING ASSERTION AUDIT: CHECK(message.find("Expected to return") == std::string::npos)
  // PENDING ASSERTION AUDIT: CHECK(message.find("is not a subtype of") != std::string::npos)
  {
    "name": "function_return_count_mismatch_through_union_reports_expected_return_pack",
    "fixture": "Fixture",
    "flags": {
      "LuauNewTypePathErrorMessages": true
    },
    "checks": [
      {
        "source": `
local x: ((number) -> number) | ((number) -> string)
local y: ((number) -> (boolean, boolean)) | ((number) -> (boolean, string)) = x
    `,
        "expect": [
          {
            "errors": 1
          }
        ]
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:1026 TEST_CASE_FIXTURE(Fixture, "function_return_count_mismatch_through_intersection_reports_expected_return_pack")
  // PENDING ASSERTION AUDIT: CHECK(message.find("Expected to return") != std::string::npos)
  {
    "name": "function_return_count_mismatch_through_intersection_reports_expected_return_pack",
    "fixture": "Fixture",
    "flags": {
      "LuauNewTypePathErrorMessages": true
    },
    "checks": [
      {
        "source": `
local x: ((number) -> number) & ((number) -> string)
local y: ((number) -> (boolean, boolean)) & ((number) -> (boolean, string)) = x
    `,
        "expect": [
          {
            "errors": 1
          }
        ]
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:1042 TEST_CASE_FIXTURE(Fixture, "nested_function_return_count_mismatch_preserves_the_function_context")
  {
    "name": "nested_function_return_count_mismatch_preserves_the_function_context",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
local x: () -> (() -> number)
local y: () -> (() -> (string, boolean)) = x
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "message": "Expected this to be\n\t'() -> () -> (string, boolean)'\nbut got\n\t'() -> () -> number'; \nExpected the 1st return value of the function returned by this function to be `string`, but the return type of the function returned by this function is `number`"
          }
        ]
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:1076 TEST_CASE_FIXTURE(Fixture, "unifying_vararg_pack_with_fixed_length_pack_produces_fixed_length_pack")
  {
    "name": "unifying_vararg_pack_with_fixed_length_pack_produces_fixed_length_pack",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        function a(x) return 1 end
        a(...)
    `,
        "expect": []
      }
    ],
    "skip": {
      "disabledUpstream": true
    }
  },
  // TypeInfer.typePacks.test.cpp:1104 TEST_CASE_FIXTURE(Fixture, "dont_ice_if_a_TypePack_is_an_error")
  {
    "name": "dont_ice_if_a_TypePack_is_an_error",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        --!strict
        function f(s)
            print(s)
            return f
        end

        f("foo")("bar")
    `,
        "expect": []
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:1117 TEST_CASE_FIXTURE(Fixture, "cyclic_type_packs")
  {
    "name": "cyclic_type_packs",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
--!nonstrict
_ += _(_,...)
repeat
_ += _(...)
until ... + _
`,
        "expect": []
      },
      {
        "source": `
--!nonstrict
_ += _(_(...,...),_(...))
repeat
until _
`,
        "expect": []
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:1136 TEST_CASE_FIXTURE(BuiltinsFixture, "detect_cyclic_typepacks")
  {
    "name": "detect_cyclic_typepacks",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        type ( ... ) ( ) ;
        ( ... ) ( - - ... ) ( - ... )
        type = ( ... ) ;
        ( ... ) (  ) ( ... ) ;
        ( ... ) ""
    `,
        "expect": [
          {
            "errors": "some"
          }
        ]
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:1149 TEST_CASE_FIXTURE(BuiltinsFixture, "detect_cyclic_typepacks2")
  {
    "name": "detect_cyclic_typepacks2",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
        function _(l0:((typeof((pcall)))|((((t0)->())|(typeof(-67108864)))|(any)))|(any),...):(((typeof(0))|(any))|(any),typeof(-67108864),any)
            xpcall(_,_,_)
            _(_,_,_)
        end
    `,
        "expect": [
          {
            "errors": 2
          },
          {
            "error": 0,
            "message": "Unknown type 't0'"
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
  // TypeInfer.typePacks.test.cpp:1165 TEST_CASE_FIXTURE(Fixture, "unify_variadic_tails_in_arguments")
  {
    "name": "unify_variadic_tails_in_arguments",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        function foo(...: string): number
            return 1
        end

        function bar(...: number): number
            return foo(...)
        end
    `,
        "expect": []
      }
    ],
    "skip": {
      "newSolver": "does not pass on Luau's new solver upstream"
    }
  },
  // TypeInfer.typePacks.test.cpp:1183 TEST_CASE_FIXTURE(Fixture, "unify_variadic_tails_in_arguments_free")
  {
    "name": "unify_variadic_tails_in_arguments_free",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        function foo<T...>(...: T...): T...
            return ...
        end

        function bar(...: number): boolean
            return foo(...)
        end
    `,
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "message": "Expected this to be 'boolean', but got '...number'; \nthe type pack's tail is `...number`, which is not a subtype of `boolean`"
          }
        ]
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:1213 TEST_CASE_FIXTURE(BuiltinsFixture, "type_packs_with_tails_in_vararg_adjustment")
  {
    "name": "type_packs_with_tails_in_vararg_adjustment",
    "fixture": "BuiltinsFixture",
    "flags": {
      "LuauInstantiateInSubtyping": true
    },
    "checks": [
      {
        "source": `
        local function wrapReject<TArg, TResult>(fn: (self: any, ...TArg) -> ...TResult): (self: any, ...TArg) -> ...TResult
            return function(self, ...)
                local arguments = { ... }
                local ok, result = pcall(function()
                    return fn(self, table.unpack(arguments))
                end)
                return result
            end
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
  // TypeInfer.typePacks.test.cpp:1234 TEST_CASE_FIXTURE(BuiltinsFixture, "generalize_expectedTypes_with_proper_scope")
  {
    "name": "generalize_expectedTypes_with_proper_scope",
    "fixture": "BuiltinsFixture",
    "flags": {
      "LuauInstantiateInSubtyping": true
    },
    "checks": [
      {
        "source": `
        local function f<TResult>(fn: () -> ...TResult): () -> ...TResult
            return function()
            end
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
  // TypeInfer.typePacks.test.cpp:1251 TEST_CASE_FIXTURE(Fixture, "fuzz_typepack_iter_follow")
  {
    "name": "fuzz_typepack_iter_follow",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
local _
local _ = _,_(),_(_)
    `,
        "expect": [
          {
            "errors": "some"
          }
        ]
      }
    ]
  },
  // TypeInfer.typePacks.test.cpp:1261 TEST_CASE_FIXTURE(BuiltinsFixture, "fuzz_typepack_iter_follow_2")
  {
    "name": "fuzz_typepack_iter_follow_2",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": `
function test(name, searchTerm)
    local found = string.find(name:lower(), searchTerm:lower())
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
  // TypeInfer.typePacks.test.cpp:1273 TEST_CASE_FIXTURE(Fixture, "type_param_overflow")
  {
    "name": "type_param_overflow",
    "fixture": "Fixture",
    "checks": [
      {
        "source": `
        type Two<T,U> = { a: T, b: U }
        local x: Two<number, string, number> = { a = 1, b = 'c' }
    `,
        "expect": [
          {
            "errors": 1
          }
        ]
      }
    ]
  },
]);
