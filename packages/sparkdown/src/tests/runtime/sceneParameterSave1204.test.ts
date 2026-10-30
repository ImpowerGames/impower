// #1204: a script that diverts into a scene with its argument (`-> s(10)`)
// and reads the parameter on two lines keeps that argument through a save:
// the session save and the durable one write the entered scene's frame, load
// back, and the scene runs on with the argument still bound.
import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

const source = "scene start\n  -> s(10)\nend\n\nscene s(a)\n  First {a}.\n  Second {a}.\nend\n";

const start = () => {
  const ctx = makeRuntimeStoryFromSource(source);
  expect(ctx.errorMessages).toEqual([]);
  ctx.story.keepBeatImages = true;
  expect(ctx.story.Continue()).toBe("First 10.\n");
  return ctx;
};

describe("a scene entered with its argument saves across its lines", () => {
  test("the session save writes, loads and runs on with the argument bound", () => {
    const ctx = start();
    const saved = ctx.story.state.ToJson() as string;
    const other = makeRuntimeStoryFromSource(source);
    other.story.state.LoadJson(saved);
    expect(other.story.Continue()).toBe("Second 10.\n");
  });

  test("the durable save writes, loads and runs on with the argument bound", () => {
    const ctx = start();
    const saved = ctx.story.toSave();
    const other = makeRuntimeStoryFromSource(source);
    other.story.keepBeatImages = true;
    other.story.loadSave(saved);
    expect(other.story.currentText?.trim()).toBe("First 10.");
    expect(other.story.Continue()).toBe("Second 10.\n");
  });
});
