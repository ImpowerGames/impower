// Regression tests for Luau's `if cond then a else b` EXPRESSION
// form (ifelseexpr.luau). Lowered to a `TernaryExpression`
// (TernaryExpression.ts) that emits conditional content-pointer
// jumps via the `sc:if` / `sc:jump` ControlCommand ops — only the
// taken arm's value ops execute (verified by the side-effect test).
// An unparenthesized if expression in a condition ends before the
// enclosing `then` or `do` once its else arm is complete, including when
// that arm is glued to the `then` or `do` with no whitespace.
import { describe, expect, test } from "vitest";
import { dumpTree, stripAnsi } from "../compiler/grammarSnapshot";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";
import { runConformanceSource } from "./conformanceTestHarness";
import { testCompiler, testStory } from "../engineUnderTest";

function compileAndCapture(source: string): {
  errors: string[];
  recorded: unknown[];
  text: string;
} {
  const compiler = testCompiler();
  compiler.configure({
    files: [
      {
        uri: "inmemory:///main.sd",
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const result = compiler.compile({
    textDocument: { uri: "inmemory:///main.sd" },
  });
  if (!result.program.compiled) {
    return { errors: ["NO_COMPILED"], recorded: [], text: "" };
  }
  const story = testStory(result.program.compiled as Record<string, any>);
  const recorded: unknown[] = [];
  story.BindExternalFunction("host_record", (v: unknown) => {
    recorded.push(v);
    return v;
  });
  const errors: string[] = [];
  story.onError = (m: string) => errors.push(m);
  const text = story.ContinueMaximally();
  return { errors, recorded, text };
}

// The if-expression syntax errors of a source, as `line:col-line:col message`
// with one-based positions.
function ifDiagnostics(source: string): string[] {
  const compiler = testCompiler();
  compiler.configure({
    files: [
      {
        uri: "inmemory:///main.sd",
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const result = compiler.compile({ textDocument: { uri: "inmemory:///main.sd" } });
  return Object.values(result.program.diagnostics ?? {})
    .flat()
    .filter((d: any) => String(d.message?.value ?? d.message).includes("when parsing"))
    .map((d: any) => {
      const { start, end } = d.range;
      return `${start.line + 1}:${start.character + 1}-${end.line + 1}:${end.character + 1} ${d.message?.value ?? d.message}`;
    });
}

// How many reassignment statements a source parses into.
function reassignmentCount(source: string): number {
  return stripAnsi(dumpTree(source)).match(/\bLuauReassignment \[/g)?.length ?? 0;
}

describe("if-then-else expressions", () => {
  test("statement, paren, call-arg, and operand positions", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local a = if true then 1 else 2
host_record(a)
local b = if false then 1 else 2
host_record(b)
host_record((if true then "A" else "B"))
host_record(if false then "A" else "B")
host_record(7 + if true then 10 else 20)
host_record((7 + if false then 10 else 20) == 27)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([1, 2, "A", "B", 17, true]);
  });

  test("elseif chains evaluate in order", () => {
    // NB: don't name the helper `chain` — that's a reserved sparkdown
    // alternator keyword (`queue|chain|cycle|shuffle`) and hijacks the
    // parse.
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function pick(c1, c2, c3)
return if c1 then 10 elseif c2 then 20 elseif c3 then 30 else 40
end

function run()
host_record(pick(false, false, false))
host_record(pick(false, false, true))
host_record(pick(false, true, true))
host_record(pick(true, true, true))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([40, 30, 20, 10]);
  });

  test("only the taken arm evaluates", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local counter = 0
local function add(n)
counter += n
return counter
end
local r = if true then add(7) else add(17)
host_record(r)
host_record(counter)
local r2 = if false then add(100) else add(3)
host_record(r2)
host_record(counter)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([7, 7, 10, 10]);
  });

  test("nested ternary in condition position, with and without parens", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function truthy()
return true
end

function run()
host_record((if (if truthy() then false else true) then 10 else 20))
host_record((if if truthy() then false else true then 10 else 20))
host_record(if truthy() then 10 else if truthy() then 20 else 30)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([20, 20, 10]);
  });
});

// An unparenthesized if expression is a valid condition for an if statement
// or a while loop; the statement's own `then` or `do` follows the
// expression's else arm.
describe("if expression as a statement condition", () => {
  test("issue sources through the conformance harness", () => {
    const cases = [
      `local r = "none"\nif if true then true else false then\n  r = "a"\nend\nassert(r == "a", r)`,
      `local c = true\nlocal r = "none"\nif if c then 1 else nil then\n  r = "a"\nend\nassert(r == "a", r)`,
      `local r = "none"\nif if true then false else true then\n  r = "wrong"\nelseif true then\n  r = "b"\nend\nassert(r == "b", r)`,
    ];
    const results = cases.map((source) => {
      const r = runConformanceSource(source);
      return [r.returnedOK, r.errorMessages];
    });
    expect(results).toEqual([
      [true, []],
      [true, []],
      [true, []],
    ]);
  });

  test("if statement takes the then branch when the expression is true", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local c = true
local r = "none"
if if true then true else false then
  r = "a"
end
host_record(r)
if if c then 1 else nil then
  r = "b"
end
host_record(r)
if if c then nil else 1 then
  r = "wrong"
else
  r = "c"
end
host_record(r)
if if c then false else true then
  r = "wrong"
elseif if c then true else false then
  r = "d"
end
host_record(r)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["a", "b", "c", "d"]);
  });

  test("elseif chains and nested else arms inside the condition", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local c = false
local r = "none"
if if c then false elseif true then 2 else nil then
  r = "a"
end
host_record(r)
if if c then nil else if c then nil else 3 then
  r = "b"
end
host_record(r)
if if c then nil else (if true then 4 else nil) then
  r = "c"
end
host_record(r)
local v = if (if c then 1 else 2) == 2 then "d" else "wrong"
host_record(v)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["a", "b", "c", "d"]);
  });

  test("while loop runs while the expression is true", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local n = 0
while if n < 3 then true else false do
  n += 1
end
host_record(n)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([3]);
  });

  test("elseif conditions that begin with an operator or a function literal", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local x = false
local y = false
local t = {1}
local n = 5
host_record(if x then 1 elseif not y then 2 else 3)
host_record(if x then 1 elseif #t then 2 else 3)
host_record(if x then 1 elseif -n then 2 else 3)
host_record(if x then 1 elseif function() return 1 end then 2 else 3)
local r = "none"
if if x then nil elseif not y then 1 else nil then
  r = "a"
end
host_record(r)
local v = if x then 1 elseif function(l0)
  return l0
end then 2 else 3
host_record(v)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([2, 2, 2, 2, "a", 2]);
  });

  test("an else arm glued to the enclosing then", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local c = true
host_record(if if c then false else (true)then "A" else "B")
host_record(if if c then false else "x"then "A" else "B")
host_record(if if c then false else {}then "A" else "B")
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["B", "B", "B"]);
  });

  test("if statement and while loop with an else arm glued to their then or do", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local c = false
local r = "none"
if if c then false else (true)then
  r = "a"
end
host_record(r)
if if c then false else "x"then
  r = "b"
end
host_record(r)
if false then
  r = "wrong"
elseif if c then false else {}then
  r = "c"
end
host_record(r)
if if (c)then false else (true)then
  r = "d"
end
host_record(r)
if (not c)then
  r = "e"
end
host_record(r)
local n = 0
while if n < 3 then true else (false)do
  n += 1
end
host_record(n)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["a", "b", "c", "d", "e", 3]);
  });

  test("an else arm ending in a vararg glued to the enclosing then", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function pick(c, ...)
  return if if c then false else ...then "A" else "B"
end

function take(c, ...)
  local r = "none"
  if if c then false else ...then
    r = "a"
  end
  return r
end

function run()
local a = pick(false, 1)
host_record(a)
local b = pick(false, false)
host_record(b)
local c = take(false, 1)
host_record(c)
local d = take(false, false)
host_record(d)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["A", "B", "a", "none"]);
  });

  test("an else arm ending in a regex literal glued to the enclosing then", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local c = false
local r = "none"
if if c then false else @/x/then
  r = "a"
end
host_record(r)
if if c then false else @/x/githen
  r = "b"
end
host_record(r)
local v = if if c then false else @/x/then "A" else "B"
host_record(v)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["a", "b", "A"]);
  });
});

