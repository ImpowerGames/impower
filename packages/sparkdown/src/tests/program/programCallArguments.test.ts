// A call passes the function it calls the arguments Luau passes (#1215): each
// argument but the last gives one value; the last spreads its values, and a
// call that returned none gives none; the values past the function's
// parameters are dropped once evaluated, and the parameters past the values
// are nil; a variadic function's `...` takes the rest. Every way of calling
// does so, on both engines and on the current engine running the story's
// JSON: a function the compile found, a function value in a local, a global
// or a table field, a closure, a method, a table's `__call` handler, a
// `__namecall` handler, a builtin iterator (#1216), a variadic closure called
// by name (#1217), a builtin through a value or as a string's method, the
// functions `pcall` and a metamethod call, and a function the host
// evaluates. Where one value is taken from a call, it takes the call's first
// value, or nil when it returned none: a call, an index or a method chained
// on the call (`o:get()()`, `mk().x`, also as a statement, written with `&`
// or without it, and after `new`), a store through it or of it
// (`o:get().x = 6`, `& o.get().a.x += 2`, `t.x = f()`), a
// variable it sets, an if expression's arm, a backtick string's
// interpolation, the left side an `and` keeps, and a table's keyed field and
// computed key; and what a metamethod or a builtin's callback returns is one
// value, while `xpcall` returns every value its function returns. Each case
// notes the line
// Luau shows, but a builtin through a value that raises is compared with the
// direct call of its builtin. A story compiled before calls recorded their
// argument count still shows what it showed then.
import "../../inkjs/engine/Container";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Story } from "../../inkjs/engine/Story";
import { ProgramStory } from "../../program/ProgramStory";
import { compileScript, storyBeats } from "./programHarness";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Functions the cases call: of one parameter, of two, a `__call` handler,
// variadic (`vf` counts the values of the first value its `...` holds), with
// no parameters and a body that begins with a table, and ones that return
// none, one, two and three values.
const FUNCTIONS = [
  "function f0(a0)",
  "  return 4",
  "end",
  "function f1(a0)",
  "  return a0",
  "end",
  "function f2(a0, a1)",
  "  return tostring(a0) .. \"/\" .. tostring(a1)",
  "end",
  "function h2(self, a1)",
  "  return type(self) .. \"/\" .. tostring(a1)",
  "end",
  "function v0(...)",
  "  return select(\"#\", ...)",
  "end",
  "function v1(a, ...)",
  "  return tostring(a) .. \":\" .. select(\"#\", ...)",
  "end",
  "function vf(...)",
  "  local first = ...",
  "  return select(\"#\", first)",
  "end",
  "function mk()",
  "  local t = {}",
  "  return 5",
  "end",
  "function nine()",
  "  return 9",
  "end",
  "function g0()",
  "end",
  "function g1()",
  "  return 1",
  "end",
  "function g2()",
  "  return 1, 2",
  "end",
  "function g3()",
  "  return 1, 2, 3",
  "end",
];

// The three entries of `t`.
const T3 = `tostring(t[1]) .. "," .. tostring(t[2]) .. "," .. tostring(t[3])`;

/** A script whose function `run` runs `body` and returns `result`, which its
 *  line shows. */
const inRun = (body: string[], result = T3): string =>
  [
    ...FUNCTIONS,
    "function run()",
    ...body.map((line) => `  ${line}`),
    `  return ${result}`,
    "end",
    "Got {run()}.",
    "",
  ].join("\n");

/** A script whose top-level content runs `body` and shows `result`. */
const topLevel = (body: string[], result = T3): string =>
  [...FUNCTIONS, ...body, `Got {${result}}.`, ""].join("\n");

/** What a script shows, its lines joined, and the errors it reports: on the
 *  current engine, on the program engine, and on the current engine running
 *  the story's JSON, which records each call's argument count. */
function shown(text: string) {
  const lines = ({ beats, errors }: ReturnType<typeof storyBeats>) => [
    beats.map((beat) => beat.text.trim()).join(" "),
    ...errors,
  ];
  const current = compileScript(text);
  current.story.ResetState();
  const json = new Story(current.program.compiled as Record<string, unknown>);
  const { program } = compileScript(text, { programChunks: true });
  expect(program.fallback).toBeUndefined();
  return {
    current: lines(storyBeats(current.story)),
    program: lines(storyBeats(new ProgramStory(program.chunks!))),
    json: lines(storyBeats(json)),
  };
}

const expectShows = (text: string, line: string) => {
  const { current, program, json } = shown(text);
  expect(current).toEqual([line]);
  expect(program).toEqual([line]);
  expect(json).toEqual([line]);
};

