import { describe, expect, test } from "vitest";
import { testCompiler, testStory } from "../engineUnderTest";

function compileAndCapture(body: string): {
  errors: string[];
  recorded: unknown[];
} {
  const source = `external host_record(v)
scene start
  & run()
  done
end

function run()
${body}
end
`;
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
  if (!result.program.chunks) {
    return { errors: ["NO_COMPILED"], recorded: [] };
  }
  const story = testStory(result.program.chunks);
  const errors: string[] = [];
  const recorded: unknown[] = [];
  story.BindExternalFunction("host_record", (v: unknown) => {
    recorded.push(v);
    return v;
  });
  story.onError = (m: string) => errors.push(m);
  story.ContinueMaximally();
  return { errors, recorded };
}

describe("standard-library function identity", () => {
  test("two reads of one builtin are the same value", () => {
    const { errors, recorded } = compileAndCapture(`host_record(rawequal(print, print))
local f = print
host_record(rawequal(f, f))
host_record(print == print)
local t = {}
t[print] = 1
host_record(t[print])
host_record(rawequal(string.upper, string.upper))
host_record(rawequal(print, tostring))`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([true, true, true, 1, true, false]);
  });

  test("a builtin cannot be given a field or metatable", () => {
    const { recorded } = compileAndCapture(`host_record(pcall(function() print.x = 1 end))
host_record(pcall(rawset, print, "x", 1))
host_record(pcall(setmetatable, print, {}))
host_record(getmetatable(print) == nil)`);
    expect(recorded).toEqual([false, false, false, true]);
  });

  test("a table holding a __stdlib_fn field stays writable", () => {
    const { errors, recorded } = compileAndCapture(`local t = { __stdlib_fn = "print" }
host_record(pcall(function() t.x = 1 end))
host_record(pcall(rawset, t, "y", 2))
host_record(rawget(t, "x"))
host_record(rawget(t, "y"))`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([true, true, 1, 2]);
  });

  test("a builtin held in a global keeps its identity across a save", () => {
    const source = `external host_record(v)
scene start
  & setup()
  First line.
  & check()
  done
end

function setup()
held = print
keyed = {}
keyed[print] = 1
end

function check()
host_record(rawequal(held, print))
host_record(held == print)
host_record(keyed[print])
end
`;
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
    const errors: string[] = [];
    const recorded: unknown[] = [];
    const bind = (story: ReturnType<typeof testStory>) => {
      story.BindExternalFunction("host_record", (v: unknown) => {
        recorded.push(v);
        return v;
      });
      story.onError = (m: string) => errors.push(m);
    };
    const first = testStory(result.program.chunks!);
    bind(first);
    first.Continue();
    const saved = first.state.ToJson();
    const second = testStory(result.program.chunks!);
    bind(second);
    second.state.LoadJson(saved);
    second.ContinueMaximally();
    expect(errors).toEqual([]);
    expect(recorded).toEqual([true, true, 1]);
  });
});
