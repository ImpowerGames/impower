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

describe("`local x` bare declaration (no init)", () => {
  test("declares variable initialized to nil", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local x
host_record(x == nil)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([true]);
  });

  test("subsequent re-assignment writes to the local, not a new global", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
function inner()
  local y
  y = 42
  host_record(y)
end
inner()
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([42]);
  });

  test("bare local doesn't leak to enclosing scope", () => {
    // After inner() returns, y is out of scope. Reading it falls
    // through to the "variable not found" warning path (IntValue 0
    // fallback), but the key thing is y is NOT a global with the
    // assigned value 42 — host_record sees `false`.
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
function inner()
  local y
  y = 42
end
inner()
host_record(y == 42)
end
`);
    // The "variable not found" warning is expected — what we're
    // verifying is the value comparison, not the absence of warnings.
    const realErrors = errors.filter((e) => !e.includes("Variable not found"));
    expect(realErrors).toEqual([]);
    expect(recorded).toEqual([false]);
  });
});
