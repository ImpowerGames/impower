// Regression tests for the attrib.luau batch:
//   - Table/function values as table KEYS use pointer identity
//     (luauMapKeyString in Story.ts) — self-referential `a[a] = a`
//     must not recurse, distinct empty tables are distinct keys, and
//     stdlib markers (`a[print]`) key by tag since each source
//     reference builds a fresh marker object.
//   - Stdlib markers compare equal by tag (`a[f] == print` after
//     storing `print`).
//   - Call-rooted assignment targets (`f(a)[2] = 10`) decompose via
//     the expression lowerer when the segment-walk can't root a
//     VariableReference (multi-target path in lower.ts).
//   - `;` is a STATEMENT separator owned by LuauBlockBody, not
//     LuauExpression — `local x = {}; for i=1,n do ... end; return`
//     on one line parses as three statements (the for-loop previously
//     degraded into a once-through do-block).
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

describe("identity-based table keys", () => {
  test("self-referential and chained table keys", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local a = {}
a[a] = a
host_record(a[a] == a)
host_record(a[a][a][a] == a)
local t1 = {}
local t2 = {}
local m = {}
m[t1] = 1
m[t2] = 2
host_record(m[t1])
host_record(m[t2])
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([true, true, 1, 2]);
  });

  test("stdlib builtins as keys and equality by tag", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function nothing() end

function run()
local a = {}
a[print] = assert
host_record(a[print] == assert)
local f = print
host_record(f == print)
host_record(print == assert)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([true, true, false]);
  });
});

describe("call-rooted assignment targets", () => {
  test("f(a)[k] = v in single and multi-target assignments", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function ident(x) return x end

function run()
local a = {9, 9}
ident(a)[1] = 4
host_record(a[1])
local b, c
a[1], ident(a)[2], b, c = 7, 10, a[1], 5, 99
host_record(a[1])
host_record(a[2])
host_record(b)
host_record(c)
end
`);
    expect(errors).toEqual([]);
    // b must see the OLD a[1] (4) — RHS evaluates before any store.
    expect(recorded).toEqual([4, 7, 10, 4, 5]);
  });
});

describe("semicolon statement separators", () => {
  test("one-line local; for; return parses as three statements", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local unpack = table.unpack
local f = function (n) local x = {}; for i=1,n do x[i]=i end; return unpack(x) end
local r1, r2, r3 = f(3)
host_record(r1)
host_record(r2)
host_record(r3)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([1, 2, 3]);
  });
});