describe("a call to a function the compile found (#1215)", () => {
  it.each([
    ["drops an argument past the parameters", inRun(["local t = { 1, f0(2, 3) }"]), "Got 1,4,nil."],
    ["passes nil for a parameter past the arguments", inRun(["local t = { 1, f2(5) }"]), "Got 1,5/nil,nil."],
    ["passes nil for each parameter when it has no arguments", inRun(["local t = { 1, f2() }"]), "Got 1,nil/nil,nil."],
    ["returns its value to a local", inRun(["local x = f0(2, 3)"], "tostring(x)"), "Got 4."],
    ["leaves nothing behind as a statement", inRun(["f0(2, 3)", "local t = { 1 }"]), "Got 1,nil,nil."],
    ["drops an argument past the parameters at the top level", topLevel(["local t = { 1, f0(2, 3) }"]), "Got 1,4,nil."],
    ["gives the first value of an earlier argument that returns two", inRun(["local t = { 1, f1(g2(), 5) }"]), "Got 1,1,nil."],
    ["passes nil for an earlier argument that returns none", inRun(["local s = f2(g0(), 5)"], "s"), "Got nil/5."],
    ["gives a variadic function the first value of an earlier argument that returns two", inRun([], "vf(g2(), 9)"), "Got 1."],
    ["gives a variadic function nil for an earlier argument that returns none", inRun([], "vf(g0(), 9)"), "Got 1."],
    ["drops the values past the parameters of a last argument that returns two", inRun(["local x = f1(g2())"], "tostring(x)"), "Got 1."],
    ["drops them in a table", inRun(["local t = { 0, f1(g2()) }"]), "Got 0,1,nil."],
    ["drops them in a concatenation", inRun([], "\"x\" .. f1(g2())"), "Got x1."],
    ["spreads a last argument over the parameters", inRun(["local t = { 1, f2(g2()) }"]), "Got 1,1/2,nil."],
    ["drops the values of a last argument past the parameters", inRun(["local s = f2(g3())"], "s"), "Got 1/2."],
    ["passes nil past the values of a last argument", inRun(["local t = { 1, f2(g1()) }"]), "Got 1,1/nil,nil."],
    ["passes nil for a last argument that returns none", inRun(["local s = f2(g0())"], "s"), "Got nil/nil."],
    ["drops an argument to a function with no parameters whose body begins with a table", inRun(["local t = { 1, mk(9) }"]), "Got 1,5,nil."],
    ["packs a variadic function's extras from a last argument that returns two", inRun([], "v1(g2())"), "Got 1:1."],
    ["passes a variadic function nil and no extras for a last argument that returns none", inRun([], "v1(g0())"), "Got nil:0."],
    ["passes a variadic function no extras when it has no arguments after a value that returns two", inRun(["local a, b = g2(), v0()"], "tostring(a) .. \",\" .. tostring(b)"), "Got 1,0."],
    ["passes a function's arguments with no extras to a variadic call after a value that returns two", inRun([], "f2(g2(), v0())"), "Got 1/0."],
  ])("%s", (_name, text, line) => {
    expectShows(text, line);
  });
});

describe("a call through a function value", () => {
  it.each([
    ["in a local drops an argument past the parameters", inRun(["local g = f0", "local t = { 1, g(2, 3) }"]), "Got 1,4,nil."],
    ["in a local passes nil for a parameter past the arguments", inRun(["local g = f2", "local t = { 1, g(5) }"]), "Got 1,5/nil,nil."],
    ["in a table field drops an argument past the parameters", inRun(["local o = { g = f0 }", "local t = { 1, o.g(2, 3) }"]), "Got 1,4,nil."],
    ["in a table field passes nil for a parameter past the arguments", inRun(["local o = { g = f2 }", "local t = { 1, o.g(5) }"]), "Got 1,5/nil,nil."],
    ["in a global drops an argument past the parameters", inRun(["g = f0", "local t = { 1, g(2, 3) }"]), "Got 1,4,nil."],
    ["in a global passes nil for a parameter past the arguments", inRun(["g = f2", "local t = { 1, g(5) }"]), "Got 1,5/nil,nil."],
    ["in a top-level local drops an argument past the parameters", topLevel(["local g = f0", "local t = { 1, g(2, 3) }"]), "Got 1,4,nil."],
    ["in a top-level local passes nil for a parameter past the arguments", topLevel(["local g = f2", "local t = { 1, g(5) }"]), "Got 1,5/nil,nil."],
    ["in a local drops an argument to a function with no parameters whose body begins with a table", inRun(["local m = mk", "local t = { 1, m(9) }"]), "Got 1,5,nil."],
    ["in a local passes a variadic function nil and no extras for a last argument that returns none", inRun(["local w = v1"], "w(0, g0())"), "Got 0:0."],
    ["in a local gives a variadic function the first value of an earlier argument that returns two", inRun(["local w = vf"], "w(g2(), 9)"), "Got 1."],
    ["in a table field gives a variadic function nil for an earlier argument that returns none", inRun(["local o = { w = vf }"], "o.w(g0(), 9)"), "Got 1."],
    ["that pcall calls drops an argument past the parameters", inRun(["local ok, v, w = pcall(f0, 2, 3)", "local t = { 1, ok, v, w }"]), "Got 1,true,4."],
    ["that pcall calls with no parameters drops the argument", inRun(["local ok, v, w = pcall(nine, 2)", "local t = { 1, ok, v, w }"]), "Got 1,true,9."],
    ["that a length metamethod names drops the operand past its parameters", inRun(["local c = setmetatable({}, { __len = nine })", "local t = { 1, #c }"]), "Got 1,9,nil."],
  ])("%s", (_name, text, line) => {
    expectShows(text, line);
  });
});

