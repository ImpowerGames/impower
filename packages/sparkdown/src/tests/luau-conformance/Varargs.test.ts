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

describe("Luau varargs", () => {
  test("function with only `...` captures all args", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
function f(...) return select("#", ...) end
host_record(f())
host_record(f(10, 20, 30))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([0, 3]);
  });

  test("function with regular params plus `...`", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
function f(a, b, ...)
  return select("#", ...) + a + b
end
host_record(f(100, 200, 1, 2, 3))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([303]);
  });

  test("missing regular params bind to nil on variadic call", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
function f(a, ...)
  return tostring(a)
end
host_record(f())
host_record(f(7))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["nil", "7"]);
  });

  test("select(n, ...) returns nth and following extras", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
function f(...) return select(2, ...) end
host_record(f(10, 20, 30))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([20]);
  });

  test("`{...}` packs varargs into a table in source order", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
function f(...)
  local t = {...}
  host_record(t[1])
  host_record(t[2])
  host_record(t[3])
end
f("a", "b", "c")
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["a", "b", "c"]);
  });

  test("`return ...` propagates all varargs via multi-target assignment", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
function f(...) return ... end
local a, b, c = f(1, 2, 3)
host_record(a)
host_record(b)
host_record(c)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([1, 2, 3]);
  });

  test("`...` as last call-arg spreads into receiving stdlib", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
function f(...)
  host_record(string.format("%d/%d/%d", ...))
end
f(10, 20, 30)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["10/20/30"]);
  });
});
