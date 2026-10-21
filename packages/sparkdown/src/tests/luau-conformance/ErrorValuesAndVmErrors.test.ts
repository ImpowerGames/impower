import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// Each script is a fixture body; the harness wraps it in
// `function run() ... end`, installs the `<fixture>:<line>: ` error
// formatter, and reports a failed `assert` as a runtime error. A body
// line N is reported as line N.
const passes = (source: string, name = "repro.luau") => {
  const r = runConformanceSource(source, undefined, name);
  expect(r.errorMessages.join("\n")).toBe("");
  expect(r.returnedOK).toBe(true);
};

// I-1336: Luau's `error(v)` raises `v` itself; only a string (or
// number) message gets the position prefix, so `pcall` and `xpcall`
// hand a non-string value back unchanged.
describe("error with a non-string value", () => {
  test("pcall returns the table error raised", () => {
    passes(`local t = {1}
local ok, err = pcall(function() error(t) end)
assert(not ok and err == t)`);
  });

  test("pcall(error, t) returns the table", () => {
    passes(`local t = {1}
local ok, err = pcall(error, t)
assert(not ok and err == t)`);
  });

  test("error through a local alias returns the table", () => {
    passes(`local t = {1}
local e = error
local ok, err = pcall(function() e(t) end)
assert(not ok and err == t)`);
  });

  test("error(nil) raises nil", () => {
    passes(`local ok, err = pcall(function() error(nil) end)
assert(not ok and err == nil)
local ok2, err2 = pcall(error)
assert(not ok2 and err2 == nil)
assert(select('#', pcall(error)) == 2)`);
  });

  test("error() with no argument raises nil", () => {
    passes(`local ok, err = pcall(function() error() end)
assert(not ok and err == nil)`);
  });

  test("a boolean is raised unchanged", () => {
    passes(`local ok, err = pcall(function() error(false) end)
assert(not ok and err == false)`);
  });

  test("a function value is raised unchanged", () => {
    passes(`local f = function() end
local ok, err = pcall(function() error(f) end)
assert(not ok and err == f)`);
  });

  test("a string and a number message still get the position prefix", () => {
    passes(`local ok, err = pcall(function() error("oops") end)
assert(err == "repro.luau:1: oops", err)
local ok2, err2 = pcall(function() error(42) end)
assert(err2 == "repro.luau:3: 42", err2)`);
  });

  test("xpcall's handler receives the value", () => {
    passes(`local t = {1}
local ok, err = xpcall(function() error(t) end, function(e) return e == t end)
assert(not ok and err == true)
local ok2, err2 = xpcall(function() error(t) end, function(e) return e end)
assert(not ok2 and err2 == t)`);
  });

  test("xpcall returns the value when its handler fails", () => {
    passes(`local t = {1}
local ok, err = xpcall(function() error(t) end, function(e) error("handler") end)
assert(not ok and err == t)`);
  });

  test("a metamethod that is error raises the table it receives", () => {
    // Upstream events.luau lines 401-403.
    passes(`local t = {}
setmetatable(t, { __len = error })
local ok, err = pcall(function() return #t end)
assert(not ok and err == t)`);
  });

  test("a nested pcall rethrowing the value keeps it", () => {
    passes(`local t = {1}
local ok, err = pcall(function()
  local ok2, err2 = pcall(error, t)
  error(err2)
end)
assert(not ok and err == t)`);
  });

  test("an uncaught table error still ends the story with an error", () => {
    const r = runConformanceSource(`error({})`, undefined, "repro.luau");
    expect(r.errorMessages.length).toBe(1);
    expect(r.errorMessages[0]).toMatch(/^RUNTIME ERROR/);
    expect(r.returnedOK).toBe(false);
  });
});

