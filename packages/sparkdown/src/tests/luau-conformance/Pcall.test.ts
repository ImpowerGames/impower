// `pcall` and `xpcall` — protected call. The protected-call trap
// (`story.CallLuauFunctionProtected`) catches StoryExceptions and
// runtime errors added to `state.currentErrors` during the inner
// call, returning them as `(false, msg)` instead of letting them
// abort the story.

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

describe("pcall — success path", () => {
  test("returns (true, ...returns) when the call succeeds", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local ok, result = pcall(function() return 42 end)
host_record(ok)
host_record(result)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([true, 42]);
  });

  test("passes args through to the callee", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local ok, sum = pcall(function(a, b) return a + b end, 10, 32)
host_record(ok)
host_record(sum)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([true, 42]);
  });

  test("accepts bare-named function targets", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function double(n)
return n * 2
end

function run()
local ok, v = pcall(double, 21)
host_record(ok)
host_record(v)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([true, 42]);
  });
});

describe("pcall — failure path", () => {
  test("traps a story.Error and returns (false, msg)", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local ok, err = pcall(function()
-- Call assert with a falsy value — assert raises a runtime error.
assert(false, "expected failure")
end)
host_record(ok)
host_record(string.contains(err, "expected failure"))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([false, true]);
  });

  test("does not surface trapped errors to the host", () => {
    const { errors } = compileAndCapture(`external host_record(v)
& run()
done

function run()
pcall(function() assert(false, "should be swallowed") end)
end
`);
    // No errors should escape — host's onError stays empty.
    expect(errors).toEqual([]);
  });

  test("execution continues after a trapped error", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
pcall(function() assert(false, "boom") end)
host_record("after pcall")
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["after pcall"]);
  });
});

describe("xpcall — message handler", () => {
  test("calls msgh with the error and returns (false, msgh(err))", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local ok, msg = xpcall(
function() assert(false, "raw error") end,
function(e) return "wrapped: " .. e end
)
host_record(ok)
host_record(string.contains(msg, "wrapped:"))
host_record(string.contains(msg, "raw error"))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([false, true, true]);
  });

  test("success path bypasses the handler", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local ok, result = xpcall(
function() return "ok" end,
function(e) return "should-not-see-this" end
)
host_record(ok)
host_record(result)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([true, "ok"]);
  });
});
