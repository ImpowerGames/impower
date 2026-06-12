// Regression tests for Lua short-circuit `and`/`or` evaluation
// (the `ShortCircuit` ControlCommand emitted by BinaryExpression).
// Previously both operands were evaluated eagerly with operand-
// returning semantics applied afterwards — correct results for pure
// scalar operands, but the untaken branch's side effects ran (and
// metamethod-bearing operands could recurse forever — basic.luau's
// vec3t `type(r) == "number" and vec3t(l.x * r, ...) or
// vec3t(l.x * r.x, ...)` pattern).
//
// Also covers the grammar fix that terminates a one-line
// reassignment's value expression at a following bare CALL statement
// (`mt = { f = 1 } setmetatable(a, mt)`) without truncating
// parenthesized operands after logical keywords (`a = b and (x)`).
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

function compileAndCapture(source: string): {
  errors: string[];
  recorded: unknown[];
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
  const errors: string[] = [];
  if (!result.program.compiled) {
    return { errors: ["NO_COMPILED"], recorded: [] };
  }
  const story = new RuntimeStory(result.program.compiled as Record<string, any>);
  const recorded: unknown[] = [];
  story.BindExternalFunction("host_record", (v: unknown) => {
    recorded.push(v);
    return v;
  });
  story.onError = (m: string) => errors.push(m);
  story.ContinueMaximally();
  return { errors, recorded };
}

describe("short-circuit and/or", () => {
  test("operand-returning semantics are preserved", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
host_record(1 and 2)
host_record(tostring(nil and 1))
host_record(tostring(false or nil))
host_record(nil or "d")
host_record(0 and "zero-is-truthy")
host_record("" or "unreached")
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([2, "nil", "nil", "d", "zero-is-truthy", ""]);
  });

  test("untaken branch is never evaluated", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local n = 0
local function bump() n = n + 1 return true end
local r1 = false and bump()
local r2 = true or bump()
host_record(n)
host_record(r1)
host_record(r2)
local r3 = true and bump()
local r4 = false or bump()
host_record(n)
host_record(r3)
host_record(r4)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([0, false, true, 2, true, true]);
  });

  test("guarded nil indexing does not error", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local t = nil
host_record(tostring(t and t.field))
local u = { field = 7 }
host_record(u and u.field)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["nil", 7]);
  });

  test("cond-and-a-or-b ternary idiom picks one branch", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local n = 0
local function pick(label) n = n + 1 return label end
local r = (1 > 0) and pick("yes") or pick("no")
host_record(r)
host_record(n)
local r2 = (1 < 0) and pick("yes") or pick("no")
host_record(r2)
host_record(n)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["yes", 1, "no", 2]);
  });

  test("chained and/or evaluate left to right with early exit", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local log = ""
local function v(name, val) log = log .. name return val end
local r = v("a", true) and v("b", false) and v("c", true)
host_record(r)
host_record(log)
log = ""
local r2 = v("x", nil) or v("y", 5) or v("z", 6)
host_record(r2)
host_record(log)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([false, "ab", 5, "xy"]);
  });
});

describe("one-line statement boundaries around constructors", () => {
  test("call statement after a table-constructor assignment runs", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local a = {}
mt = { f = 1 } setmetatable(a, mt)
host_record(getmetatable(a) == mt)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([true]);
  });

  test("constructor entries holding functions still split correctly", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local a = {}
local b = {}
mt = { __eq = function(l, r) return #l == #r end } setmetatable(a, mt) setmetatable(b, mt)
host_record(a == b)
host_record(a ~= b)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([true, false]);
  });

  test("parenthesized operand after `and` is not truncated", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local b = 5
local x = b and (b + 1)
y = b and (b + 2)
host_record(x)
host_record(y)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([6, 7]);
  });

  test("call statement after a one-line repeat/until condition runs", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local b = 0
repeat b = b + 1 until (b > 2) host_record(b)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([3]);
  });
});
