// Regression tests for Luau's generalized iteration protocol
// (iter.luau): the hidden `__adjust_iter` stdlib entry runs at
// generic-for ENTRY and classifies the iterand —
//   - `__iter` metamethod → its returns become (f, s, ctrl);
//   - plain table → implicit pairs iteration (`for k, v in t do`);
//   - function values / markers / callable tables pass through;
//   - non-iterables raise the trappable "attempt to iterate over a
//     X value"; nil (including an `__iter` that returned nothing)
//     falls through to the step's "attempt to call a nil value".
// Also: EMPTY loop bodies (`for x in t do end`) still lower — the
// dispatcher used to silently drop the whole loop when the do-block
// had no content child.
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

describe("generalized iteration", () => {
  test("__iter metamethod and implicit table iteration", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local f = {}
setmetatable(f, { __iter = function(x)
  return next, {1, 2, 3, 4}
end })
local x = 0
for n in f do
  x += n
end
host_record(x)
local y = 0
for k, v in {1, 2, 3, nil, 5, a = 1, b = 2, c = 3} do
  y += v
end
host_record(y)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([10, 17]);
  });

  test("non-iterables raise; nil-iterator __iter raises call-a-nil", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local ok, err = pcall(function() for x in 42 do end end)
host_record(ok)
host_record(err:match("attempt to iterate") ~= nil)
local obj = {}
setmetatable(obj, { __iter = function() end })
local ok2, err2 = pcall(function() for x in obj do end end)
host_record(ok2)
host_record(err2:match("attempt to call a nil value") ~= nil)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([false, true, false, true]);
  });
});
