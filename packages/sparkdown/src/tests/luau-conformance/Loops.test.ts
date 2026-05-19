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

describe("while loop", () => {
  test("counter mutation reaches outer scope", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local n = 0
while n < 3 do
n = n + 1
end
& host_record(n)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([3]);
  });

  test("body fires for each iteration", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local n = 0
while n < 3 do
& host_record(n)
n = n + 1
end
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([0, 1, 2]);
  });

  test("zero iterations — condition false from start", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local n = 100
while n < 3 do
n = n + 1
end
& host_record(n)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([100]);
  });

  test("loop body can read AND mutate multiple outer locals", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local i = 0
local total = 0
while i < 5 do
total = total + i
i = i + 1
end
& host_record(total)
& host_record(i)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([10, 5]);
  });

  test("loops nest — inner while inside outer while", () => {
    const { errors, recorded } = compileAndCapture(`external host_record(v)
& run()
done

function run()
local i = 0
local sum = 0
while i < 3 do
local j = 0
while j < 3 do
sum = sum + 1
j = j + 1
end
i = i + 1
end
& host_record(sum)
end
`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([9]);
  });
});
