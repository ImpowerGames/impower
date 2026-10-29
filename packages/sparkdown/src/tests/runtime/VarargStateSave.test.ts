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
  const { story: storyA, errorMessages, root } =
    makeRuntimeStoryFromSource(source(callArgs));
  const errors = errorMessages.map((m) => `[compile] ${m}`);

  storyA.BindExternalFunction("host_record", (v: unknown) => v);
  storyA.onError = (m: string) => errors.push(`[before save] ${m}`);
  storyA.pauseBeforeEvaluatingConditions = true;
  for (let i = 0; i < 100 && storyA.pausedBeforeCondition === null; i++) {
    if (!storyA.canContinue) break;
    storyA.ContinueAsync();
  }
  expect(storyA.pausedBeforeCondition).not.toBeNull();
  const savedJson = storyA.state.toJson();

  const storyB = testStory(root);
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