describe("a call through a closure, a method or a table's `__call` handler", () => {
  it.each([
    ["in a global drops an argument past the parameters", inRun(["g = function(a) return 4 end", "local t = { 1, g(2, 3) }"]), "Got 1,4,nil."],
    ["in a global passes nil for a parameter past the arguments", inRun(["g = function(a, b) return tostring(a) .. \"/\" .. tostring(b) end", "local t = { 1, g(5) }"]), "Got 1,5/nil,nil."],
    ["in a top-level local drops an argument past the parameters", topLevel(["local g = function(a) return 4 end", "local t = { 1, g(2, 3) }"]), "Got 1,4,nil."],
    ["that is variadic, in a local, gives its `...` the first value of an earlier argument that returns two", inRun(["local cf = function(...) local first = ... return select(\"#\", first) end"], "cf(g2(), 9)"), "Got 1."],
    ["as a method drops an argument past the parameters", inRun(["local o = { m = function(self, a) return 4 end }", "local t = { 1, o:m(2, 3) }"]), "Got 1,4,nil."],
    ["as a `__call` handler drops an argument past the parameters", inRun(["local c = setmetatable({}, { __call = function(self, a) return 4 end })", "local t = { 1, c(2, 3) }"]), "Got 1,4,nil."],
    ["as a `__call` handler that names a function passes nil for a parameter past the arguments", inRun(["local c = setmetatable({}, { __call = h2 })", "local t = { 1, c() }"]), "Got 1,table/nil,nil."],
    ["as a `__call` handler that names a function drops an argument past the parameters", inRun(["local c = setmetatable({}, { __call = h2 })", "local t = { 1, c(5, 6) }"]), "Got 1,table/5,nil."],
  ])("%s", (_name, text, line) => {
    expectShows(text, line);
  });
});

// A method call on a receiver that has no such method, which its
// metatable's `__namecall` handler takes with the receiver first.
describe("a method call that a `__namecall` handler takes", () => {
  const namecall = (handler: string, call: string) =>
    inRun(
      ["local obj = newproxy(true)", `getmetatable(obj).__namecall = ${handler}`],
      `obj:Missing(${call})`,
    );
  const PAIR = "function(self, a, b) return tostring(a) .. \"/\" .. tostring(b) end";
  const COUNT = "function(self, ...) return select(\"#\", ...) end";
  it.each([
    ["spreads a last argument that returns two", namecall(PAIR, "g2()"), "Got 1/2."],
    ["gives the first value of an earlier argument that returns two", namecall(PAIR, "g2(), 9"), "Got 1/9."],
    ["gives nil for an earlier argument that returns none", namecall(PAIR, "g0(), 9"), "Got nil/9."],
    ["gives nothing for a last argument that returns none", namecall(PAIR, "g0()"), "Got nil/nil."],
    ["that is variadic counts both values of a last argument that returns two", namecall(COUNT, "g2()"), "Got 2."],
    ["that is variadic counts none for a last argument that returns none", namecall(COUNT, "g0()"), "Got 0."],
    ["that is variadic counts nil for an earlier argument that returns none", namecall(COUNT, "g0(), 9"), "Got 2."],
  ])("%s", (_name, text, line) => {
    expectShows(text, line);
  });
});

describe("a local that a block declares with the name of a variadic function of the same function", () => {
  // The variadic function captures `base`, which a call by its name passes
  // before its own arguments; the local is called in its block with only
  // its own (tables.luau's `local function foo(u)`).
  it("is what the calls in its block call, the function before it", () => {
    expectShows(
      [
        "function run()",
        "  local base = 10",
        "  function foo(n, ...)",
        "    return base + n + select(\"#\", ...)",
        "  end",
        "  local a = foo(1, 2, 3)",
        "  local b = 0",
        "  do",
        "    local function foo(u) return u.x end",
        "    b = foo({ x = 5 })",
        "  end",
        "  local d = 0",
        "  do",
        "    local foo = function(u) return u * 2 end",
        "    d = foo(4)",
        "  end",
        "  return a .. \",\" .. b .. \",\" .. d",
        "end",
        "Got {run()}.",
        "",
      ].join("\n"),
      "Got 13,5,8.",
    );
  });

  // A loop's variables are locals of its body, and a `repeat` loop's `until`
  // condition sees the locals of its body.
  const withFoo = (lines: string[]) =>
    [
      "function run()",
      "  local base = 10",
      "  function foo(n, ...) return base + n end",
      ...lines.map((line) => `  ${line}`),
      "end",
      "Got {run()}.",
      "",
    ].join("\n");
  it.each([
    [
      "is what a generic `for` loop's body calls when a loop variable has the name",
      withFoo([
        "local result = 0",
        "for _, foo in ipairs({ function(u) return u.x end }) do",
        "  result = foo({ x = 5 })",
        "end",
        "return result",
      ]),
      "Got 5.",
    ],
    [
      "is what a numeric `for` loop's body reads when its variable has the name",
      withFoo([
        "local result = 0",
        "for foo = 7, 7 do",
        "  result = foo",
        "end",
        "return result",
      ]),
      "Got 7.",
    ],
    [
      "is what a `repeat` loop's `until` condition calls when its body declares it",
      withFoo([
        "local count = 0",
        "repeat",
        "  count = count + 1",
        "  local foo = function(u) return u.x == 5 end",
        "until foo({ x = 5 })",
        "return count",
      ]),
      "Got 1.",
    ],
  ])("%s", (_name, text, line) => {
    expectShows(text, line);
  });
});

