// Regression tests for Lua "timely closing" of upvalues across loop
// iterations (basic.luau's "upvalues & loops (validates timely
// closing)" block, lines ~609-700).
//
// Two mechanisms under test:
//   1. Close-on-redeclare (CallStack.SetTemporaryVariable): re-running
//      a `local x = ...` declaration in the SAME scope frame — which
//      loop bodies do every iteration, incl. the synthesized loop-var
//      copy — creates a fresh cell, so open upvalues captured against
//      the previous iteration's binding close with that iteration's
//      value.
//   2. Scope unwinding on break/continue (lowerLuauBreakContinue): a
//      `break` nested in scoped blocks (`if` arms, `do` bodies) emits
//      one EndScope per skipped block so the runtime scope stack stays
//      balanced — a leaked frame made a later same-named `local`
//      close a still-open upvalue against the wrong binding.
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

describe("timely upvalue closing across loop iterations", () => {
  test("numeric for: each closure keeps its iteration's loop var", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local res = {}
for i = 1, 5 do
    res[#res+1] = (function() return i end)
end
local sum = 0
for i, f in pairs(res) do sum = sum + f() end
host_record(sum)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([15]);
  });

  test("generic for: each closure keeps its iteration's control var", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local res = {}
for i in ipairs({1,2,3,4,5}) do
    res[#res+1] = (function() return i end)
end
local sum = 0
for i, f in pairs(res) do sum = sum + f() end
host_record(sum)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([15]);
  });

  test("while body local: fresh cell per iteration", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local res = {}
local i = 0
while i <= 5 do
    local j = i
    res[#res+1] = (function() return j end)
    i = i + 1
end
local sum = 0
for i, f in pairs(res) do sum = sum + f() end
host_record(sum)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([15]);
  });

  test("repeat body local: fresh cell per iteration", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local res = {}
local i = 0
repeat
    local j = i
    res[#res+1] = (function() return j end)
    i = i + 1
until i > 5
local sum = 0
for i, f in pairs(res) do sum = sum + f() end
host_record(sum)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([15]);
  });

  test("break inside an if-arm unwinds the arm's scope", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local res = {}
for i in ipairs({1,2,3,4,5,6,7,8,9,10}) do
    res[#res+1] = (function() return i end)
    if i == 5 then
        break
    end
end
local sum = 0
for i, f in pairs(res) do sum = sum + f() end
host_record(sum)
host_record(#res)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([15, 5]);
  });

  test("do-block local closes when the block exits", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local f = nil
do local a = 1 f = function() return a end end
host_record(f())
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([1]);
  });

  test("intra-iteration mutation stays visible (cell shared until redeclare)", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local res = {}
for i = 1, 3 do
    local x = i
    res[#res+1] = (function() return x end)
    x = i * 10
end
local sum = 0
for i, f in pairs(res) do sum = sum + f() end
host_record(sum)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([60]);
  });

  test("reassigning counter upvalues still shares one cell", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local n = 0
local function bump() n = n + 1 end
bump()
bump()
host_record(n)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([2]);
  });
});
