// #1056 — a `store` with no value holds nil, and a story state holding it
// serializes and reloads.
//
// `VariablesState.WriteJson` compares each global with its default through
// `RuntimeObjectsEqual`, which read `valueObject.Equals` on a nil value's
// `null` valueObject and threw, so the preview's route planner (and any save)
// never got past writing the state.

import { describe, expect, test } from "vitest";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";
import { VariablesState } from "../../inkjs/engine/VariablesState";
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

  test("a nil store saves and loads as nil", () => {
    const src = "store trust\n\nHello there.\ndone\n";
    const { story, compiledJson } = makeRuntimeStoryFromSource(src);
    const saved = story.state.toJson();

    const loaded = new RuntimeStory(compiledJson as Record<string, any>);
    loaded.state.LoadJson(saved);
    const trust = loaded.state.variablesState.GetVariableWithName("trust");
    expect(trust).not.toBeNull();
    expect((trust as any).valueObject).toBeNull();
    expect(() => loaded.state.toJson()).not.toThrow();
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
