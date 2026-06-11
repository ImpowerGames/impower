// End-to-end test for native `assert(cond [, message])`. The
// implementation routes `assert` through the `STDLIB` registry
// (StdLib.ts) → generic `RunStdLibFunction` ControlCommand →
// runtime dispatcher that calls `entry.fn(story, args)`, which in
// `assert`'s case raises a runtime error via `story.AddError` on
// falsy condition.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

function compileAndRun(source: string) {
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
    return { result, errors: ["NO_COMPILED"] };
  }
  const story = new RuntimeStory(result.program.compiled as Record<string, any>);
  const errors: string[] = [];
  story.onError = (m: string) => errors.push(m);
  story.ContinueMaximally();
  return { result, errors };
}

describe("native assert(cond [, message])", () => {
  test("truthy condition: no error", () => {
    const { errors } = compileAndRun(`& run()
done

function run()
assert(true)
assert(1)
assert("hello")
end
`);
    expect(errors).toEqual([]);
  });

  test("falsy condition (false): default message", () => {
    const { errors } = compileAndRun(`& run()
done

function run()
assert(false)
end
`);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("assertion failed");
  });

  test("falsy condition with custom message", () => {
    const { errors } = compileAndRun(`& run()
done

function run()
assert(false, "custom failure")
end
`);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("custom failure");
  });

  test("assert(0) and assert('') pass under Lua truthiness", () => {
    // Only nil and false are falsy in Lua — 0 and "" are truthy, so
    // these assertions succeed. (Formerly a documented divergence
    // where sparkdown treated 0/"" as falsy; removed for Luau
    // conformance — basic.luau's truthiness section.)
    const { errors } = compileAndRun(`& run()
done

function run()
assert(0)
assert("")
end
`);
    expect(errors).toEqual([]);
  });
});
