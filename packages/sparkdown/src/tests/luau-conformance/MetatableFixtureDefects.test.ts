import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

const passes = (source: string, name = "main") => {
  const r = runConformanceSource(source, undefined, name);
  expect(r.errorMessages).toEqual([]);
  expect(r.returnedOK).toBe(true);
};

describe("a function redefined in a function body with and without `...`", () => {
  test("a variadic redefinition after a fixed one is the value after it", () => {
    passes(`
local t = {}
function f (t, i) return 1 end
t.__index = f
function f (t, ...) return 2 end
t.__call = f
assert(t.__index() == 1)
assert(t.__call() == 2)
assert(f() == 2)
`);
  });

  test("a fixed redefinition after a variadic one is the value and the call after it", () => {
    passes(`
local t = {}
function f (t, ...) return 1 end
t.__index = f
function f (t, i) return 2 end
t.__call = f
assert(t.__index() == 1)
assert(t.__call() == 2)
assert(f() == 2)
`);
  });

  test("a call inside a fixed redefinition of a variadic function reaches the redefinition", () => {
    passes(`
function f(...) return 1 end
function f(n)
  if n == 0 then return 2 end
  return f(n - 1)
end
assert(f(1) == 2, tostring(f(1)))
`);
  });

  test("a closure that captured a local sees its variadic redefinition", () => {
    passes(`
local function f() return 1 end
local g = function() return f() end
function f(...) return 2 end
assert(f() == 2)
assert(g() == 2, tostring(g()))
`);
  });

  test("an assignment after a variadic redefinition replaces it", () => {
    passes(`
function f() return 1 end
function f(...) return 2 end
f = function() return 3 end
assert(f() == 3, tostring(f()))
`);
  });

  test("a redefinition of a parameter assigns the parameter", () => {
    passes(`
local function change(f)
  assert(f() == 1)
  function f(...) return 2 end
  assert(f() == 2)
end
change(function() return 1 end)
local function fixed(g)
  assert(g() == 1)
  function g() return 3 end
  assert(g() == 3)
end
fixed(function() return 1 end)
`);
  });

  test("a variadic redefinition of a local function", () => {
    passes(`
local t = {}
local function f (t, i) return 1 end
t.__index = f
function f (t, ...) return 2 end
t.__call = f
assert(t.__index() == 1)
assert(t.__call() == 2)
`);
  });
});

describe("comparison metamethods", () => {
  test("`<=` with no `__le` is `not (b < a)` through `__lt`", () => {
    passes(`
local mt = { __lt = function(a, b) return a.x < b.x end }
local function Op(x) return setmetatable({x = x}, mt) end
assert(Op(1) <= Op(1) and Op(1) <= Op(2) and not (Op(2) <= Op(1)))
assert(Op(1) >= Op(1) and not (Op(1) >= Op(2)) and Op(2) >= Op(1))
`);
  });

  test("an order metamethod fires only when both operands share it", () => {
    passes(`
local t1 = { __lt = function() return true end }
local c = setmetatable({}, t1)
local d = {}
assert(not pcall(function() return c < d end))
setmetatable(d, { __lt = t1.__lt })
assert(c < d)
setmetatable(d, { __lt = function() return true end })
assert(not pcall(function() return c < d end))
`);
  });

  test("a builtin set as `__eq` on two metatables is one handler", () => {
    passes(`
local a = setmetatable({}, { __eq = type })
local b = setmetatable({}, { __eq = type })
assert(a == b)
local c = setmetatable({}, { __lt = type })
local d = setmetatable({}, { __lt = type })
assert(c < d)
local e = setmetatable({}, { __lt = function() return true end })
local f = setmetatable({}, { __lt = function() return true end })
assert(not pcall(function() return e < f end))
`);
  });

  test("an equal handler that is no function is shared, and calling it raises", () => {
    passes(`
local lt = function() return false end
local a = setmetatable({}, { __le = 42, __lt = lt })
local b = setmetatable({}, { __le = 42, __lt = lt })
local ok, err = pcall(function() return a <= b end)
assert(not ok and err:match("attempt to call a number value"))
local c = setmetatable({}, { __eq = 42 })
local d = setmetatable({}, { __eq = 42 })
assert(not pcall(function() return c == d end))
`);
  });

  test("a NaN handler matches no handler, unless one metatable holds it as `__eq`", () => {
    passes(`
local nan = 0/0
local lt = function() return false end
local a = setmetatable({}, { __le = nan, __lt = lt })
local b = setmetatable({}, { __le = nan, __lt = lt })
assert(a <= b)
local c = setmetatable({}, { __eq = nan })
local d = setmetatable({}, { __eq = nan })
assert(c ~= d)
local mt = { __eq = nan }
local e, f = setmetatable({}, mt), setmetatable({}, mt)
assert(not pcall(function() return e == f end))
`);
  });

  test("`__eq` fires for a table compared with itself", () => {
    passes(`
local calls = 0
local t = setmetatable({}, { __eq = function() calls = calls + 1 return false end })
assert(t ~= t)
assert(calls == 1)
`);
  });
});

