import { describe, expect, test } from "vitest";
import { createHarness } from "../ui/harness/uiTestHarness";

const SCENE = `
scene start
  Hello.
end
`;

const morph = (body: string) => `morph talk {
  blend = cut
  timing {
    duration = 1
    easing = linear
${body}  }
  keyframes {
    from {
      mouth {
        state = closed
      }
    }
    to {
      mouth {
        state = open
      }
    }
  }
}
${SCENE}`;

const ROOT = (count: string) =>
  morph("").replace("  keyframes {", `  replay {\n    chance = 100%\n    count = ${count}\n  }\n  keyframes {`);

const replayOf = async (source: string) => {
  const harness = createHarness(source);
  await harness.ready;
  const ui: any = harness.game.module.ui;
  return ui.morphTiming("talk").replay;
};

describe("the engine never plays a replay whose count is above 1000 (#2695)", () => {
  test("a root replay with count 1000 is played", async () => {
    expect(await replayOf(ROOT("1000"))).toEqual([{ from: 0, to: 1, chance: 1, count: 1000 }]);
  });

  test("a root replay with count 100000000 is not played", async () => {
    expect(await replayOf(ROOT("100000000"))).toBeUndefined();
  });

  test("a replay written inside timing is not played, whatever its count", async () => {
    const misplaced = "    replay {\n      { from = 0; to = 1; chance = 1; count = 100000000 }\n    }\n";
    expect(await replayOf(morph(misplaced))).toBeUndefined();
    const single = "    replay {\n      chance = 100%\n      count = 2\n    }\n";
    expect(await replayOf(morph(single))).toBeUndefined();
  });
});