describe("a variadic closure called by name (#1217)", () => {
  it.each([
    ["counts its arguments", topLevel(["local pick = function(...) return select(\"#\", ...) end", "local n = pick(1, 2)"], "n"), "Got 2."],
    ["counts them in a line that shows its call", topLevel(["local pick = function(...) return select(\"#\", ...) end"], "pick(1, 2)"), "Got 2."],
    ["returns its value in a line that shows its call", topLevel(["local pick = function(...) return 7 end"], "pick(1, 2)"), "Got 7."],
    ["counts its arguments as a global", topLevel(["pick = function(...) return select(\"#\", ...) end", "local n = pick(1, 2)"], "n"), "Got 2."],
  ])("%s", (_name, text, line) => {
    expectShows(text, line);
  });
});

describe("a builtin iterator held in a variable (#1216)", () => {
  it.each([
    ["called with no arguments as an operand", topLevel(["store it = string.gmatch(\"a b\", \"%a+\")", "store got = \"q\"", "got = got .. it()"], "got"), "Got qa."],
    ["called with no arguments in a table", topLevel(["store it = string.gmatch(\"a b\", \"%a+\")", "store t = {}", "t = { \"q\", it() }"], "t[1] .. \" \" .. t[2]"), "Got q a."],
    ["called with two arguments", topLevel(["store it = string.gmatch(\"a b\", \"%a+\")", "store got = \"q\"", "got = got .. it(nil, nil)"], "got"), "Got qa."],
    ["in a local, called with no arguments in a table", inRun(["local it = string.gmatch(\"a b\", \"%a+\")", "local t = { \"q\", it() }"], "t[1] .. \" \" .. t[2]"), "Got q a."],
  ])("%s", (_name, text, line) => {
    expectShows(text, line);
  });
});

describe("a builtin called through a value", () => {
  it.each([
    ["in a local drops an argument past its parameters", inRun(["local f = tostring", "local t = { 1, f(2, 3) }"]), "Got 1,2,nil."],
    ["in a top-level local drops an argument past its parameters", topLevel(["local f = tostring", "local t = { 1, f(2, 3) }"]), "Got 1,2,nil."],
    ["in a table field drops an argument past its parameters", inRun(["local o = { f = tostring }", "local t = { 1, o.f(2, 3) }"]), "Got 1,2,nil."],
    ["in a global drops an argument past its parameters", inRun(["gf = tostring", "local t = { 1, gf(2, 3) }"]), "Got 1,2,nil."],
    ["of numbers, in a local, drops an argument past its parameters without checking it", inRun(["local f = math.abs", "local t = { 1, f(-2, \"x\") }"]), "Got 1,2,nil."],
    ["of numbers, in a table field, drops an argument past its parameters without checking it", inRun(["local o = { f = math.fmod }", "local t = { 1, o.f(7, 3, \"x\") }"]), "Got 1,1,nil."],
    ["that takes any number of arguments, in a top-level local", topLevel(["local s = select", "local n = s(\"#\", 1, 2)"], "n"), "Got 2."],
    ["that takes any number of arguments, in a top-level local, counts none for a last argument that returns none", topLevel(["local s = select", "local n = s(\"#\", g0())"], "n"), "Got 0."],
    ["that takes any number of arguments, in a table field, counts none for a last argument that returns none", inRun(["local o = { s = select }", "local n = o.s(\"#\", g0())"], "tostring(n)"), "Got 0."],
  ])("%s", (_name, text, line) => {
    expectShows(text, line);
  });

  // Each call through a value runs in a script of as many lines as the one
  // that calls its builtin directly, so both raise from the same line. The
  // story's JSON has no lines: its errors name the place in the compiled
  // code, which differs between the two scripts and is left out.
  const raisedBy = (text: string) => {
    const { current, program, json } = shown(text);
    const unplaced = json.map((line) =>
      line.replace(/\(Ink Pointer -> [^)]*\)/, "(Ink Pointer)"),
    );
    return { current, program, json: unplaced };
  };
  it.each([
    [
      "of numbers raises a missing argument",
      ["local f = math.abs", "local t = { 1, f() }"],
      ["local f = nil", "local t = { 1, math.abs() }"],
      "missing argument #1 to 'abs'",
    ],
    [
      "of numbers raises an argument that is no number before a missing one",
      ["local f = math.fmod", "local t = { 1, f(\"x\") }"],
      ["local f = nil", "local t = { 1, math.fmod(\"x\") }"],
      "invalid argument #1 to 'fmod' (number expected, got string)",
    ],
    [
      "in a table field raises a missing argument for a last argument that returns none",
      ["local o = { f = string.format }", "local t = { 1, o.f(\"%s\", g0()) }"],
      ["local o = nil", "local t = { 1, string.format(\"%s\", g0()) }"],
      "missing argument #2",
    ],
  ])("%s, as its direct call does", (_name, through, direct, error) => {
    const raised = raisedBy(inRun(through));
    expect(raised).toEqual(raisedBy(inRun(direct)));
    for (const lines of Object.values(raised)) {
      expect(lines.slice(1)).toEqual([expect.stringContaining(error)]);
    }
  });
});

