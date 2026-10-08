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
import { testStory } from "../engineUnderTest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

function source(callArgs: string): string {
  return `external host_record(v)
-> main
scene main
  & f(${callArgs})
  done
end

function f(...)
  if select("#", ...) > 0 then
    local a, b, c, d = ...
    host_record(a)
    host_record(b == nil)
    host_record(c)
    host_record(d == nil)
  end
  host_record(select("#", ...))
end
`;
}

function saveInsideVarargAndResume(callArgs: string): {
  errors: string[];
  recorded: unknown[];
  savedJson: string;
} {
  const { story: storyA, errorMessages, compiledJson } =
    makeRuntimeStoryFromSource(source(callArgs));
  const errors = errorMessages.map((m) => `[compile] ${m}`);

  storyA.BindExternalFunction("host_record", (v: unknown) => v);
  storyA.onError = (m: string) => errors.push(`[before save] ${m}`);
  storyA.pauseBeforeEvaluatingConditions = true;
  for (let i = 0; i < 100 && !storyA.pausedBeforeCondition; i++) {
    if (!storyA.canContinue) break;
    storyA.ContinueAsync();
  }
  expect(storyA.pausedBeforeCondition).not.toBeNull();
  const savedJson = storyA.state.toJson();

  const storyB = testStory(compiledJson as Record<string, any>);
  const recorded: unknown[] = [];
  storyB.BindExternalFunction("host_record", (v: unknown) => {
    recorded.push(v);
    return v;
  });
  storyB.onError = (m: string) => errors.push(`[after load] ${m}`);
  storyB.state.LoadJson(savedJson);
  storyB.ContinueMaximally();

  return { errors, recorded, savedJson };
}

describe("saving a state inside a vararg function", () => {
  test("the vararg pack survives a save and load with its arity", () => {
    const { errors, recorded, savedJson } = saveInsideVarargAndResume(
      `"a", nil, "c", nil`,
    );
    // The save was taken inside `f`, so it holds the pack.
    expect(savedJson).toContain(`"tuple"`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["a", true, "c", true, 4]);
  });

  test("an empty vararg pack survives a save and load", () => {
    const { errors, recorded, savedJson } = saveInsideVarargAndResume("");
    expect(savedJson).toContain(`"tuple":[]`);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([0]);
  });
});
