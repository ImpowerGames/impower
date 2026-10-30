import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource, runToEnd } from "./runtimeTestHarness";

describe("const save isolation", () => {
  test("a stale save cannot overwrite a compiled constant", () => {
    const v1 = makeRuntimeStoryFromSource(
      ["store LIMIT = 5", "scene start", "  & LIMIT = 99", "  {LIMIT}", "end"].join("\n"),
    );
    expect(v1.errorMessages).toEqual([]);
    expect(runToEnd(v1.story)).toBe("99\n");
    const staleSave = v1.story.state.ToJson();
    expect(staleSave).toContain("LIMIT");

    const v2 = makeRuntimeStoryFromSource(
      ["const LIMIT = 6", "scene start", "  {LIMIT}", "end"].join("\n"),
    );
    expect(v2.errorMessages).toEqual([]);
    v2.story.state.LoadJson(staleSave);
    expect(v2.story.variablesState.$("LIMIT")).toBe(6);
  });

  test("a stale save's value of a constant still defines the table another global shares", () => {
    const v1 = makeRuntimeStoryFromSource(
      ["store K = nil", "store alias = nil", "scene start", "  & K = { n = 1 }", "  & alias = K", "  {alias.n}", "end"].join("\n"),
    );
    expect(v1.errorMessages).toEqual([]);
    expect(runToEnd(v1.story)).toBe("1\n");
    const staleSave = v1.story.state.ToJson();

    const v2 = makeRuntimeStoryFromSource(
      ["const K = 10", "store alias = nil", "scene start", "  {K}", "end"].join("\n"),
    );
    expect(v2.errorMessages).toEqual([]);
    v2.story.state.LoadJson(staleSave);
    expect(v2.story.variablesState.$("K")).toBe(10);
    const alias = v2.story.variablesState.GetVariableWithName("alias") as any;
    expect(alias?.value?.get("n")?.value).toBe(1);
  });

  test("a constant is never written into save data", () => {
    const ctx = makeRuntimeStoryFromSource(
      ["const LIMIT = 6", "store other = 1", "scene start", "  & other = 2", "  {LIMIT}", "end"].join("\n"),
    );
    expect(ctx.errorMessages).toEqual([]);
    runToEnd(ctx.story);
    const save = ctx.story.state.ToJson();
    const variablesState = JSON.parse(save).variablesState ?? {};
    expect(Object.keys(variablesState)).not.toContain("LIMIT");
    expect(Object.keys(variablesState)).toContain("other");
  });

  test("a constant is still an inspectable runtime global", () => {
    const ctx = makeRuntimeStoryFromSource(
      ["const LIMIT = 6", "scene start", "  {LIMIT}", "end"].join("\n"),
    );
    expect(ctx.errorMessages).toEqual([]);
    runToEnd(ctx.story);
    expect(ctx.story.variablesState.$("LIMIT")).toBe(6);
  });
});
