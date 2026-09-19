// A `morph` block registers a runtime `__def` under the builtin `morph` type,
// so the engine reads it from the live story like any other define: its own
// fields as written (with literal state names) over the type's `$default`.

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

-> start
scene start
  Hello.
end
`;

describe("morph blocks at runtime", () => {
  test("a morph reaches the engine with its fields, literal states and the builtin defaults", async () => {
    const harness = createHarness(SRC);
    await harness.ready;
    const story = (harness.game as any).story ?? (harness.game as any)._story;
    const blink = buildDefinesContext(story)["morph"]?.["blink"] as any;
    expect(blink).toMatchObject({
      $type: "morph",
      $name: "blink",
      method: "bend",
      blend: "morph",
      fallback: "fade",
      layers: { creases: { fallback: "scale" } },
      timing: {
        duration: 0.25,
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
  });
});
