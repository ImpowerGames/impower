// Regression tests for the calls.luau batch — Lua's call/value
// "adjustment" rules:
//   - Method-call receivers evaluate exactly ONCE
//     (StashAndRereadExpression): `a:add(10):add(20)` must not re-run
//     `add(10)` for the chained link's lookup + threaded self.
//   - `LuauChainedPropertyAccess` links fold after method calls
//     (`a:m(x).y`, `a:get().x`).
//   - A multi-return PACK treats a no-value tail correctly: the LAST
//     expression returning zero values spreads to zero (recursive
//     `return t[i], rest(...)` chains), a non-last one adjusts to nil.
//   - Zero-arg value-call sites don't spread the CALLER's pending
//     multi-return off the eval stack (`local a,b,c = g(), g()`).
//   - Parenthesized expressions adjust to ONE value
//     (SingleValueExpression): `(ret2(f()))` truncates.
//   - Over-applied fixed-arity natives evaluate all args then discard
//     the extras: `math.sin(1,2) == math.sin(1)`.
//   - `self` is an ordinary variable outside method bodies —
//     `self = 20` at chunk level assigns a global the dot-form
//     `function a.y (x) return x+self end` reads.
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
  if (!result.program.compiled) {
    return { errors: ["NO_COMPILED"], recorded: [] };
  }
  const story = new RuntimeStory(result.program.compiled as Record<string, any>);
  const recorded: unknown[] = [];
  story.BindExternalFunction("host_record", (v: unknown) => {
    recorded.push(v);
    return v;
  });
  const errors: string[] = [];
  story.onError = (m: string) => errors.push(m);
  story.ContinueMaximally();
  return { errors, recorded };
}

describe("method-call receiver single evaluation", () => {
  test("chained colon calls and trailing property access", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local a = {x=0}
function a:add (x) self.x, a.y = self.x+x, 20; return self end
host_record(a:add(10):add(20):add(30).x)
host_record(a.y)
local b = {x=5}
function b:get () return self end
host_record(b:get().x)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([60, 20, 5]);
  });
});

describe("multi-return adjustment", () => {
  test("no-value tails pack to zero values; non-last adjust to nil", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local pack = table.pack
function unl (t, i)
  i = i or 1
  if (i <= table.getn(t)) then
    return t[i], unl(t, i+1)
  end
end
local r = pack(unl({1, 2, 3}))
host_record(r.n)
host_record(r[3])
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([3, 3]);
  });

  test("zero-arg calls don't spread the caller's pending multi-return", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local function g() return 7, 8 end
local a, b, c = g(), g()
host_record(a)
host_record(b)
host_record(c)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([7, 7, 8]);
  });

  test("parens adjust to one value; extra native args are discarded", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local function f() return 1, 2, 30, 4 end
local function ret2 (a, b) return a, b end
local a, b, c = table.unpack(table.pack(ret2(f()), (ret2(f()))))
host_record(a)
host_record(b)
host_record(c)
host_record(math.sin(1, 2) == math.sin(1))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([1, 1, null, true]);
  });
});

describe("self as a plain variable outside methods", () => {
  test("chunk-level self assignment is readable from dot-form functions", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local a = {i = 10}
self = 20
function a:x (x) return x+self.i end
function a.y (x) return x+self end
host_record(a:x(1))
host_record(a.y(1))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([11, 21]);
  });
});
