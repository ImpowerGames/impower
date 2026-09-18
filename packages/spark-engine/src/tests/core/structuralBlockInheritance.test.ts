// A structural block (`morph`, `animation`, `theme`) registers a runtime
// `__def` under its keyword type, so the engine reads it from the live story
// like any other define: its own fields as written, then an `as PARENT`
// ancestor, then the builtin `$default`, through the runtime `__index` chain.

import { describe, expect, test } from "vitest";
import { buildDefinesContext } from "../../game/core/utils/buildContextFromStory";
import { createHarness } from "../ui/harness/uiTestHarness";

const SRC = `morph blink with
  method = bend
  layers:
    creases:
      fallback = scale
  keyframes:
    from:
      eyes:
        state = eyes.open
    50%:
      eyes:
        state = 01
    to:
      eyes:
        state = open
  timing:
    iterations = infinite
    iteration_delay_min = 0.2
    iteration_delay_max = 6
end

morph slow as blink with
  timing:
    duration = 1
end

-> start
scene start
  Hello.
end
`;

describe("morph blocks at runtime", () => {
  test("a morph and its child reach the engine with defaults and inherited fields", async () => {
    const harness = createHarness(SRC);
    await harness.ready;
    const story = (harness.game as any).story ?? (harness.game as any)._story;
    const ctx = buildDefinesContext(story);
    const blink = ctx["morph"]?.["blink"] as any;
    expect(blink).toMatchObject({
      $type: "morph",
      $name: "blink",
      method: "bend",
      blend: "morph",
      fallback: "fade",
      layers: { creases: { fallback: "scale" } },
      timing: {
        iterations: "infinite",
        iteration_delay_min: 0.2,
        iteration_delay_max: 6,
      },
    });
    expect(
      (blink?.["keyframes"] as any[]).map((k) => [k.offset, k.eyes.state]),
    ).toEqual([
      [0, "open"],
      [0.5, "01"],
      [1, "open"],
    ]);
    const slow = ctx["morph"]?.["slow"] as any;
    expect(slow).toMatchObject({ $name: "slow", method: "bend", blend: "morph" });
    expect(slow?.["timing"]).toMatchObject({ duration: 1 });
    expect((slow?.["keyframes"] as any[])?.length).toBe(3);
  });

  test("an animation inherits from an authored parent animation", async () => {
    const harness = createHarness(`animation glow with
  keyframes:
    from:
      opacity = "0"
    to:
      opacity = "1"
  timing:
    duration = 2
    easing = "linear"
end

animation quick_glow as glow with
  timing:
    duration = 0.5
end

-> start
scene start
  Hello.
end
`);
    await harness.ready;
    const story = (harness.game as any).story ?? (harness.game as any)._story;
    const quick = buildDefinesContext(story)["animation"]?.["quick_glow"] as any;
    expect(quick).toMatchObject({ $name: "quick_glow" });
    expect(quick?.["keyframes"]).toEqual([
      { offset: 0, opacity: "0" },
      { offset: 1, opacity: "1" },
    ]);
    expect(quick?.["timing"]).toMatchObject({ duration: 0.5 });
  });

  const contextOf = async (source: string) => {
    const harness = createHarness(`${source}
-> start
scene start
  Hello.
end
`);
    await harness.ready;
    const story = (harness.game as any).story ?? (harness.game as any)._story;
    return buildDefinesContext(story) as any;
  };

  test("a builtin parent is inherited, and the child stays an animation", async () => {
    const ctx = await contextOf(`animation slow_fade as fadein with
  timing:
    duration = 3
end
`);
    expect(ctx.animation?.slow_fade).toMatchObject({
      $type: "animation",
      keyframes: ctx.animation?.fadein?.keyframes,
      timing: { duration: 3 },
    });
    expect(ctx.fadein).toBeUndefined();
  });

  test("a parent declared after its child is linked when it registers", async () => {
    const ctx = await contextOf(`morph slow as blink with
  timing:
    duration = 1
end

morph blink with
  method = bend
  keyframes:
    from:
      eyes:
        state = open
    to:
      eyes:
        state = closed
end
`);
    expect(ctx.morph?.slow).toMatchObject({ $type: "morph", method: "bend" });
    expect(ctx.morph?.slow?.keyframes).toHaveLength(2);
  });

  test("blocks of different types may share a parent's name", async () => {
    const ctx = await contextOf(`animation base with
  keyframes:
    from:
      opacity = "0"
    to:
      opacity = "1"
end

animation child as base with
  timing:
    duration = 2
end

morph base with
  method = trace
end

morph other as base with
  fallback = cut
end
`);
    expect(ctx.animation?.child?.keyframes).toEqual(ctx.animation?.base?.keyframes);
    expect(ctx.morph?.other).toMatchObject({ method: "trace", fallback: "cut" });
    expect(ctx.morph?.other?.keyframes).not.toEqual(ctx.animation?.base?.keyframes);
  });

  test("a cycle of parents is refused rather than looping", async () => {
    const ctx = await contextOf(`morph a as b with
  method = bend
end

morph b as a with
  fallback = cut
end
`);
    expect(ctx.morph?.a).toMatchObject({ method: "bend" });
    expect(ctx.morph?.b).toMatchObject({ fallback: "cut", method: "bend" });
  });
});
