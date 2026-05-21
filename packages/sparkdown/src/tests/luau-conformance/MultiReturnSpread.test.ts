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

describe("Lua-fidelity multi-return spread", () => {
  test("f(g()) where g returns N spreads into f's N regular params", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
function g() return 1, 2, 3 end
function f(a, b, c) return a + b + c end
host_record(f(g()))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([6]);
  });

  test("f(g()) where g returns N spreads into f's variadic slot", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
function g() return 1, 2, 3 end
function f(...) return select("#", ...) end
host_record(f(g()))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([3]);
  });

  test("non-last multi-return truncates to first value", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
function g() return 1, 2, 3 end
function f(a, b) return a + b end
host_record(f(g(), 10))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([11]);
  });

  test("f(x, g()) spreads g's return values into the remaining params", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
function g() return 2, 3 end
function f(a, b, c) return a * 100 + b * 10 + c end
host_record(f(1, g()))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([123]);
  });

  test("table.unpack spreads into a non-variadic receiving function", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local t = { 4, 5, 6 }
function f(a, b, c) return a + b + c end
host_record(f(table.unpack(t)))
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([15]);
  });
});