// I-1337: an error the VM raises carries the position of the line that
// raised it, as `error` and `assert` already do, in Luau's wording; an
// error a builtin raises for a bad argument carries none.
describe("a VM-raised error trapped by pcall", () => {
  const trapped = (body: string, expected: string) =>
    passes(`local ok, err = pcall(function()
${body}
end)
assert(not ok)
assert(err == ${JSON.stringify(expected)}, err)`);

  test("calling nil", () => {
    trapped(`local f
f()`, "repro.luau:3: attempt to call a nil value");
  });

  test("calling a number", () => {
    trapped(`local f = 42
f()`, "repro.luau:3: attempt to call a number value");
  });

  test("calling the nil an __index returned", () => {
    // Upstream tmerror.luau lines 37-40.
    trapped(`local t = setmetatable({}, { __index = function() return nil end })
t.f()`, "repro.luau:3: attempt to call a nil value");
  });

  test("indexing nil with a name", () => {
    trapped(`local t = nil
return t.x`, "repro.luau:3: attempt to index nil with 'x'");
  });

  test("arithmetic on nil and a number", () => {
    trapped(`local x = nil
return x + 5`, "repro.luau:3: attempt to perform arithmetic (add) on nil and number");
  });

  test("arithmetic on two strings", () => {
    trapped(`local a = "a"
return a + "b"`, "repro.luau:3: attempt to perform arithmetic (add) on string");
  });

  test("comparing nil with a number", () => {
    trapped(`local x = nil
return 1 > x`, "repro.luau:3: attempt to compare nil < number");
  });

  test("a nil table index", () => {
    trapped(`local t = {}
t[nil] = 2`, "repro.luau:3: table index is nil");
  });

  test("concatenating nil", () => {
    trapped(`local x = nil
return "a" .. x`, "repro.luau:3: attempt to concatenate string with nil");
  });

  test("the length of nil keeps I-1083's text", () => {
    trapped(`local x = nil
return #x`, "repro.luau:3: attempt to get length of a nil value");
  });

  test("negating nil keeps I-1083's text", () => {
    trapped(`local x = nil
return -x`, "repro.luau:3: attempt to perform arithmetic (unm) on a nil value");
  });

  test("arithmetic on a table and a number", () => {
    trapped(`local t = {}
return t + 1`, "repro.luau:3: attempt to perform arithmetic (add) on table and number");
  });

  test("arithmetic on a number and a non-numeric string names both", () => {
    trapped(`local s = "x"
return 2 * s`, "repro.luau:3: attempt to perform arithmetic (mul) on number and string");
  });

  test("negating a table", () => {
    trapped(`local t = {}
return -t`, "repro.luau:3: attempt to perform arithmetic (unm) on table");
  });

  test("floor division and power on nil name Luau's operators", () => {
    trapped(`local x = nil
return 1 // x`, "repro.luau:3: attempt to perform arithmetic (idiv) on number and nil");
    trapped(`local x = nil
return 2 ^ x`, "repro.luau:3: attempt to perform arithmetic (pow) on number and nil");
  });

  test("comparing two tables with no metamethod", () => {
    trapped(`local a, b = {}, {}
return a < b`, "repro.luau:3: attempt to compare table < table");
  });

  test("comparing nil with >= names the operands reversed", () => {
    trapped(`local x = nil
return x >= 1`, "repro.luau:3: attempt to compare number <= nil");
  });

  test("indexing a number", () => {
    trapped(`local n = 5
return n.x`, "repro.luau:3: attempt to index number with 'x'");
  });

  test("indexing nil with a number key names its type", () => {
    trapped(`local t = nil
return t[1]`, "repro.luau:3: attempt to index nil with number");
  });

  test("a dotted read through a missing member", () => {
    trapped(`local t = {}
return t.a.b`, "repro.luau:3: attempt to index nil with 'b'");
  });

  test("assigning into nil", () => {
    trapped(`local t = {}
t.x.y = 1`, "repro.luau:3: attempt to index nil with 'y'");
  });

  test("an error in a metamethod body takes that body's line", () => {
    passes(`local t = setmetatable({}, { __index = function(t, k)
  local x = nil
  return x.y
end })
local ok, err = pcall(function() return t.a end)
assert(not ok)
assert(err == "repro.luau:3: attempt to index nil with 'y'", err)`);
  });

  test("an uncaught VM error ends the story with the positioned message", () => {
    const r = runConformanceSource(`local f\nf()`, undefined, "repro.luau");
    expect(r.errorMessages).toEqual([
      expect.stringMatching(/repro\.luau:2: attempt to call a nil value$/),
    ]);
  });

  test("a stdlib argument error has no position", () => {
    passes(`local ok, err = pcall(function() return math.abs() end)
assert(not ok)
assert(err == "missing argument #1 to 'abs'", err)
local ok2, err2 = pcall(function() return math.floor("x") end)
assert(not ok2)
assert(err2 == "invalid argument #1 to 'floor' (number expected, got string)", err2)`);
  });
});
