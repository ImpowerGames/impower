// A divert whose target does not resolve reports `target not found` at compile
// time, and that diagnostic is its only symptom: the compiled program still
// loads, so one bad target never stops the rest of the story from running.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

const tunnelScene = `scene t
  X
  ->->
end
`;

describe("a program with an unresolved divert target", () => {
  test.each([
    ["a mid-line tunnel chain in dialogue", "HERO: Hi -> t -> there."],
    ["a mid-line tunnel chain in plain text", "Hi -> t -> there."],
    ["a standalone divert", "-> there"],
  ])("loads when the target is %s", (_, line) => {
    const source = `-> main\nscene main\n  ${line}\n  done\nend\n${tunnelScene}`;
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual(["target not found: `-> there`"]);
    expect(ctx.story).toBeDefined();
  });

  test("loads when the tunnel itself is unresolved", () => {
    const source = `-> main\nscene main\n  HERO: Hi -> nope -> there.\n  done\nend\n`;
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([
      "target not found: `-> nope`",
      "target not found: `-> there`",
    ]);
    expect(ctx.story).toBeDefined();
  });

  test("runs the content that does not reach the unresolved divert", () => {
    const source = `-> main
scene main
  Before
  if false then
    -> there
  end
  After
  done
end
`;
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual(["target not found: `-> there`"]);
    expect(ctx.story.ContinueMaximally()).toBe("Before\nAfter\n");
  });

  test("reports a story error when it reaches the unresolved divert", () => {
    const source = `-> main\nscene main\n  Before\n  -> there\nend\n`;
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual(["target not found: `-> there`"]);
    expect(() => ctx.story.ContinueMaximally()).toThrow("Divert target not found.");
  });
});
