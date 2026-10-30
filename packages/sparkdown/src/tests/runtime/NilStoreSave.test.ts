import { describe, expect, test } from "vitest";
import { testStory } from "../engineUnderTest";
import { NullValue } from "../../runtime/Value";
import { VariablesState } from "../../runtime/VariablesState";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

const START = "\n\nscene start\n  Hello there.\n  done\nend\n";

const NIL_STORES = [
  ["store trust", `store trust${START}`],
  ["store number", `store number${START}`],
  ["store number, store trust = 1", `store number\nstore trust = 1${START}`],
] as const;

describe("a story state holding a nil store", () => {
  test.each(NIL_STORES)("`%s` serializes", (_name, src) => {
    const { story, errorMessages } = makeRuntimeStoryFromSource(src);
    expect(errorMessages).toEqual([]);
    expect(() => story.state.toJson()).not.toThrow();
  });

  test("a nil store reloads as nil", () => {
    const src = `store trust${START}`;
    const { story, root } = makeRuntimeStoryFromSource(src);
    const saved = story.state.toJson();

    const loaded = testStory(root);
    loaded.state.LoadJson(saved);
    const trust = loaded.state.variablesState.GetVariableWithName("trust");
    expect(trust).not.toBeNull();
    expect(trust).toBeInstanceOf(NullValue);
    expect(() => loaded.state.toJson()).not.toThrow();
  });

  test("a nil written over a non-nil default saves and loads as nil", () => {
    const src =
      "store trust = 1\n\nscene start\n  trust = nil\n  Hello there.\n  done\nend\n";
    const { story, root } = makeRuntimeStoryFromSource(src);
    story.ContinueMaximally();
    const saved = story.state.toJson();
    expect(JSON.parse(saved).variablesState.trust).toBe("nil");

    const loaded = testStory(root);
    loaded.state.LoadJson(saved);
    expect(loaded.state.variablesState.GetVariableWithName("trust")).toBeInstanceOf(NullValue);
  });

  test("a store equal to its default is still left out of the save", () => {
    const previous = VariablesState.dontSaveDefaultValues;
    VariablesState.dontSaveDefaultValues = true;
    try {
      const src =
        "store nilstore\nstore kept = 1\nstore changed = 1\n\nscene start\n  changed = 2\n  Hello there.\n  done\nend\n";
      const { story } = makeRuntimeStoryFromSource(src);
      story.ContinueMaximally();
      const saved = JSON.parse(story.state.toJson());
      const globals = saved.variablesState ?? {};
      expect(Object.keys(globals)).not.toContain("kept");
      expect(Object.keys(globals)).not.toContain("nilstore");
      expect(Object.keys(globals)).toContain("changed");
    } finally {
      VariablesState.dontSaveDefaultValues = previous;
    }
  });
});
