import { afterEach, beforeEach, describe, expect, test } from "vitest";
import AnimationPlayer from "../../../spark-dom/src/classes/AnimationPlayer";
import { animations, TimedAnimation, TimedEffect, timeline } from "./timedAnimation";

const timing = { duration: 0.01, fill: "forwards" } as any;

const created = (element: Element) =>
  animations
    .filter((a) => a.effect.target === element)
    .map((a) => ({
      composite: (a.effect.timing as { composite?: string }).composite ?? "replace",
      replaceState: a.replaceState,
    }));

describe("combined movement on one element is kept once finished (I-2872)", () => {
  const g = globalThis as any;
  let saved: { Animation: unknown; KeyframeEffect: unknown };

  beforeEach(() => {
    saved = { Animation: g.Animation, KeyframeEffect: g.KeyframeEffect };
    g.Animation = TimedAnimation;
    g.KeyframeEffect = TimedEffect;
    timeline.currentTime = 0;
    animations.length = 0;
  });

  afterEach(() => {
    Object.assign(g, saved);
    animations.length = 0;
  });

  test("two movements: the replacing and the adding animation both persist", () => {
    const element = document.createElement("div");
    new AnimationPlayer({} as any).add({
      element: element as HTMLElement,
      animations: [
        { keyframes: [{ translate: "0vw 0vh" }, { translate: "30vw 0vh" }], timing },
        { keyframes: [{ translate: "0px 0px" }, { translate: "10px 20px" }], timing },
      ] as any,
    });
    expect(created(element)).toEqual([
      { composite: "replace", replaceState: "persisted" },
      { composite: "add", replaceState: "persisted" },
    ]);
  });

  test("a lone animation keeps the browser's removal of replaced animations", () => {
    const element = document.createElement("div");
    new AnimationPlayer({} as any).add({
      element: element as HTMLElement,
      animations: [{ keyframes: [{ opacity: "0" }, { opacity: "1" }], timing }] as any,
    });
    expect(created(element)).toEqual([{ composite: "replace", replaceState: "active" }]);
  });
});