describe("a call, an index or a method chained on a call", () => {
  // `o` holds a function that returns a function, a method that does, a
  // method that returns the table itself, and one that bumps `hit`.
  const O = [
    "local hit = 0",
    "local o = { v = 4, get = function() return function(x) return tostring(x) end end }",
    "function o:make() return function(x) return self.v + (x or 0) end end",
    "function o:me() return self end",
    "function o:bump() hit = hit + 1 end",
  ];
  it.each([
    ["calls what a field call returns", inRun(O, "o.get()(5)"), "Got 5."],
    ["calls what a method call returns", inRun(O, "o:make()(2)"), "Got 6."],
    ["calls what a method call with arguments returns", inRun(["local o = {}", "function o:adder(a) return function(b) return a + b end end"], "o:adder(1)(2)"), "Got 3."],
    ["calls what a nested field call returns", inRun(["local o = { p = { get = function() return function(x) return x end end } }"], "o.p.get()(8)"), "Got 8."],
    ["indexes what a method call returns", inRun(O, "o:me().v"), "Got 4."],
    ["as a statement, calls what a method call returns", inRun([...O, "o:me():bump()", "o.get()()", "o:make()()"], "hit"), "Got 1."],
    ["as a statement, calls what a bracket call returns", inRun(["local hit = 0", "local o = { function() return function() hit = hit + 1 end end }", "o[1]()()"], "hit"), "Got 1."],
    ["as a statement, calls a field of what a method call returns", inRun(["local hit = 0", "local o = {}", "function o:mk() return { bump = function() hit = hit + 1 end } end", "o:mk().bump()"], "hit"), "Got 1."],
    ["stores through a field of what a method call returns", inRun(["local t = { x = 0 }", "local o = {}", "function o:get() return t end", "o:get().x = 6"], "t.x"), "Got 6."],
    ["stores through an index of what a method call returns", inRun(["local t = { 0 }", "local o = {}", "function o:get() return t end", "o:get()[1] = 6"], "t[1]"), "Got 6."],
    // One link can hold several parts (`.a.x`, `.b[2]`), and an index's key
    // can hold a path of its own (`[k.v]`).
    ["indexes every part of a link after a method call", inRun(["local t = { a = { x = 1, b = { 2, 3 } } }", "local o = { get = function(self) return t end }", "local x = o:get().a.x", "local y = o:get().a.b[2]"], "x .. y"), "Got 13."],
    ["indexes by a key that holds a path, after a method call", inRun(["local u = { x = 5 }", "local k = { v = \"x\" }", "local o = { get = function(self) return u end }"], "o:get()[k.v]"), "Got 5."],
    ["stores through every part of a link after a method call", inRun(["local t = { a = { x = 1 } }", "local o = { get = function(self) return t end }", "o:get().a.x = 6"], "t.a.x .. type(t.a)"), "Got 6table."],
    ["stores through every part of a link after a field call", inRun(["local t = { a = { x = 1 } }", "local o = { get = function() return t end }", "o.get().a.x = 3"], "t.a.x"), "Got 3."],
    ["as a statement, calls through every part of a link after a method call", inRun(["local hit = 0", "local t = { a = { bump = function() hit = hit + 1 end } }", "local o = { get = function(self) return t end }", "o:get().a.bump()"], "hit"), "Got 1."],
    ["stores the value the lines after it continue, through a method call or a field call", inRun(["local t = { x = 0, y = 0 }", "local source = { y = 6 }", "local o = { get = function() return t end }", "o:get().x = source", "  .y", "o.get().y = source", "  .y"], "t.x .. \"/\" .. t.y"), "Got 6/6."],
    // A compound assignment reads and writes through its target's base and
    // key, each evaluated once: the call counts are 2 (one per compound
    // store through `o.get`) and 1.
    ["compounds a store through what a call returns, evaluating its base and key once", inRun(["local t = { a = { x = 1 }, s = \"a\", y = 5 }", "local gets = 0", "local keys = 0", "local o = { get = function() gets = gets + 1 return t end }", "function o:me() return t end", "local function key() keys = keys + 1 return \"x\" end", "o.get().a.x += 2", "o:me().a.x *= 10", "o.get().a[key()] -= 1", "o:me().s ..= \"b\"", "local function mk() return function() return t end end", "mk()().y //= 2"], "t.a.x .. \"/\" .. t.s .. \"/\" .. t.y .. \"/\" .. gets .. \"/\" .. keys"), "Got 29/ab/2/2/1."],
    ["compounds a store through a parenthesized table and an index of a method call", inRun(["local t = { x = 1, 10 }", "local keys = 0", "local function key() keys = keys + 1 return \"x\" end", "local o = {}", "function o:get() return t end", "(t).x += 1", "(t)[key()] += 1", "o:get()[1] += 5"], "t.x .. \"/\" .. t[1] .. \"/\" .. keys"), "Got 3/15/1."],
    // An explicit statement (`&`), which a scene's top level needs for a
    // call, stores and calls through the links after a call as an implicit
    // one does: the call counts are 3 and 2.
    ["stores and compounds through what a call returns in an explicit statement", inRun(["local t = { a = { x = 1 }, s = \"a\", y = 5, 10 }", "local gets = 0", "local keys = 0", "local o = { get = function() gets = gets + 1 return t end }", "function o:me() return t end", "local function key() keys = keys + 1 return \"x\" end", "& o.get().a.x += 2", "& o:me().a.x *= 10", "& o.get().a[key()] -= 1", "& o:me().s ..= \"b\"", "& o.get().y = 7", "& (t)[key()] = 4", "& o:me()[1] += 5"], "t.a.x .. \"/\" .. t.s .. \"/\" .. t.y .. \"/\" .. t.x .. \"/\" .. t[1] .. \"/\" .. gets .. \"/\" .. keys"), "Got 29/ab/7/4/15/3/2."],
    ["calls through the links after a call in an explicit statement", inRun(["local n = 0", "local o = {}", "function o:bump() n = n + 1 return self end", "function o:me() return self end", "local box = { o = o }", "& o:me():bump()", "& o:bump():bump():bump()", "& (o):bump()", "& box.o:me():bump()"], "n"), "Got 6."],
    ["stores and calls through what a call returns in an explicit statement at the top level", topLevel(["store t = { a = { x = 1 }, n = 0, y = 5, k = 10, s = \"a\" }", "function mko()", "  local o = {}", "  function o.get() return t end", "  function o:me() return t end", "  function o:bump() t.n = t.n + 1 return self end", "  return o", "end", "local o = mko()", "& o.get().a.x += 2", "& o:me().a.x *= 10", "& o:bump():bump()", "& (t).y //= 2", "& o:me()[\"k\"] += 5", "& o.get().s = \"b\""], "t.a.x .. \"/\" .. t.n .. \"/\" .. t.y .. \"/\" .. t.k .. \"/\" .. t.s"), "Got 30/2/2/15/b."],
  ])("%s", (_name, text, line) => {
    expectShows(text, line);
  });

  // `new` builds the instance its links then apply to (#1263).
  const POINT = [
    "define Point with",
    "  init(a, b)",
    "    self.s = tostring(a) .. \"/\" .. tostring(b)",
    "  end",
    "  function get()",
    "    return self.s",
    "  end",
    "end",
  ];
  it.each([
    ["indexes the instance `new` builds", [...POINT, "Got {new Point(1, 2).s}.", ""].join("\n"), "Got 1/2."],
    ["calls a method of the instance `new` builds", [...POINT, "Got {new Point(3, 4):get()}.", ""].join("\n"), "Got 3/4."],
    ["indexes the instance `new` builds from a call that returns two", [...FUNCTIONS, ...POINT, "Got {new Point(g2()).s}.", ""].join("\n"), "Got 1/2."],
  ])("%s", (_name, text, line) => {
    expectShows(text, line);
  });
});

