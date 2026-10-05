// Pinned Luau 7d5f73364fdbbaa984fa545071630eba73cfea98.
import { portUpstreamFile } from "./portedCases";

portUpstreamFile("TypeInfer.metatableOOP.test.cpp", [
  // TypeInfer.metatableOOP.test.cpp:24 dont_suggest_using_colon_rather_than_dot_if_not_defined_with_colon
  {
    "name": "dont_suggest_using_colon_rather_than_dot_if_not_defined_with_colon",
    "fixture": "Fixture",
    "checks": [
      {
        "source": "\n        local someTable = {}\n\n        local function abs(x: number)\n            if x < 0 then\n                return -x\n            else\n                return x\n            end\n        end\n\n        someTable.Function1 = function(Arg1)\n            abs(Arg1)\n        end\n\n        someTable.Function1() -- Argument count mismatch\n    ",
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "code": "CountMismatch"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.metatableOOP.test.cpp:50 dont_suggest_using_colon_rather_than_dot_if_it_wont_help_2
  {
    "name": "dont_suggest_using_colon_rather_than_dot_if_it_wont_help_2",
    "fixture": "Fixture",
    "checks": [
      {
        "source": "\n        local someTable = {}\n\n        local function abs(x: number)\n            if x < 0 then\n                return -x\n            else\n                return x\n            end\n        end\n\n        someTable.Function2 = function(Arg1, Arg2)\n            abs(Arg1)\n            abs(Arg2)\n        end\n\n        someTable.Function2() -- Argument count mismatch\n    ",
        "expect": [
          {
            "errors": 1
          },
          {
            "error": 0,
            "code": "CountMismatch"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.metatableOOP.test.cpp:77 dont_suggest_using_colon_rather_than_dot_if_another_overload_works
  {
    "name": "dont_suggest_using_colon_rather_than_dot_if_another_overload_works",
    "fixture": "Fixture",
    "checks": [
      {
        "source": "\n        type T = {method: ((T, number) -> number) & ((number) -> number)}\n        local T: T\n\n        T.method(4)\n    ",
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.metatableOOP.test.cpp:89 method_depends_on_table
  {
    "name": "method_depends_on_table",
    "fixture": "Fixture",
    "checks": [
      {
        "source": "\n        -- This catches a bug where x:m didn't count as a use of x\n        -- so toposort would happily reorder a definition of\n        -- function x:m before the definition of x.\n        function g() f() end\n        local x = {}\n        function x:m() end\n        function f() x:m() end\n    ",
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.metatableOOP.test.cpp:104 methods_are_topologically_sorted
  {
    "name": "methods_are_topologically_sorted",
    "fixture": "Fixture",
    "checks": [
      {
        "source": "\n        local T = {}\n\n        function T:foo()\n            return T:bar(999), T:bar(\"hi\")\n        end\n\n        function T:bar(i)\n            return i\n        end\n\n        local a, b = T:foo()\n    ",
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
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.metatableOOP.test.cpp:129 quantify_methods_defined_using_dot_syntax_and_explicit_self_parameter
  {
    "name": "quantify_methods_defined_using_dot_syntax_and_explicit_self_parameter",
    "fixture": "Fixture",
    "checks": [
      {
        "source": "\n        local T = {}\n\n        function T.method(self)\n            self:method()\n        end\n\n        function T.method2(self)\n            self:method()\n        end\n\n        T:method2()\n    ",
        "expect": []
      }
    ]
  },
  // TypeInfer.metatableOOP.test.cpp:146 inferring_hundreds_of_self_calls_should_not_suffocate_memory
  {
    "name": "inferring_hundreds_of_self_calls_should_not_suffocate_memory",
    "fixture": "Fixture",
    "checks": [
      {
        "source": "\n        (\"foo\")\n            :lower()\n            :lower()\n            :lower()\n            :lower()\n            :lower()\n            :lower()\n            :lower()\n            :lower()\n            :lower()\n            :lower()\n            :lower()\n            :lower()\n            :lower()\n            :lower()\n            :lower()\n            :lower()\n            :lower()\n            :lower()\n    ",
        "expect": [
          {
            "internalTypes": {
              "maximum": 80
            }
          }
        ]
      }
    ]
  },
  // TypeInfer.metatableOOP.test.cpp:177 pass_too_many_arguments
  {
    "name": "pass_too_many_arguments",
    "fixture": "Fixture",
    "checks": [
      {
        "source": "\n        type T = {\n            method: (T, number) -> number\n        }\n\n        function makeT(): T\n            return {\n                method=function(self, number)\n                    return number * 2\n                end\n            }\n        end\n\n        local a = makeT()\n        a:method(5, 7)\n    ",
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
              "actual": 3
            }
          }
        ]
      }
    ]
  },
  // TypeInfer.metatableOOP.test.cpp:207 object_constructor_can_refer_to_method_of_self
  {
    "name": "object_constructor_can_refer_to_method_of_self",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": "\n        --!strict\n\n        type Foo = {\n            fooConn: () -> () | nil\n        }\n\n        local Foo = {}\n        Foo.__index = Foo\n\n        function Foo.new()\n            local self: Foo = {\n                fooConn = nil,\n            }\n            setmetatable(self, Foo)\n\n            self.fooConn = function()\n                self:method() -- Key 'method' not found in table self\n            end\n\n            return self\n        end\n\n        function Foo:method()\n            print(\"foo\")\n        end\n\n        local foo = Foo.new()\n\n        -- TODO This is the best our current refinement support can offer :(\n        local bar = foo.fooConn\n        if bar then bar() end\n\n        -- foo.fooConn()\n    ",
        "expect": [
          {
            "errors": 0
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.metatableOOP.test.cpp:251 CheckMethodsOfSealed
  {
    "name": "CheckMethodsOfSealed",
    "fixture": "Fixture",
    "checks": [
      {
        "source": "\nlocal x: {prop: number} = {prop=9999}\nfunction x:y(z: number)\n    local s: string = z\nend\n",
        "expect": [
          {
            "errors": 2
          }
        ]
      }
    ]
  },
  // TypeInfer.metatableOOP.test.cpp:263 nonstrict_self_mismatch_tail
  {
    "name": "nonstrict_self_mismatch_tail",
    "fixture": "Fixture",
    "checks": [
      {
        "source": "\n        --!nonstrict\n        local f = {}\n        function f:foo(a: number, b: number) end\n\n        function bar(...)\n            f.foo(f, 1, ...)\n        end\n\n        bar(2)\n    ",
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.metatableOOP.test.cpp:279 inferred_methods_of_free_tables_have_the_same_level_as_the_enclosing_table
  {
    "name": "inferred_methods_of_free_tables_have_the_same_level_as_the_enclosing_table",
    "fixture": "Fixture",
    "checks": [
      {
        "source": "\n        function Base64FileReader(data)\n            local reader = {}\n            local index: number = 0\n\n            function reader:PeekByte()\n                return data:byte(index)\n            end\n\n            function reader:Byte()\n                return data:byte(index - 1)\n            end\n\n            return reader\n        end\n\n        Base64FileReader()\n\n        function ReadMidiEvents(data)\n\n            local reader = Base64FileReader(data)\n\n            while reader:HasMore() do\n                (reader:Byte() % 128)\n            end\n        end\n    ",
        "expect": [],
        "malformed": "Pinned Luau parser rejects the standalone parenthesized modulo expression at [23,16,23,37]: Incomplete statement: expected assignment or a function call."
      }
    ]
  },
  // TypeInfer.metatableOOP.test.cpp:310 table_oop
  {
    "name": "table_oop",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": "\n   --!strict\nlocal Class = {}\nClass.__index = Class\n\ntype Class = typeof(setmetatable({} :: { x: number }, Class))\n\nfunction Class.new(x: number): Class\n    return setmetatable({x = x}, Class)\nend\n\nfunction Class.getx(self: Class)\n    return self.x\nend\n\nfunction test()\n    local c = Class.new(42)\n    local n = c:getx()\n    local nn = c.x\n\n    print(string.format(\"%d %d\", n, nn))\nend\n",
        "expect": [
          {
            "errors": 0
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.metatableOOP.test.cpp:341 set_prop_of_intersection_containing_metatable
  {
    "name": "set_prop_of_intersection_containing_metatable",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": "\n        export type Set<T> = typeof(setmetatable(\n            {} :: {\n                add: (self: Set<T>, T) -> Set<T>,\n            },\n            {}\n        ))\n\n        local Set = {} :: Set<any> & {}\n\n        function Set:add(t)\n            return self\n        end\n    ",
        "expect": []
      }
    ]
  },
  // TypeInfer.metatableOOP.test.cpp:360 dont_bind_free_tables_to_themselves
  {
    "name": "dont_bind_free_tables_to_themselves",
    "fixture": "Fixture",
    "checks": [
      {
        "source": "\n        local T = {}\n        local b: any\n\n        function T:m()\n            local a = b[i]\n            if a then\n                self:n()\n                if self:p(a) then\n                    self:n()\n                end\n            end\n        end\n    ",
        "expect": []
      }
    ]
  },
  // TypeInfer.metatableOOP.test.cpp:379 flag_when_index_metamethod_returns_0_values
  {
    "name": "flag_when_index_metamethod_returns_0_values",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": "\n        local T = {}\n        function T.__index()\n        end\n\n        local a = setmetatable({}, T)\n        local p = a.prop\n    ",
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "p",
            "equals": "nil"
          }
        ]
      }
    ]
  },
  // TypeInfer.metatableOOP.test.cpp:395 augmenting_an_unsealed_table_with_a_metatable
  {
    "name": "augmenting_an_unsealed_table_with_a_metatable",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": "\n        local A = {number = 8}\n\n        local B = setmetatable({}, A)\n\n        function B:method()\n            return \"hello!!\"\n        end\n    ",
        "expect": [
          {
            "type": "B",
            "equals": "setmetatable<{ method: (unknown) -> string }, { number: number }>",
            "options": {
              "exhaustive": true
            }
          }
        ]
      }
    ]
  },
  // TypeInfer.metatableOOP.test.cpp:413 react_style_oo
  {
    "name": "react_style_oo",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": "\n        local Prototype = {}\n\n        local ClassMetatable = {\n            __index = Prototype\n        }\n\n        local BaseClass = (setmetatable({}, ClassMetatable))\n\n        function BaseClass:extend(name)\n            local class = {\n                name=name\n            }\n\n            class.__index = class\n\n            function class.ctor(props)\n                return setmetatable({props=props}, class)\n            end\n\n            return setmetatable(class, getmetatable(self))\n        end\n\n        local C = BaseClass:extend('C')\n        local i = C.ctor({hello='world'})\n\n        local iName = i.name\n        local cName = C.name\n        local hello = i.props.hello\n    ",
        "expect": [
          {
            "errors": 0
          },
          {
            "type": "iName",
            "equals": "string"
          },
          {
            "type": "cName",
            "equals": "string"
          },
          {
            "type": "hello",
            "equals": "string"
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.metatableOOP.test.cpp:455 cycle_between_object_constructor_and_alias
  {
    "name": "cycle_between_object_constructor_and_alias",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": "\n        local T = {}\n        T.__index = T\n\n        function T.new(): T\n            return setmetatable({}, T)\n        end\n\n        export type T = typeof(T.new())\n\n        return T\n    ",
        "expect": [
          {
            "errors": 0
          },
          {
            "exportedAlias": "T"
          },
          {
            "exportedAlias": "T",
            "kind": "MetatableType"
          }
        ]
      }
    ]
  },
  // TypeInfer.metatableOOP.test.cpp:480 promise_type_error_too_complex
  {
    "name": "promise_type_error_too_complex",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": "\n        --!strict\n\n        local Promise = {}\n        Promise.prototype = {}\n        Promise.__index = Promise.prototype\n\n        function Promise._new(traceback, callback, parent)\n            if parent ~= nil and not Promise.is(parent)then\n            end\n\n            local self = {\n                _parent = parent,\n            }\n\n            parent._consumers[self] = true\n            setmetatable(self, Promise)\n            self:_reject()\n\n            return self\n        end\n\n        function Promise.resolve(...)\n            return Promise._new(debug.traceback(nil, 2), function(resolve)\n            end)\n        end\n\n        function Promise.reject(...)\n            return Promise._new(debug.traceback(nil, 2), function(_, reject)\n            end)\n        end\n\n        function Promise._try(traceback, callback, ...)\n            return Promise._new(traceback, function(resolve)\n            end)\n        end\n\n        function Promise.try(callback, ...)\n            return Promise._try(debug.traceback(nil, 2), callback, ...)\n        end\n\n        function Promise._all(traceback, promises, amount)\n            if #promises == 0 or amount == 0 then\n                return Promise.resolve({})\n            end\n            return Promise._new(traceback, function(resolve, reject, onCancel)\n            end)\n        end\n\n        function Promise.all(promises)\n            return Promise._all(debug.traceback(nil, 2), promises)\n        end\n\n        function Promise.allSettled(promises)\n            return Promise.resolve({})\n        end\n\n        function Promise.race(promises)\n            return Promise._new(debug.traceback(nil, 2), function(resolve, reject, onCancel)\n            end)\n        end\n\n        function Promise.each(list, predicate)\n            return Promise._new(debug.traceback(nil, 2), function(resolve, reject, onCancel)\n                local predicatePromise = Promise.resolve(predicate(value, index))\n                local success, result = predicatePromise:await()\n            end)\n        end\n\n        function Promise.is(object)\n        end\n\n        function Promise.prototype:_reject(...)\n            self:_finalize()\n        end\n    ",
        "expect": [
          {
            "errors": "some"
          }
        ],
        "retainFullTypeGraphs": false,
        "unparsed": {
          "defect": 922
        }
      }
    ]
  },
  // TypeInfer.metatableOOP.test.cpp:566 method_should_not_create_cyclic_type
  {
    "name": "method_should_not_create_cyclic_type",
    "fixture": "Fixture",
    "checks": [
      {
        "source": "\n        local Component = {}\n\n        function Component:__resolveUpdate(incomingState)\n            local oldState = self.state\n            incomingState = oldState\n            self.state = incomingState\n        end\n    ",
        "expect": [
          {
            "errors": 0
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.metatableOOP.test.cpp:585 cross_module_metatable
  {
    "name": "cross_module_metatable",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": "\n        --!strict\n        local cls = require(game.A)\n        local tbl = {}\n        setmetatable(tbl, cls)\n    ",
        "expect": [
          {
            "errors": 0
          },
          {
            "moduleReturn": true,
            "module": "game/B"
          },
          {
            "moduleReturn": true,
            "module": "game/B"
          },
          {
            "type": "tbl",
            "module": "game/B"
          },
          {
            "type": "tbl",
            "module": "game/B",
            "equals": "setmetatable<tbl, cls>"
          }
        ],
        "ignoreMissingAnnotations": true,
        "module": "game/B",
        "moduleSources": {
          "game/A": "\n        --!strict\n        local cls = {}\n        cls.__index = cls\n        function cls:abc() return 4 end\n        return cls\n    ",
          "game/B": "\n        --!strict\n        local cls = require(game.A)\n        local tbl = {}\n        setmetatable(tbl, cls)\n    "
        },
        "unparsed": {
          "defect": 879
        }
      }
    ]
  },
  // TypeInfer.metatableOOP.test.cpp:620 textbook_class_pattern
  {
    "name": "textbook_class_pattern",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": "\n        local Account = {}\n        Account.__index = Account\n\n        type AccountData = {\n            name: string,\n            balance: number,\n        }\n\n        export type Account = setmetatable<AccountData, typeof(Account)>\n\n        function Account.new(name, balance): Account\n            local self = {}\n            self.name = name\n            self.balance = balance\n\n            return setmetatable(self, Account)\n        end\n    ",
        "expect": [
          {
            "errors": 0
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.metatableOOP.test.cpp:650 textbook_class_pattern_2
  {
    "name": "textbook_class_pattern_2",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": "\n        local Account = {}\n        Account.__index = Account\n\n        type AccountData = {\n            name: string,\n            balance: number,\n        }\n\n        export type Account = setmetatable<AccountData, typeof(Account)>\n\n        function Account.new(name, balance): Account\n            local self = {}\n            self.name = name\n            self.balance = balance\n\n            return setmetatable(self, Account)\n        end\n\n        function Account.deposit(self: Account, credit: number)\n            self.balance += credit\n        end\n\n        function Account.withdraw(self: Account, debit: number)\n            self.balance -= debit\n        end\n\n        function Account.hasBalance(self: Account, amount: number): boolean\n            return self.balance >= amount\n        end\n\n        local account = Account.new(\"Hina\", 500)\n\n        if account:hasBalance(123) then -- TypeError: Value of type 'unknown' could be nil\n        end\n    ",
        "expect": [
          {
            "errors": 0
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.metatableOOP.test.cpp:697 oop_invoke_with_inferred_self_type
  {
    "name": "oop_invoke_with_inferred_self_type",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": "\n        local ItemContainer = {}\n        ItemContainer.__index = ItemContainer\n\n        function ItemContainer.new()\n            local self = {}\n            setmetatable(self, ItemContainer)\n            return self\n        end\n\n        function ItemContainer:removeItem(itemId, itemType)\n            self:getItem(itemId, itemType)\n        end\n\n        function ItemContainer:getItem(itemId, itemType): ()\n        end\n\n        local container = ItemContainer.new()\n\n        container:removeItem(0, \"magic\")\n    ",
        "expect": [
          {
            "errors": 0
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.metatableOOP.test.cpp:724 oop_invoke_with_inferred_self_and_property
  {
    "name": "oop_invoke_with_inferred_self_and_property",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": "\n        local ItemContainer = {}\n        ItemContainer.__index = ItemContainer\n\n        function ItemContainer.new(name)\n            local self = {name = name}\n            setmetatable(self, ItemContainer)\n            return self\n        end\n\n        function ItemContainer:removeItem(itemId, itemType)\n            print(self.name)\n            self:getItem(itemId, itemType)\n        end\n\n        function ItemContainer:getItem(itemId, itemType): ()\n        end\n\n        local container = ItemContainer.new(\"library\")\n\n        container:removeItem(0, \"magic\")\n    ",
        "expect": [
          {
            "errors": 0
          }
        ],
        "ignoreMissingAnnotations": true
      }
    ]
  },
  // TypeInfer.metatableOOP.test.cpp:752 metatable_field_allows_upcast
  {
    "name": "metatable_field_allows_upcast",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": "\n        local Foobar = {}\n        Foobar.__index = Foobar\n        Foobar.const = 42\n\n        local foobar = setmetatable({}, Foobar)\n\n        local _: { read const: number } = foobar\n    ",
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.metatableOOP.test.cpp:769 metatable_field_disallows_invalid_upcast
  {
    "name": "metatable_field_disallows_invalid_upcast",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": "\n        local Foobar = {}\n        Foobar.__index = Foobar\n        Foobar.const = 42\n\n        local foobar = setmetatable({}, Foobar)\n\n        local _: { const: number } = foobar\n    ",
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
            "equals": "{ const: number }"
          },
          {
            "diagnosticType": [
              0,
              "givenType"
            ],
            "equals": "setmetatable<{  }, t1> where t1 = { __index: t1, const: number }",
            "options": {
              "exhaustive": true
            }
          }
        ]
      }
    ]
  },
  // TypeInfer.metatableOOP.test.cpp:790 metatable_field_precedence_for_subtyping
  {
    "name": "metatable_field_precedence_for_subtyping",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": "\n        local function foobar1(_: { read foo: number }) end\n        local function foobar2(_: { read bar: boolean }) end\n        local function foobar3(_: { read foo: string }) end\n\n        local t = { foo = 4 }\n        setmetatable(t, { __index = { foo = \"heh\", bar = true }})\n        foobar1(t)\n        foobar2(t)\n        foobar3(t)\n    ",
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
            "equals": "{ read foo: string }",
            "options": {
              "exhaustive": true
            }
          },
          {
            "diagnosticType": [
              0,
              "givenType"
            ],
            "equals": "setmetatable<{ foo: number }, { __index: { bar: boolean, foo: string } }>",
            "options": {
              "exhaustive": true
            }
          }
        ]
      }
    ]
  },
  // TypeInfer.metatableOOP.test.cpp:813 assign_to_prop_of_intersection_of_metatables
  {
    "name": "assign_to_prop_of_intersection_of_metatables",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": "\n        --!strict\n\n        local Base = {}\n        Base.__index = Base\n\n        type BaseStructure = { BaseString: string }\n\n        export type Base = setmetatable<BaseStructure, typeof(Base)>\n\n        function Base.new() : Base\n            return nil :: any\n        end\n\n        local Sub = {}\n        Sub.__index = Sub\n\n        type SubStructure = { SubString: string }\n\n        type Sub = setmetatable<SubStructure, typeof(Sub)> & Base\n\n        function Sub.new() : Sub\n            local self: Sub = setmetatable(Base.new(), Sub) :: any\n\n            self.SubString = 5 -- Line 24\n            self.BaseString = 5 -- Line 25\n\n            return self\n        end\n    ",
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
            "line": 24
          },
          {
            "error": 1,
            "code": "TypeMismatch"
          },
          {
            "error": 1,
            "line": 25
          }
        ]
      }
    ]
  },
  // TypeInfer.metatableOOP.test.cpp:858 subclass_property_access
  {
    "name": "subclass_property_access",
    "fixture": "BuiltinsFixture",
    "flags": {
      "LuauSetmetatableOverrides": true
    },
    "checks": [
      {
        "source": "\n        type Instance = { Name: string }\n\n        const Base = {}\n        Base.__index = {}\n\n        export type Class = setmetatable<{ read instance: Instance }, typeof(Base)>\n\n        function Base.new(instance: Instance): Class\n            return setmetatable({ instance = instance, }, Base)\n        end\n\n        function Base.ChangeName(self: Class, name: string): ()\n            error(\"Override required.\")\n        end\n\n        const Derived = setmetatable({}, Base)\n        Derived.__index = Derived\n\n        export type Subclass = setmetatable<Class & { --[[ new members here ]] }, typeof(Derived)>\n\n        function Derived.new(instance: Instance): Subclass\n            return table.freeze(setmetatable(Base.new(instance), Derived))\n        end\n\n        function Derived.ChangeName(self: Subclass, name: string): ()\n            self.instance.Name = name -- TypeError: Type 'Class' does not have key 'instance'\n        end\n\n        return Derived\n    ",
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.metatableOOP.test.cpp:897 setmetatable_uses_expected_type_for_fresh_table_arguments
  {
    "name": "setmetatable_uses_expected_type_for_fresh_table_arguments",
    "fixture": "BuiltinsFixture",
    "flags": {
      "LuauBidirectionalInferenceSetMetatable": true
    },
    "checks": [
      {
        "source": "\n        type DateTime = { date: number }\n        type A = setmetatable<{ value: DateTime? }, { test: DateTime? }>\n\n        local x: A = setmetatable({ value = nil }, { test = nil })\n    ",
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.metatableOOP.test.cpp:911 setmetatable_uses_expected_type_in_call_and_return_contexts
  {
    "name": "setmetatable_uses_expected_type_in_call_and_return_contexts",
    "fixture": "BuiltinsFixture",
    "flags": {
      "LuauBidirectionalInferenceSetMetatable": true
    },
    "checks": [
      {
        "source": "\n        type DateTime = { date: number }\n        type A = setmetatable<{}, { test: DateTime? }>\n\n        local function consume(_: A) end\n        consume(setmetatable({}, { test = nil }))\n\n        local assigned: A\n        assigned = setmetatable({}, { test = nil })\n\n        local function make(): A\n            return setmetatable({}, { test = nil })\n        end\n    ",
        "expect": [
          {
            "errors": 0
          }
        ]
      }
    ]
  },
  // TypeInfer.metatableOOP.test.cpp:933 setmetatable_expected_type_does_not_widen_aliased_tables
  {
    "name": "setmetatable_expected_type_does_not_widen_aliased_tables",
    "fixture": "BuiltinsFixture",
    "flags": {
      "LuauBidirectionalInferenceSetMetatable": true
    },
    "checks": [
      {
        "source": "\n        type DateTime = { date: number }\n        type A = setmetatable<{}, { test: DateTime? }>\n\n        local mt = { test = nil }\n        local x: A = setmetatable({}, mt)\n    ",
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
  // TypeInfer.metatableOOP.test.cpp:951 setmetatable_expected_type_rejects_invalid_fresh_table_values
  {
    "name": "setmetatable_expected_type_rejects_invalid_fresh_table_values",
    "fixture": "BuiltinsFixture",
    "flags": {
      "LuauBidirectionalInferenceSetMetatable": true
    },
    "checks": [
      {
        "source": "\n        type DateTime = { date: number }\n        type A = setmetatable<{}, { test: DateTime? }>\n\n        local x: A = setmetatable({}, { test = 42 })\n    ",
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
              47,
              4,
              49
            ]
          }
        ]
      }
    ]
  },
  // TypeInfer.metatableOOP.test.cpp:969 setmetatable_expected_type_is_pushed_into_nested_lambdas
  {
    "name": "setmetatable_expected_type_is_pushed_into_nested_lambdas",
    "fixture": "BuiltinsFixture",
    "flags": {
      "LuauBidirectionalInferenceSetMetatable": true
    },
    "checks": [
      {
        "source": "\n        type DateTime = { date: number }\n        type A = setmetatable<{}, { callback: (DateTime) -> () }>\n\n        local x: A = setmetatable({}, {\n            callback = function(value)\n                print(value.date)\n            end,\n        })\n    ",
        "expect": [
          {
            "errors": 0
          },
          {
            "expectedTypeAt": [
              5,
              23
            ]
          },
          {
            "expectedTypeAt": [
              5,
              23
            ],
            "equals": "(DateTime) -> ()"
          }
        ]
      }
    ]
  },
  // TypeInfer.metatableOOP.test.cpp:991 setmetatable_expected_type_is_unchanged_when_flag_is_disabled
  {
    "name": "setmetatable_expected_type_is_unchanged_when_flag_is_disabled",
    "fixture": "BuiltinsFixture",
    "flags": {
      "LuauBidirectionalInferenceSetMetatable": false
    },
    "checks": [
      {
        "source": "\n        type DateTime = { date: number }\n        type A = setmetatable<{}, { test: DateTime? }>\n\n        local x: A = setmetatable({}, { test = nil })\n    ",
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
  // TypeInfer.metatableOOP.test.cpp:1008 setmetatable_overrides_1
  {
    "name": "setmetatable_overrides_1",
    "fixture": "BuiltinsFixture",
    "flags": {
      "LuauSetmetatableOverrides": true
    },
    "checks": [
      {
        "source": "\n        local root = {}\n        local mt1 = { __index = { propA = 42 } }\n        local mt2 = { __index = { propB = \"hmm\" } }\n\n        setmetatable(root, mt1)\n\n        local getpropA = root.propA\n\n        setmetatable(root, mt2)\n\n        local getpropB = root.propB\n        local ohno = root.propA\n    ",
        "expect": [
          {
            "errors": 1
          },
          {
            "type": "getpropA",
            "equals": "number",
            "options": {
              "exhaustive": true
            }
          },
          {
            "type": "getpropB",
            "equals": "string",
            "options": {
              "exhaustive": true
            }
          },
          {
            "type": "ohno",
            "equals": "number",
            "options": {
              "exhaustive": true
            }
          },
          {
            "error": 0,
            "code": "UnknownProperty"
          },
          {
            "error": 0,
            "fields": {
              "key": "propA"
            }
          },
          {
            "error": 0,
            "fields": {
              "table": "setmetatable<root, mt2>"
            }
          }
        ]
      }
    ]
  },
  // TypeInfer.metatableOOP.test.cpp:1043 setmetatable_overrides_2
  {
    "name": "setmetatable_overrides_2",
    "fixture": "BuiltinsFixture",
    "flags": {
      "LuauSetmetatableOverrides": true
    },
    "checks": [
      {
        "source": "\n        type MT1 = { __index: { propA: number } }\n        type MT2 = { __index: { propB: string } }\n\n        local root: setmetatable<setmetatable<{ Name: string }, MT1>, MT2>\n\n        local getpropB = root.propB\n        local ohno = root.propA\n    ",
        "expect": [
          {
            "errors": 1
          },
          {
            "type": "getpropB",
            "equals": "string",
            "options": {
              "exhaustive": true
            }
          },
          {
            "type": "ohno",
            "equals": "any",
            "options": {
              "exhaustive": true
            }
          },
          {
            "error": 0,
            "code": "UnknownProperty"
          },
          {
            "error": 0,
            "fields": {
              "key": "propA"
            }
          },
          {
            "error": 0,
            "fields": {
              "table": "setmetatable<{ Name: string }, MT2>"
            }
          }
        ]
      }
    ]
  },
  // TypeInfer.metatableOOP.test.cpp:1069 fuzzer_setmetatable_invalid_types
  {
    "name": "fuzzer_setmetatable_invalid_types",
    "fixture": "BuiltinsFixture",
    "checks": [
      {
        "source": "\n        return setmetatable(_ < _,setmetatable(setmetatable(_,_),{\"\",},math.abs))\n    ",
        "expect": [
          {
            "errors": "some"
          }
        ]
      },
      {
        "source": "\n        return setmetatable(if _ then setmetatable(_,_) else {\"\"}, {\"\"}, _)\n    ",
        "expect": [
          {
            "errors": "some"
          }
        ]
      }
    ]
  },
]);

