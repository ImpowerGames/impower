import { pathTableLocator } from "@impower/sparkdown/src/compiler/utils/programLocator";
import { describe, expect, it } from "vitest";
import { SceneTracker } from "../../game/core/classes/SceneTracker";

describe("SceneTracker", () => {
  const functions = new Set(["Helper", "__binding_3"]);
  const tracker = () => new SceneTracker((flow) => functions.has(flow));
  // On the current engine an address is a runtime path, and the scene it
  // stands in is the one the path-table locator names.
  const locator = pathTableLocator(undefined, []);
  const sceneAt = (path: string) => locator.sceneAt(path);
  const scenesAt = (paths: string[]) =>
    paths.map((path) => locator.sceneAt(path) ?? "");

  it("names the flow a path belongs to, with root content as 0", () => {
    expect(sceneAt("Rooftop.0.3")).toBe("Rooftop");
    expect(sceneAt("Rooftop")).toBe("Rooftop");
    expect(sceneAt("0.5")).toBe("0");
    expect(sceneAt("12")).toBe("0");
    expect(locator.sceneAt("")).toBeUndefined();
    expect(locator.sceneAt(null)).toBeUndefined();
  });

  it("reports a transition only when the flow changes", () => {
    const t = tracker();
    expect(t.observe(sceneAt("A.0"))).toEqual({
      scene: "A",
      previous: null,
      stack: [],
    });
    expect(t.observe(sceneAt("A.1"))).toBeNull();
    expect(t.observe(sceneAt("A.inner.2"))).toBeNull();
    expect(t.observe(sceneAt("B.0"))).toEqual({
      scene: "B",
      previous: "A",
      stack: [],
    });
    expect(t.current).toBe("B");
  });

  it("ignores functions: a call keeps the scene current", () => {
    const t = tracker();
    t.observe(sceneAt("A.0"));
    expect(t.observe(sceneAt("Helper.0"))).toBeNull();
    expect(t.observe(sceneAt("__binding_3.0"))).toBeNull();
    expect(t.current).toBe("A");
    expect(t.observe(sceneAt("A.4"))).toBeNull();
  });

  it("derives the return stack from callstack scenes, excluding functions and the scene itself", () => {
    const t = tracker();
    t.observe(sceneAt("A.0"));
    const transition = t.observe(
      sceneAt("B.0"),
      scenesAt(["A.3", "Helper.1", "B.0", "A.3"]),
    );
    expect(transition).toEqual({ scene: "B", previous: "A", stack: ["A"] });
  });

  it("forgets the current flow on reset", () => {
    const t = tracker();
    t.observe(sceneAt("A.0"));
    t.reset();
    expect(t.current).toBeNull();
    expect(t.observe(sceneAt("A.0"))?.previous).toBeNull();
  });
});