describe("a call whose one value is taken", () => {
  // `mk` returns a table and 9; `mf` a function and 9.
  const MK = [
    "local t = { x = 7, 7 }",
    "local function mk() return t, 9 end",
    "local function mf() return function(a, b) return tostring(a) .. \"/\" .. tostring(b) end, 9 end",
  ];
  it.each([
    ["is indexed by its first value", inRun(MK, "mk().x"), "Got 7."],
    ["is indexed by bracket on its first value", inRun(MK, "mk()[1]"), "Got 7."],
    ["calls its first value", inRun(MK, "mf()(g2())"), "Got 1/2."],
    ["stores through its first value", inRun([...MK, "mk().x = 5"], "t.x"), "Got 5."],
    ["gives a field its first value", inRun(["local u = {}", "u.x = g2()"], "tostring(u.x) .. \"/\" .. select(\"#\", u.x)"), "Got 1/1."],
    ["gives a field nil when it returns none", inRun(["local u = { x = 1 }", "u.x = g0()"], "tostring(u.x)"), "Got nil."],
    ["gives a local nil when it returns none", inRun(["local a = g0()"], "tostring(a) .. \"/\" .. select(\"#\", a)"), "Got nil/1."],
    ["gives a reassigned local nil when it returns none", inRun(["local a = 1", "a = g0()"], "select(\"#\", a)"), "Got 1."],
    ["gives a global nil when it returns none", inRun(["gn = 1", "gn = g0()"], "select(\"#\", gn)"), "Got 1."],
    ["gives an upvalue nil when it returns none", inRun(["local a = 1", "local function set() a = g0() end", "set()"], "select(\"#\", a)"), "Got 1."],
    ["is one value as an if expression's arm", inRun(["local function f() return if true then g2() else 0 end"], "select(\"#\", f())"), "Got 1."],
    ["gives a string's method its values as a call's", inRun([], "(\"x\"):rep(g2()) .. (\"abcdef\"):sub(g2()) .. (\"abcdef\"):sub(g2(), g2())"), "Got xaba."],
    // A story line shows nothing for a call that returns none, which an
    // author writes for its effect; a Luau string writes nil, as Luau does.
    ["is written as its first value by a backtick string", inRun([], "`[{g2()}]`"), "Got [1]."],
    ["is written as nil by a backtick string when it returns none", inRun(["local t = {}", "function t:m() end"], "`[{g0()}|{t:m()}]`"), "Got [nil|nil]."],
    ["is nil as the left side an `and` keeps", inRun([], "select(\"#\", g0() and 7) .. \"/\" .. tostring(g0() and 7)"), "Got 1/nil."],
    ["is nil through an `and` in an if expression's arm and a backtick string", inRun(["local function f() return if true then g0() and 7 else 0 end"], "select(\"#\", f()) .. `[{g0() and 7}]`"), "Got 1[nil]."],
    ["is one value as a table's keyed field, even the last", inRun(["local t = { [1] = g2() }", "local u = { 5, [9] = g2() }"], "tostring(t[1]) .. tostring(t[2]) .. \"/\" .. tostring(u[9]) .. tostring(u[10])"), "Got 1nil/1nil."],
    ["is one value as a table's computed key", inRun(["local k = {}", "local function keys() return k, 9 end", "local t = { [keys()] = 7 }"], "tostring(t[k])"), "Got 7."],
  ])("%s", (_name, text, line) => {
    expectShows(text, line);
  });
});

