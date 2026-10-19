// #1056 — a `store` with no value holds nil, and a story state holding it
// serializes and reloads.
//
// A nil global compares equal to a nil default, so it serializes and is left
// out of the save like any other unchanged store; a nil written over a
// non-nil default is saved and reloaded as nil.

import { describe, expect, test } from "vitest";
import { testStory } from "../engineUnderTest";
import { NullValue } from "../../runtime/Value";
import { VariablesState } from "../../runtime/VariablesState";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

const NIL_STORES = [
  ["store trust", "store trust\n\nHello there.\ndone\n"],
  ["store number", "store number\n\nHello there.\ndone\n"],
  ["store number trust = 1", "store number trust = 1\n\nHello there.\ndone\n"],
] as const;

describe("a story state holding a nil store", () => {
  test.each(NIL_STORES)("`%s` serializes", (_name, src) => {
    const { story, errorMessages } = makeRuntimeStoryFromSource(src);
    expect(errorMessages).toEqual([]);
    expect(() => story.state.toJson()).not.toThrow();
  });

  test("a nil store reloads as nil", () => {
    const src = "store trust\n\nHello there.\ndone\n";
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
    const src = "store trust = 1\n\ntrust = nil\nHello there.\ndone\n";
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
      const src = "store nilstore\nstore kept = 1\nstore changed = 1\n\nchanged = 2\nHello there.\ndone\n";
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
