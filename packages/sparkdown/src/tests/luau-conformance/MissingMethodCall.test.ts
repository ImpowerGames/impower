import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// I-1412: a colon call whose method lookup yields nil raises Luau's
// namecall error, `attempt to call missing method '<name>' of <type>`, with
// the position prefix of any VM error (I-1337), while a dot call of a nil
// field keeps `attempt to call a nil value`. The vendored errors.luau
// (lines 403-409, "method call errors") is the reference; the conformance
// run skips that fixture because it needs a runtime compiler.

// Each script is a fixture body; the harness wraps it in
// `function run() ... end` and reports a body line N as line N.
const passes = (source: string, name = "repro.luau") => {
  const r = runConformanceSource(source, undefined, name);
  expect(r.errorMessages.join("\n")).toBe("");
  expect(r.returnedOK).toBe(true);
};

const trapped = (body: string, expected: string) =>
  passes(`local ok, err = pcall(function()
${body}
end)
assert(not ok)
assert(err == ${JSON.stringify(expected)}, err)`);

describe("a colon call of a missing method", () => {
  test("on a table", () => {
    trapped(`local t = {}
return t:foo()`, "repro.luau:3: attempt to call missing method 'foo' of table");
  });

  test("on a table constructor", () => {
    // errors.luau line 403.
    trapped(
      `return ({}):foo()`,
      "repro.luau:2: attempt to call missing method 'foo' of table",
    );
  });

  test("on a string", () => {
    // errors.luau line 404.
    trapped(
      `return ("s"):foo()`,
      "repro.luau:2: attempt to call missing method 'foo' of string",
    );
  });

  test("on a table whose __index table lacks it", () => {
    trapped(`local t = setmetatable({}, { __index = { bar = function() end } })
return t:foo()`, "repro.luau:3: attempt to call missing method 'foo' of table");
  });

  test("on a table whose __index function returns nil", () => {
    trapped(`local t = setmetatable({}, { __index = function() return nil end })
return t:foo()`, "repro.luau:3: attempt to call missing method 'foo' of table");
  });

  test("on a userdata whose __index table lacks it", () => {
    // errors.luau line 407.
    trapped(`local ud = newproxy(true)
getmetatable(ud).__index = {}
return ud:foo()`, "repro.luau:4: attempt to call missing method 'foo' of userdata");
  });

  test("on a userdata whose __index function returns nothing", () => {
    // errors.luau line 408.
    trapped(`local ud = newproxy(true)
getmetatable(ud).__index = function() end
return ud:foo()`, "repro.luau:4: attempt to call missing method 'foo' of userdata");
  });

  test("names the method the call wrote, with arguments", () => {
    trapped(`local t = {}
return t:someMethod(1, 2, 3)`, "repro.luau:3: attempt to call missing method 'someMethod' of table");
  });

  test("a chained receiver is evaluated once and named by its own type", () => {
    passes(`local calls = 0
local o = { get = function(self) calls += 1 return {} end }
local ok, err = pcall(function() return o:get():foo() end)
assert(not ok)
assert(err == "repro.luau:3: attempt to call missing method 'foo' of table", err)
assert(calls == 1, calls)`);
  });

  test("an uncaught one ends the story with the message", () => {
    const r = runConformanceSource(`local t = {}
t:foo()`, undefined, "repro.luau");
    expect(r.returnedOK).toBe(false);
    expect(r.errorMessages.join("\n")).toContain(
      "attempt to call missing method 'foo' of table",
    );
  });
});

describe("calls that keep their own errors", () => {
  test("a colon call of a field that is not callable", () => {
    // errors.luau line 406.
    trapped(`return ({foo=42}):foo()`, "repro.luau:2: attempt to call a number value");
  });

  test("a dot call of a missing field", () => {
    trapped(`local t = {}
return t.foo()`, "repro.luau:3: attempt to call a nil value");
  });

  test("a dot call of a missing field passing the table", () => {
    trapped(`local t = {}
return t.foo(t)`, "repro.luau:3: attempt to call a nil value");
  });

  test("a colon call on a number", () => {
    // errors.luau line 405.
    trapped(`return (42):foo()`, "repro.luau:2: attempt to index number with 'foo'");
  });

  test("a colon call on a boolean", () => {
    trapped(`local b = true
return b:foo()`, "repro.luau:3: attempt to index boolean with 'foo'");
  });

  test("a colon call on nil", () => {
    trapped(`local n = nil
return n:foo()`, "repro.luau:3: attempt to index nil with 'foo'");
  });

  test("a userdata's __index error", () => {
    // errors.luau line 409.
    trapped(`local ud = newproxy(true)
getmetatable(ud).__index = function() error("nope") end
return ud:foo()`, "repro.luau:3: nope");
  });

  test("a __namecall handler still takes the call", () => {
    passes(`local ud = newproxy(true)
getmetatable(ud).__namecall = function(self, a) return 42 + a end
assert(ud:foo(1) == 43)`);
  });
});

describe("a colon call of a method that exists", () => {
  test("still dispatches to it", () => {
    passes(`local t = { n = 1 }
function t:add(k) self.n += k return self end
assert(t:add(2):add(3).n == 6)
local s = setmetatable({}, { __index = { hi = function(self, x) return x end } })
assert(s:hi(7) == 7)
assert(("abc"):upper() == "ABC")`);
  });
});