describe("what a metamethod or a builtin's callback returns", () => {
  // The engines call these functions themselves, and Luau takes one value
  // from each: an index, an operator's result, a string, a comparison.
  it.each([
    ["is one value as an `__index` function's", inRun(["local t = setmetatable({}, { __index = function(t, k) return k, 9 end })"], "select(\"#\", t.x) .. \"/\" .. t.x .. \"/\" .. select(\"#\", t[\"y\"])"), "Got 1/x/1."],
    ["is nil for an `__index` function that returns none", inRun(["local t = setmetatable({}, { __index = function() end })"], "tostring(t.x) .. \"/\" .. select(\"#\", t.x)"), "Got nil/1."],
    ["is one value as an `__index` function's reached through an `__index` table", inRun(["local inner = setmetatable({}, { __index = function() return 7, 8 end })", "local t = setmetatable({}, { __index = inner })"], "select(\"#\", t.z) .. \"/\" .. t.z"), "Got 1/7."],
    ["is one value as an arithmetic or concatenation metamethod's", inRun(["local t = setmetatable({}, { __add = function() return 1, 2 end, __unm = function() return 1, 2 end, __concat = function() return \"a\", \"b\" end })"], "select(\"#\", t + 1) .. select(\"#\", -t) .. select(\"#\", t .. \"x\")"), "Got 111."],
    ["is one value as a length metamethod's, or nil", inRun(["local a = setmetatable({}, { __len = function() return 7, 8 end })", "local b = setmetatable({}, { __len = function() end })"], "tostring(#a) .. \"/\" .. tostring(#b)"), "Got 7/nil."],
    ["reaches `__eq` from an operand's first value", inRun(["local mt = { __eq = function() return true end }", "local a, b = setmetatable({}, mt), setmetatable({}, mt)", "local c = {}", "local function mk() return a, 9 end", "local function mc() return c, 9 end"], "tostring(mk() == b) .. \"/\" .. tostring(mc() == c)"), "Got true/true."],
    ["is a `__tostring` handler's first value", inRun(["local t = setmetatable({}, { __tostring = function() return \"T\", \"U\" end })"], "tostring(t)"), "Got T."],
    ["is a sort comparator's first value, and an `__lt` handler's", inRun(["local t = { 3, 1, 2 }", "table.sort(t, function(a, b) return a < b, false end)", "local mt = { __lt = function(a, b) return a.v < b.v, false end }", "local u = { setmetatable({ v = 3 }, mt), setmetatable({ v = 1 }, mt) }", "table.sort(u)"], "table.concat(t, \",\") .. \"/\" .. u[1].v"), "Got 1,2,3/1."],
    ["is the first value a `table.foreach` callback returns", inRun(["local n = 0", "local r = table.foreach({ 1, 2, 3 }, function(k, v) n = n + 1 return nil, 5 end)"], "n .. \"/\" .. tostring(r)"), "Got 3/nil."],
    ["is the first value a `table.foreachi` callback returns", inRun(["local n = 0", "local r = table.foreachi({ 1, 2, 3 }, function(i, v) n = n + 1 return nil, 5 end)"], "n .. \"/\" .. tostring(r)"), "Got 3/nil."],
    ["is the first value of the `__eq` `table.find` compares with", inRun(["local mt = { __eq = function() return false, true end }", "local a, b = setmetatable({}, mt), setmetatable({}, mt)"], "tostring(table.find({ a }, b))"), "Got nil."],
    ["is one value as the `__index` function a `gsub` table replacement reads, or nil", inRun(["local upper = setmetatable({}, { __index = function(t, k) return k:upper(), 9 end })", "local none = setmetatable({}, { __index = function() end })"], "(string.gsub(\"ab\", \"%a\", upper)) .. \"/\" .. (string.gsub(\"ab\", \"%a\", none))"), "Got AB/ab."],
    ["is an `xpcall` handler's first value, or nil when it returns none", inRun([], "select(\"#\", xpcall(function() error(\"boom\") end, function() return 1, 2 end)) .. \"/\" .. tostring(select(2, xpcall(function() error(\"boom\") end, function() end)))"), "Got 2/nil."],
    ["is every value an `xpcall`'s function returns", inRun(["local ok, a, b = xpcall(function() return 1, 2 end, tostring)"], "tostring(ok) .. tostring(a) .. tostring(b)"), "Got true12."],
  ])("%s", (_name, text, line) => {
    expectShows(text, line);
  });
});

