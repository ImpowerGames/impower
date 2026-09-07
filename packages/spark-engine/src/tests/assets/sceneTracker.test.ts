import { describe, expect, it } from "vitest";
import { SceneTracker } from "../../game/core/classes/SceneTracker";

describe("SceneTracker", () => {
  const functions = new Set(["Helper", "__binding_3"]);
  const tracker = () => new SceneTracker((flow) => functions.has(flow));

  it("names the flow a path belongs to, with root content as 0", () => {
    expect(SceneTracker.sceneOf("Rooftop.0.3")).toBe("Rooftop");
    expect(SceneTracker.sceneOf("Rooftop")).toBe("Rooftop");
    expect(SceneTracker.sceneOf("0.5")).toBe("0");
    expect(SceneTracker.sceneOf("12")).toBe("0");
    expect(SceneTracker.sceneOf("")).toBeNull();
    expect(SceneTracker.sceneOf(null)).toBeNull();
  });

  it("reports a transition only when the flow changes", () => {
    const t = tracker();
    expect(t.observe("A.0")).toEqual({ scene: "A", previous: null, stack: [] });
    expect(t.observe("A.1")).toBeNull();
    expect(t.observe("A.inner.2")).toBeNull();
    expect(t.observe("B.0")).toEqual({ scene: "B", previous: "A", stack: [] });
    expect(t.current).toBe("B");
  });

  it("ignores functions: a call keeps the scene current", () => {
    const t = tracker();
    t.observe("A.0");
    expect(t.observe("Helper.0")).toBeNull();
    expect(t.observe("__binding_3.0")).toBeNull();
    expect(t.current).toBe("A");
    expect(t.observe("A.4")).toBeNull();
  });

  it("derives the return stack from callstack paths, excluding functions and the scene itself", () => {
    const t = tracker();
    t.observe("A.0");
    const transition = t.observe("B.0", ["A.3", "Helper.1", "B.0", "A.3"]);
    expect(transition).toEqual({ scene: "B", previous: "A", stack: ["A"] });
  });

  it("forgets the current flow on reset", () => {
    const t = tracker();
    t.observe("A.0");
    t.reset();
    expect(t.current).toBeNull();
    expect(t.observe("A.0")?.previous).toBeNull();
  });
});
