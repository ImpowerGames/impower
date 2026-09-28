// #1051 — a story state saved while a vararg function's frame is on the call
// stack round-trips its `__varargs__` pack.
//
// A function declared with `...` keeps its extra arguments as one packed
// temporary. Saving the state while that frame is live has to write the pack
// and loading has to restore it with every value and its arity, because
// `select("#", ...)` counts trailing and interior nils.
//
// Harness: story A pauses before the vararg function's first condition (the
// route search forks there by saving the state), saves, and a fresh story B
// loads the save and runs the rest of the function.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

function compileStory(source: string): Record<string, any> {
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
    throw new Error("story failed to compile");
  }
  return result.program.compiled as Record<string, any>;
}

const SOURCE = `external host_record(v)
-> main
scene main
  & f("a", nil, "c", nil)
  done
end

function f(...)
  if select("#", ...) == 4 then
    local a, b, c, d = ...
    host_record(a)
    host_record(b == nil)
    host_record(c)
    host_record(d == nil)
  end
  host_record(select("#", ...))
end
`;

describe("saving a state inside a vararg function", () => {
  test("the vararg pack survives a save and load with its arity", () => {
    const compiled = compileStory(SOURCE);
    const errors: string[] = [];

    const storyA = new RuntimeStory(compiled);
    storyA.BindExternalFunction("host_record", (v: unknown) => v);
    storyA.onError = (m: string) => errors.push(`[before save] ${m}`);
    storyA.pauseBeforeEvaluatingConditions = true;
    for (let i = 0; i < 100 && !storyA.pausedBeforeCondition; i++) {
      if (!storyA.canContinue) break;
      storyA.ContinueAsync();
    }
    expect(storyA.pausedBeforeCondition).not.toBeNull();
    const savedJson = storyA.state.toJson();

    const storyB = new RuntimeStory(compiled);
    const recorded: unknown[] = [];
    storyB.BindExternalFunction("host_record", (v: unknown) => {
      recorded.push(v);
      return v;
    });
    storyB.onError = (m: string) => errors.push(`[after load] ${m}`);
    storyB.state.LoadJson(savedJson);
    storyB.ContinueMaximally();

    expect(errors).toEqual([]);
    expect(recorded).toEqual(["a", true, "c", true, 4]);
  });
});
