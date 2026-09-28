// Regression tests for Luau's `if cond then a else b` EXPRESSION
// form (ifelseexpr.luau). Lowered to a `TernaryExpression`
// (TernaryExpression.ts) that emits conditional content-pointer
// jumps via the `sc:if` / `sc:jump` ControlCommand ops — only the
// taken arm's value ops execute (verified by the side-effect test).
// An unparenthesized if expression in a condition ends before the
// enclosing `then` or `do` once its else arm is complete, including when
// that arm is glued to the `then` or `do` with no whitespace.
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";
import { runConformanceSource } from "./conformanceTestHarness";

function compileAndCapture(source: string): {
  errors: string[];
  recorded: unknown[];
  text: string;
} {
  const compiler = new SparkdownCompiler();
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
  const story = new RuntimeStory(result.program.compiled as Record<string, any>);
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