describe("`__tostring`, `__len` and `rawlen`", () => {
  test("a `__tostring` that returns no string raises Luau's error", () => {
    passes(`
local a = setmetatable({}, { __tostring = function(x) return x.name end })
local ok, err = pcall(tostring, a)
assert(not ok and err == "'__tostring' must return a string")
a.name = "gororoba"
assert(tostring(a) == "gororoba")
local n = setmetatable({}, { __tostring = function() return 42 end })
assert(tostring(n) == "42")
`);
  });

  test("a `__len` that is no function or returns no number raises Luau's errors", () => {
    passes(`
local t = setmetatable({1}, { __len = 42 })
local ok, err = pcall(function() return #t end)
assert(not ok and err:match("attempt to call a number value"))
setmetatable(t, { __len = function() end })
ok, err = pcall(function() return #t end)
assert(not ok and err:match("'__len' must return a number"))
`);
  });

  test("rawlen reads a table's and a string's length without `__len`", () => {
    passes(`
local t = setmetatable({1}, { __len = function() return 42 end })
assert(#t == 42)
assert(rawlen(t) == 1)
assert(rawlen("foo") == 3)
local ok, err = pcall(function() return rawlen(42) end)
assert(not ok and err:match("table or string expected"))
`);
  });

  test("rawlen rejects a function, a closure and a userdata", () => {
    passes(`
local n = 0
local function closure() n = n + 1 end
local function rejects(v)
  local ok, err = pcall(function() return rawlen(v) end)
  return not ok and string.find(err, "table or string expected", 1, true) ~= nil
end
assert(rawlen({1}) == 1)
assert(rejects(print), "print")
assert(rejects(closure), "closure")
assert(rejects(newproxy()), "userdata")
`);
  });

  test("getmetatable with no argument raises", () => {
    passes(`
assert(pcall(function() return getmetatable() end) == false)
`);
  });
});

describe("`__newindex`", () => {
  test("a `__newindex` function receives the key as written", () => {
    passes(`
local keys = {}
local t = setmetatable({}, { __newindex = function(_, k) table.insert(keys, k) end })
t[2] = 1
t.b = 1
assert(type(keys[1]) == "number" and keys[1] == 2)
assert(type(keys[2]) == "string" and keys[2] == "b")
`);
  });

  test("a builtin `__newindex` or `__index` is called, not stored into or indexed", () => {
    passes(`
local t = setmetatable({}, { __newindex = rawset })
t[2] = 7
assert(rawget(t, 2) == 7)
local frozen = setmetatable({}, { __newindex = rawset })
table.freeze(frozen)
assert(not pcall(function() frozen.x = 1 end))
local u = setmetatable({}, { __index = rawequal })
assert(u[u] == true and u.k == false)
`);
  });

  test("an `__index` or `__newindex` that is a number is indexed, which raises", () => {
    passes(`
local r = setmetatable({}, { __index = 42 })
local ok, err = pcall(function() return r.x end)
assert(not ok and err:match("attempt to index number with 'x'"))
local w = setmetatable({}, { __newindex = 42 })
ok, err = pcall(function() w.x = 1 end)
assert(not ok and err:match("attempt to index number with 'x'"))
assert(rawget(w, "x") == nil)
`);
  });

  test("an `__index` function receives the key as written", () => {
    passes(`
local seen
local t = setmetatable({}, { __index = function(_, k) seen = k return nil end })
local _ = t[3]
assert(type(seen) == "number" and seen == 3)
`);
  });

  test("a nil or NaN key reaches a `__newindex` function and fails a raw write", () => {
    passes(`
assert(pcall(function() local t = {} t[nil] = 5 end) == false)
assert(pcall(function() local t = setmetatable({}, { __newindex = {} }) t[nil] = 5 end) == false)
assert(pcall(function() local t = setmetatable({}, { __newindex = function() end }) t[nil] = 5 end) == true)
assert(pcall(function() local t = setmetatable({}, { __newindex = function() end }) t[0/0] = 5 end) == true)
`);
  });

  test("a frozen table's absent key reaches its `__newindex`, a present one raises", () => {
    passes(`
local seen = {}
local t = { a = 1 }
setmetatable(t, { __newindex = function(_, k) table.insert(seen, k) end })
table.freeze(t)
assert(pcall(function() t.a = 42 end) == false)
assert(pcall(function() t.c = 42 end) == true)
assert(#seen == 1 and seen[1] == "c")
`);
  });
});

describe("errors raised in a tag method", () => {
  test("pcall(error, msg) returns the message without a position", () => {
    passes(
      `
local t = setmetatable({}, { __index = function()
  local status, result = pcall(error, "Error")
  assert(status == false)
  assert(result == "Error")
  return nil
end })
local m = t.missing
local ok, err = pcall(function() error("Error") end)
assert(string.find(err, "tm.luau:9: Error") ~= nil)
`,
      "tm.luau",
    );
  });
});
