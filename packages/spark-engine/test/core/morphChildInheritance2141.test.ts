import { describe, expect, test } from "vitest";
import { buildMorphMotion } from "@impower/sparkdown/src/morph/motion";
import { createHarness } from "../ui/harness/uiTestHarness";

const BASE = `morph base {
  blend = cut
  timing {
    duration = 0.75
    easing = linear
  }
  keyframes {
    from {
      mouth {
        state = closed
        translate = 0 2px
      }
    }
    to {
      mouth {
        state = open
      }
    }
  }
}
`;

const SCENE = `
scene start
  Hello.
end
`;

const CHILD = `morph child as base {\n  blend = cut\n}\n`;

const cases: [string, string, string][] = [
  ["a parent written in the scripts", `${BASE}\n${CHILD}${SCENE}`, "child"],
  ["a grandchild chain", `${BASE}\n${CHILD}\nmorph grandchild as child {\n  blend = cut\n}\n${SCENE}`, "grandchild"],
];

describe("the engine plays a child morph with its inherited timing and motion", () => {
  test.each(cases)("%s", async (_label, source, name) => {
    const harness = createHarness(source);
    await harness.ready;
    const ui: any = harness.game.module.ui;
    const timing = ui.morphTiming(name);
    expect(timing.duration).toBe(0.75);
    expect(timing.easing).toBe("linear");
    expect(JSON.stringify(buildMorphMotion(ui.context.morph?.[name]?.keyframes))).toContain("mouth");
  });
});