describe("a name ending in if as an arm", () => {
  test("evaluates to the name's value", () => {
    const r = runConformanceSource(`local motif = 7
assert((if true then motif else 2) == 7)
print(if true then motif else 2)
local v = if false then 1 elseif true then motif else 2
assert(v == 7)
if motif == 7 then
  local w = if false then 1 else motif
  assert(w == 7)
end`);
    expect({
      returnedOK: r.returnedOK,
      errors: r.errorMessages,
      warnings: r.warningMessages,
    }).toEqual({ returnedOK: true, errors: [], warnings: [] });
  });
});

// An if expression continues across line breaks until its else arm has a
// value, as any Luau expression does.
describe("if expression across lines", () => {
  test.each([
    [
      "condition on its own line",
      "Value {f()}.\nfunction f()\n  local y = if false\n    then 1 else 2\n  return y\nend\n",
      "Value 2.\n",
    ],
    [
      "one clause per line",
      "Value {f()}.\nfunction f()\n  local x = if true\n    then 1\n    else 2\n  return x\nend\n",
      "Value 1.\n",
    ],
    [
      "else arm on the next line",
      "Value {f()}.\nfunction f()\n  local x = if false then 1\n    else 2\n  return x\nend\n",
      "Value 2.\n",
    ],
    [
      "returned",
      "Value {f(false)}.\nfunction f(x)\n  return if x\n    then 1\n    else 3\nend\n",
      "Value 3.\n",
    ],
    [
      "elseif chain",
      "Value {f()}.\nfunction f()\n  local x = if false\n    then 1\n    elseif true\n    then 2\n    else 3\n  return x\nend\n",
      "Value 2.\n",
    ],
    [
      "a value on the line after then and else",
      "Value {f()}.\nfunction f()\n  local x = if false\n  then\n    1\n  else\n    2\n  return x\nend\n",
      "Value 2.\n",
    ],
    [
      "nested",
      "Value {f()}.\nfunction f()\n  local y = if true\n    then if false\n      then 1\n      else 2\n    else 3\n  return y\nend\n",
      "Value 2.\n",
    ],
    [
      "a condition and an arm split inside parentheses",
      "Value {f(true, true)}.\nfunction f(a, b)\n  local y = if (a and\n    b)\n    then (1\n      + 10)\n    else 2\n  return y\nend\n",
      "Value 11.\n",
    ],
    [
      "a continuation line in the condition and the then arm",
      "Value {f({ok = true, a = 1})}.\nfunction f(t)\n  local y = if t\n    .ok\n    then t\n      .a\n      + 10\n    else 2\n  return y\nend\n",
      "Value 11.\n",
    ],
    [
      "a continuation line in an elseif condition",
      "Value {f(2)}.\nfunction f(c)\n  local y = if c\n    == 1\n    then 1\n    elseif c\n      == 2\n    then 2\n    else 3\n  return y\nend\n",
      "Value 2.\n",
    ],
    [
      "an operation after the else arm's value on its line",
      "Value {f(true)} {f(false)}.\nfunction f(c)\n  local y = if c then 1 else 2 + 10\n  return y\nend\n",
      "Value 1 12.\n",
    ],
    [
      "a continuation line after the else arm's value",
      "Value {f(true)} {f(false)}.\nfunction f(c)\n  local y = if c then 1 else 2\n    + 10\n  return y\nend\n",
      "Value 1 12.\n",
    ],
    [
      "a continuation line after the else arm, with an operand before the expression",
      "Value {f(true)} {f(false)}.\nfunction f(c)\n  local y = 100 + if c then 1 else 2\n    + 10\n  return y\nend\n",
      "Value 101 112.\n",
    ],
    [
      "a minus line after the else arm's value",
      "Value {f(true)} {f(false)}.\nfunction f(c)\n  local y = if c then 1 else 20\n    - 1\n  return y\nend\n",
      "Value 1 19.\n",
    ],
    [
      "a continuation line after a returned else arm",
      "Value {f(true)} {f(false)}.\nfunction f(c)\n  return if c then 1 else 2\n    + 10\nend\n",
      "Value 1 12.\n",
    ],
    [
      "a continuation line after a nested else arm",
      "Value {f(true)} {f(false)}.\nfunction f(c)\n  local y = if c then 1 else if c then 2 else 3\n    + 10\n  return y\nend\n",
      "Value 1 13.\n",
    ],
    [
      "a line that begins with and or or in the condition, an arm and after the else value",
      "Value {f(false)} {f(true)}.\nfunction f(c)\n  local y = if c\n    or false\n    then 5\n      and 6\n    else nil\n      or 7\n  return y\nend\n",
      "Value 7 6.\n",
    ],
    [
      "a line that begins with or after a value in brackets and in a statement",
      "Value {f()}.\nfunction f()\n  local a = (false\n    or true)\n  local b = false\n    or a\n  return if b then 1 else 2\nend\n",
      "Value 1.\n",
    ],
    [
      "arms that begin with a unary operator",
      "Value {f(true)} {f(false)}.\nfunction f(c)\n  local y = if c\n    then -1\n    else if not c then 2 else 3\n  return y\nend\n",
      "Value -1 2.\n",
    ],
    [
      "a continuation line after a bracketed if expression",
      "Value {f(true)} {f(false)}.\nfunction f(c)\n  local y = (if c then 1 else 2)\n    + 10\n  return y\nend\n",
      "Value 11 12.\n",
    ],
    [
      "a continuation line after a call whose last argument is an if expression",
      "Value {f(true)} {f(false)}.\nfunction f(c)\n  local y = tostring(if c then 1 else 2)\n    .. \"0\"\n  return y\nend\n",
      "Value 10 20.\n",
    ],
    [
      "a minus line and an indexer line in the then arm",
      "Value {f({5})}.\nfunction f(t)\n  local y = if t\n    then t\n      [1]\n      - 1\n    else 2\n  return y\nend\n",
      "Value 4.\n",
    ],
    [
      "nested on the line after then",
      "Value {f(true, false)}.\nfunction f(a, b)\n  local y = if a\n    then\n      if b\n        then 1\n        else 2\n    else 3\n  return y\nend\n",
      "Value 2.\n",
    ],
    [
      "nested in the else arm",
      "Value {f()}.\nfunction f()\n  local y = if false\n    then 1\n    else if false\n      then 2\n      else 3\n  return y\nend\n",
      "Value 3.\n",
    ],
    [
      "a call argument",
      "Value {f()}.\nfunction f()\n  return tostring(if false\n    then 1\n    else 2)\nend\n",
      "Value 2.\n",
    ],
    [
      "an operand",
      "Value {f()}.\nfunction f()\n  local x = 10 + if false\n    then 1\n    else 2\n  return x\nend\n",
      "Value 12.\n",
    ],
  ])("%s", (_name, source, expected) => {
    const ctx = makeRuntimeStoryFromSource(source);
    expect({
      errors: ctx.errorMessages,
      warnings: ctx.warningMessages,
      text: ctx.story.ContinueMaximally(),
    }).toEqual({ errors: [], warnings: [], text: expected });
  });
});