describe("a function a host evaluates (`EvaluateFunction`)", () => {
  // The functions a host evaluates, as the UI evaluates an event handler with
  // the event, and a scene, which binds nothing and takes what it is passed
  // as it is.
  const HOST = [
    "function first(a)",
    "  return a",
    "end",
    "function pair(a, b)",
    "  return tostring(a) .. \"/\" .. tostring(b)",
    "end",
    "function count(...)",
    "  return select(\"#\", ...)",
    "end",
    "function head(a, ...)",
    "  return tostring(a) .. \":\" .. select(\"#\", ...)",
    "end",
    "function noop()",
    "end",
    "Hello.",
    "done",
    "",
    "scene quiet",
    "end",
    "",
  ].join("\n");
  it.each([
    ["drops an argument past the parameters", "first", [5, 6], 5],
    ["passes nil for a parameter past the arguments", "pair", [7], "7/nil"],
    ["packs a variadic function's arguments for its `...`", "count", [1, 2], 2],
    ["packs none for a variadic function given none", "count", [], 0],
    ["gives a variadic function's fixed parameter the first argument", "head", [1, 2, 3], "1:2"],
    ["returns nothing from a function with no parameters that returns nothing", "noop", [9], null],
    ["leaves a scene the argument it binds no parameter for", "quiet", [4], 4],
  ])("%s", (_name, name, args, result) => {
    const current = compileScript(HOST);
    current.story.ResetState();
    const json = new Story(current.program.compiled as Record<string, unknown>);
    const { program } = compileScript(HOST, { programChunks: true });
    expect(program.fallback).toBeUndefined();
    const stories = {
      current: current.story,
      program: new ProgramStory(program.chunks!),
      json,
    };
    for (const [engine, story] of Object.entries(stories)) {
      expect([engine, story.EvaluateFunction(name, args)]).toEqual([
        engine,
        result,
      ]);
    }
  });
});

describe("a story compiled before calls recorded their argument count", () => {
  it("shows what it showed then", () => {
    // Compiled at `writtenBy` from `source`, and run by the engine there to
    // show `shows`. Its calls record no argument count: a call to a variadic
    // function packs the values past its parameters where it calls it, and a
    // call whose last argument returns several values spreads them.
    const fixture = JSON.parse(
      readFileSync(join(__dirname, "fixtures", "story-before-argc.json"), "utf8"),
    );
    const json = JSON.stringify(fixture.story);
    expect(json).not.toContain("\"argc\"");
    expect(json).toContain("1,2,3,\"pack:2\",{\"f()\":\"v1\"}");
    expect(json).toContain("{\"f()\":\"g2\"},{\"f()\":\"f2\"}");
    const { beats, errors } = storyBeats(new Story(fixture.story));
    expect(beats.map((beat) => beat.text.trim())).toEqual(fixture.shows);
    expect(errors).toEqual([]);
  });
});
