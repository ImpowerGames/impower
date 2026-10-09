import { describe, expect, it } from "vitest";
import { SceneTracker } from "../../game/core/classes/SceneTracker";

describe("SceneTracker", () => {
  const functions = new Set(["Helper", "__binding$3"]);
  const tracker = () => new SceneTracker((flow) => functions.has(flow));
  // Each observation names the flow the story stands in, as the program's
  // locator names it (`sceneAt`).

  it("reports a transition only when the flow changes", () => {
    const t = tracker();
    expect(t.observe("A")).toEqual({
      scene: "A",
      previous: null,
      stack: [],
    });
    expect(t.observe("A")).toBeNull();
    expect(t.observe("A")).toBeNull();
    expect(t.observe("B")).toEqual({
      scene: "B",
      previous: "A",
      stack: [],
    });
    expect(t.current).toBe("B");
  });

  it("ignores functions: a call keeps the scene current", () => {
    const t = tracker();
    t.observe("A");
    expect(t.observe("Helper")).toBeNull();
    expect(t.observe("__binding$3")).toBeNull();
    expect(t.current).toBe("A");
    expect(t.observe("A")).toBeNull();
  });

  it("derives the return stack from callstack scenes, excluding functions and the scene itself", () => {
    const t = tracker();
    t.observe("A");
    const transition = t.observe("B", ["A", "Helper", "B", "A"]);
    expect(transition).toEqual({ scene: "B", previous: "A", stack: ["A"] });
  });

  it("forgets the current flow on reset", () => {
    const t = tracker();
    t.observe("A");
    t.reset();
    expect(t.current).toBeNull();
    expect(t.observe("A")?.previous).toBeNull();
  });
});
