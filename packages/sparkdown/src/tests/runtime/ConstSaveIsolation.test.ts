// Constants must not round-trip through save data.
//
// A `const` is a real runtime global (so it is inspectable — the debug adapter
// can show it like any other variable), but its value comes entirely from the
// compiled program. If it were persisted or restored like a mutable global,
// a save written when the name was still a `store` would overwrite the
// compiled constant on load and pin it to the stale value forever — editing
// the `const` in the script would then have no effect for existing players.
//
// Both directions are pinned here: never written, and never restored.
import "../../inkjs/engine/Container";
import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource, runToEnd } from "./runtimeTestHarness";

describe("const save isolation", () => {
  test("a stale save cannot overwrite a compiled constant", () => {
    // v1: `LIMIT` is a mutable global, mutated to 99 and saved.
    const v1 = makeRuntimeStoryFromSource(
      ["store LIMIT = 5", "& LIMIT = 99", "{LIMIT}"].join("\n"),
    );
    expect(v1.errorMessages).toEqual([]);
    expect(runToEnd(v1.story)).toBe("99\n");
    const staleSave = v1.story.state.ToJson();
    expect(staleSave).toContain("LIMIT");

    // v2: the author has since turned `LIMIT` into a constant with a new
    // value. Loading the old save must NOT resurrect 99.
    const v2 = makeRuntimeStoryFromSource(
      ["const LIMIT = 6", "{LIMIT}"].join("\n"),
    );
    expect(v2.errorMessages).toEqual([]);
    v2.story.state.LoadJson(staleSave);
    expect(v2.story.variablesState.$("LIMIT")).toBe(6);
  });

  test("a constant is never written into save data", () => {
    const ctx = makeRuntimeStoryFromSource(
      ["const LIMIT = 6", "store other = 1", "& other = 2", "{LIMIT}"].join("\n"),
    );
    expect(ctx.errorMessages).toEqual([]);
    runToEnd(ctx.story);
    const save = ctx.story.state.ToJson();
    const variablesState = JSON.parse(save).variablesState ?? {};
    expect(Object.keys(variablesState)).not.toContain("LIMIT");
    // The mutable global still persists, so this isn't vacuously passing.
    expect(Object.keys(variablesState)).toContain("other");
  });

  test("a constant is still an inspectable runtime global", () => {
    const ctx = makeRuntimeStoryFromSource(
      ["const LIMIT = 6", "{LIMIT}"].join("\n"),
    );
    expect(ctx.errorMessages).toEqual([]);
    runToEnd(ctx.story);
    // Visible through the same API a debugger would use.
    expect(ctx.story.variablesState.$("LIMIT")).toBe(6);
  });
});
