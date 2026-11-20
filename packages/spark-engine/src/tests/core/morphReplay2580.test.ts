import { describe, expect, test } from "vitest";
import { blinkScript, talkingPortrait } from "@impower/sparkdown/src/tests/morph/fixtures";
import { createHarness } from "../ui/harness/uiTestHarness";

const ART = {
  uri: "inmemory:///bunny.svg",
  type: "image",
  name: "bunny",
  ext: "svg",
  data: talkingPortrait(),
} as any;

const withReplay = (fields: string) => blinkScript().replace(/\}\s*$/, `  replay {\n${fields}  }\n}\n`);

const scene = (morphs: string) => `${morphs}


scene start
  HERO:
    [[show portrait bunny]]
    Line.
end
`;

async function play(source: string) {
  const harness = createHarness(source, 0, { assets: [ART] });
  await harness.ready;
  await harness.preview(source.split("\n").findIndex((line) => line.includes("Line.")));
  const writes = harness.messages
    .flatMap((message) => (message?.method === "ui/batch" ? message.params.messages : [message]))
    .filter((message) => message?.method === "ui/write-image" && message.params.target === "portrait" && message.params.instructions.length);
  return writes.at(-1)?.params.instructions[0].content.morph.plays[0];
}

describe("the play an image write carries for a morph with a replay (#2580)", () => {
  test("carries the replay in its timing, and its definition follows the replay's values", async () => {
    const half = await play(scene(withReplay("    from = 0%\n    to = 33.333%\n    chance = 50%\n    delay_min = 0.17\n    delay_max = 0.35\n")));
    expect(half.morph).toBe("blink");
    expect(half.timing.replay).toEqual([{ from: 0, to: 33.333 / 100, chance: 0.5, count: 1, delay_min: 0.17, delay_max: 0.35 }]);
    const quarter = await play(scene(withReplay("    from = 0%\n    to = 33.333%\n    chance = 25%\n    delay_min = 0.17\n    delay_max = 0.35\n")));
    expect(quarter.timing.replay[0].chance).toBe(0.25);
    expect(quarter.definition).not.toBe(half.definition);
    const none = await play(scene(blinkScript()));
    expect(none.timing.replay).toBeUndefined();
    expect(none.definition).not.toBe(half.definition);
  });
});