// After `=`, `return` or an opening bracket, an `if` begins an expression
// even when an `=` comes before its else, as in a table field.
describe("if expression with an = before its else", () => {
  test.each([
    ['local x = if t[1] then {a = "y"} else 2\n  return x.a', "Value y.\n"],
    ['local x = if t then {[1] = "y"} else 2\n  return x[1]', "Value y.\n"],
    ['return if true then "a=b" else "c"', "Value a=b.\n"],
    ["return if next({a = 1}) then 1 else 2", "Value 1.\n"],
  ])("%s", (body, expected) => {
    const ctx = makeRuntimeStoryFromSource(
      `Value {f()}.\nfunction f()\n  local t = {1}\n  ${body}\nend\n`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(expected);
  });
});

// Luau rejects an if expression with no else arm. One whose then or else is
// not yet written ends with its own lines, so the lines and functions after
// it are still read as they are written.
describe("if expression without an else", () => {
  const MISSING_CONDITION = "Expected identifier when parsing expression";
  const MISSING_THEN = "Expected 'then' when parsing if then else expression";
  const MISSING_ELSE = "Expected 'else' when parsing if then else expression";

  test.each([
    ["no then yet", "  local y = if true\n", MISSING_THEN],
    ["no else yet", "  local y = if true\n    then 1\n", MISSING_ELSE],
    ["no else on one line", "  local y = if true then 1\n", MISSING_ELSE],
    ["a bare if", "  local y = if\n", MISSING_CONDITION],
    ["no then after elseif", "  local y = if false then 1\n    elseif true\n", MISSING_THEN],
  ])("%s: reports it and keeps what follows", (_name, partial, message) => {
    const ctx = makeRuntimeStoryFromSource(
      `The door is open.\nSum {g()}.\nfunction f()\n${partial}  return y\nend\nfunction g()\n  return 6\nend\nYou walk through it.\n`,
    );
    expect(ctx.errorMessages.filter((m) => m.includes("when parsing"))).toEqual([
      expect.stringContaining(message),
    ]);
    expect(ctx.warningMessages.filter((m) => m.includes("Unknown global"))).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "The door is open.\nSum 6.\nYou walk through it.\n",
    );
  });

  test("in a call argument, an index and a table", () => {
    for (const expr of ["print(if c then 1)", "local t = {}\n  print(t[if c then 1])", "local t = {if c then 1}"]) {
      const ctx = makeRuntimeStoryFromSource(`function f(c)\n  ${expr}\nend\n`);
      expect(ctx.errorMessages.filter((m) => m.includes(MISSING_ELSE)), expr).toHaveLength(1);
    }
  });

  test.each([
    ["no then before elseif", "  local y = if true elseif false then 1 else 2\n", MISSING_THEN, "2:13-2:15"],
    // A missing value that Luau finds missing too is Luau's error, at the
    // token Luau finds instead (#1175).
    ["an empty then arm", "  local y = if true then\n  else 2\n", `${MISSING_CONDITION}, got 'else'`, "3:3-3:7"],
    ["an empty else arm", "  local y = if true then 1 else\n", `${MISSING_CONDITION}, got 'return'`, "3:3-3:9"],
    ["a then arm with only a comment", "  local y = if true then -- no value\n  else 2\n", `${MISSING_CONDITION}, got 'else'`, "3:3-3:7"],
    ["a then arm with only a continuation line", "  local y = if true then\n    + 1\n  else 2\n", `${MISSING_CONDITION}, got '+'`, "3:5-3:6"],
    ["a then arm with only a minus", "  local y = if true then\n    -\n  else 2\n", `${MISSING_CONDITION}, got 'else'`, "4:3-4:7"],
    ["a then arm with only not", "  local y = if true then\n    not\n  else 2\n", `${MISSING_CONDITION}, got 'else'`, "4:3-4:7"],
    ["a then arm with only a length operator", "  local y = if true then\n    #\n  else 2\n", `${MISSING_CONDITION}, got 'else'`, "4:3-4:7"],
    ["a then arm with only a chain of unary operators", "  local y = if true then\n    not not\n  else 2\n", `${MISSING_CONDITION}, got 'else'`, "4:3-4:7"],
    // A cast's `::` is Sparkdown's to report, and a value at column 0 is
    // one Luau reads as the arm's, where Sparkdown ends the statement.
    ["a then arm with only a cast","  local y = if true then\n    :: number\n  else 2\n", MISSING_CONDITION, "2:21-2:25"],
    ["a then arm at column 0 on the line after then", "  local y = if true then\n1\n  else 2\n", MISSING_CONDITION, "2:21-2:25"],
    ["an empty elseif arm", "  local y = if false then 1\n    elseif true then\n    else 2\n", `${MISSING_CONDITION}, got 'else'`, "4:5-4:9"],
    ["no then after elseif", "  local y = if false then 1\n    elseif true\n", MISSING_THEN, "3:5-3:11"],
  ])("%s: reports it where it is missing and keeps what follows", (_name, partial, message, at) => {
    const source = `function f()\n${partial}  return y\nend\nfunction g()\n  return 6\nend\nSum {g()}.\nYou walk through it.\n`;
    expect(ifDiagnostics(source)).toEqual([`${at} ${message}`]);
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.warningMessages.filter((m) => m.includes("Unknown global"))).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Sum 6.\nYou walk through it.\n");
  });

  // The function's own `end` at column 0 comes straight after the unfinished
  // expression, so nothing indented separates the two.
  test.each([
    ["a then arm with only a comment", "  local y = if true\n    then -- still writing\n", `${MISSING_CONDITION}, got 'end'`, "4:1-4:4"],
    ["no else yet", "  local y = if true\n    then 1\n", MISSING_ELSE, "2:13-2:15"],
    ["no then yet", "  local y = if true\n", MISSING_THEN, "2:13-2:15"],
    ["a reassignment with no else yet", "  x = if true\n    then 1\n", MISSING_ELSE, "2:7-2:9"],
  ])("%s, right before the function's end: keeps the next function", (_name, body, message, at) => {
    const source = `function f()\n${body}end\nfunction g()\n  return 6\nend\nSum {g()}.\n`;
    expect(ifDiagnostics(source)).toEqual([`${at} ${message}`]);
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.story.ContinueMaximally()).toBe("Sum 6.\n");
  });

  test("in an & statement, followed by a statement at column 0", () => {
    const source = `& x = 0\n& x = if true\n  then 1\nx = 6\nValue {x}.\n`;
    expect(ifDiagnostics(source)).toEqual([`2:7-2:9 ${MISSING_ELSE}`]);
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.story.ContinueMaximally()).toBe("Value 6.\n");
  });

  test.each([
    ["a reassignment", "="],
    ["a compound assignment", "+="],
  ])("in %s, followed by a statement at column 0", (_name, op) => {
    const source = `Value {f()}.\nfunction f()\n  local x = 0\n  x ${op} if true\n    then 1\nx = 6\n  return x\nend\n`;
    expect(ifDiagnostics(source)).toEqual([`4:${op.length + 6}-4:${op.length + 8} ${MISSING_ELSE}`]);
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.story.ContinueMaximally()).toBe("Value 6.\n");
  });

  // Each clause that can end the line of an unfinished if expression. An
  // empty then or else arm stops the call when it runs, with or without the
  // next line, so every row also counts the two reassignments in the tree.
  test.each([
    ["no then yet", "  x = if true\n", `4:7-4:9 ${MISSING_THEN}`, "Value 6.\n"],
    ["then ending the line", "  x = if true then\n", `4:15-4:19 ${MISSING_CONDITION}`, null],
    ["else ending the line", "  x = if false then 1 else\n", `4:23-4:27 ${MISSING_CONDITION}`, null],
    ["no then after elseif", "  x = if false then 1\n    elseif true\n", `5:5-5:11 ${MISSING_THEN}`, "Value 6.\n"],
  ])("in a reassignment with %s, followed by a reassignment at column 0", (_name, partial, diagnostic, value) => {
    const source = `Value {f()}.\nfunction f()\n  local x = 0\n${partial}x = 6\n  return x\nend\n`;
    expect(ifDiagnostics(source)).toEqual([diagnostic]);
    expect(reassignmentCount(source)).toBe(2);
    if (value !== null) {
      const ctx = makeRuntimeStoryFromSource(source);
      expect(ctx.story.ContinueMaximally()).toBe(value);
    }
  });

  test.each([
    ["a return", "return 6"],
    ["a local declaration", "local y = 6\nx = y"],
    ["a call", "set(6)"],
    ["an if statement", "if true then x = 6 end"],
    ["a do block", "do x = 6 end"],
    ["a while loop", "while x ~= 6 do x = 6 end"],
    ["a for loop", "for i = 6, 6 do x = i end"],
  ])("in a reassignment, followed by %s at column 0", (_name, next) => {
    const source = `Value {f()}.\nlocal x = 0\nfunction set(v)\n  x = v\nend\nfunction f()\n  x = if true\n    then 1\n${next}\n  return x\nend\n`;
    expect(ifDiagnostics(source)).toEqual([`7:7-7:9 ${MISSING_ELSE}`]);
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.story.ContinueMaximally()).toBe("Value 6.\n");
  });

  // A column-0 line after an if expression's line that belongs to the
  // expression still does: a clause keyword, a continuation, and the value of
  // an else arm.
  test.each([
    ["then and else at column 0", "local a = true\nlocal x = if a\nthen 1\nelse 2\n", "Value 1.\n"],
    ["a continuation at column 0", 'local a = true\nlocal x = if a then "x"\n.. "z"\nelse "y"\n', "Value xz.\n"],
    ["an else value at column 0", 'local a = false\nlocal x = if a then "a" else\n"c"\n', "Value c.\n"],
    ["an else value at column 0 that is a name", "local a = false\nlocal n = 4\nlocal x = if a then 1 else\nn\n", "Value 4.\n"],
  ])("%s stays in the expression", (_name, lines, value) => {
    const ctx = makeRuntimeStoryFromSource(`${lines}Value {x}.\n`);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(value);
  });

  test("in a Sparkle prop binding", () => {
    const ctx = makeRuntimeStoryFromSource(
      `layout main with\n  text "x" #opacity={if true then 1}\nend\n`,
    );
    expect(ctx.errorMessages.filter((m) => m.includes(MISSING_ELSE))).toHaveLength(1);
  });

  test("display text may leave out the else", () => {
    const ctx = makeRuntimeStoryFromSource(`A {if f() then "B"}.\nfunction f()\n  return true\nend\n`);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("A B.\n");
  });

  test("a display line that is only the interpolation may leave out the else", () => {
    const ctx = makeRuntimeStoryFromSource(
      `{if f() then "A"}\n{if false then "x" elseif f() then "B"}\nscene main\n  {if f() then "C"}\nend\nfunction f()\n  return true\nend\n`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("A\nB\n");
  });

  test("choice text may leave out the else", () => {
    const ctx = makeRuntimeStoryFromSource(
      `choose\n  * [Take {if f() then "it"}]\nend\nfunction f()\n  return true\nend\n`,
    );
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.ContinueMaximally();
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual(["Take it"]);
  });
});

describe("clause-less if in display text", () => {
  test("shows its condition's value", () => {
    const { errors, text } = compileAndCapture(`The value is {if pick()}.
done

function pick()
  return 7
end
`);
    expect(errors).toEqual([]);
    expect(text).toContain("The value is 7.");
  });
});
