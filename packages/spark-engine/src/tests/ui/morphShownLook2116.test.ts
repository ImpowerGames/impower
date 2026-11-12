import { describe, expect, test } from "vitest";
import { blinkScript, talkingPortrait } from "@impower/sparkdown/src/tests/morph/fixtures";
import { createHarness } from "./harness/uiTestHarness";

const ART = {
  uri: "inmemory:///bunny.svg",
  type: "image",
  name: "bunny",
  ext: "svg",
  data: talkingPortrait(),
} as any;

const scene = (morphs: string, image = "bunny") => `${morphs}


scene start
  HERO:
    [[show portrait ${image}]]
    Line.
end
`;

const SHUT = `morph shut {
  blend = cut
  fallback = cut
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
  timing {
    delay = 1
  }
}
`;

async function written(source: string) {
  const harness = createHarness(source, 0, { assets: [ART] });
  await harness.ready;
  await harness.preview(source.split("\n").findIndex((line) => line.includes("Line.")));
  const writes = harness.messages
    .flatMap((message) => (message?.method === "ui/batch" ? message.params.messages : [message]))
    .filter((message) => message?.method === "ui/write-image" && message.params.target === "portrait" && message.params.instructions.length);
  return writes.at(-1)?.params.instructions[0].content;
}

const drawn = (background: string) => decodeURIComponent(background);

describe("the look an image write shows", () => {
  test("a directive's closed eyes show open under a blink that plays on the look", async () => {
    const content = await written(scene(blinkScript(), "bunny:eyes.closed"));
    expect(content.morph.plays.map((play: any) => play.morph)).toEqual(["blink"]);
    expect(drawn(content.background)).toContain("eyes.open:default");
    expect(drawn(content.background)).not.toContain("data-name='eyes.closed'");
    expect(content.morph.still).toBeUndefined();
  });

  test("a blink kept off the look by `unless` writes no play, and the directive's closed eyes show", async () => {
    const content = await written(scene(blinkScript("  unless = eyes.closed\n"), "bunny:eyes.closed"));
    expect(content.morph).toBeUndefined();
    expect(drawn(content.background)).toContain("data-name='eyes.closed'");
    expect(drawn(content.background)).not.toContain("eyes.open:default");
  });

  test("the still a morph with a `delay` writes is its first keyframe, and the background is its rest", async () => {
    const content = await written(scene(SHUT));
    expect(content.morph.plays.map((play: any) => play.morph)).toEqual(["shut"]);
    expect(drawn(content.background)).toContain("mouth.open:default");
    expect(drawn(content.background)).not.toContain("data-name='mouth.closed'");
    expect(content.morph.still).toBeDefined();
    expect(drawn(content.morph.still)).toContain("data-name='mouth.closed'");
    expect(drawn(content.morph.still)).not.toContain("mouth.open:default");
  });

  test("a morph that never plays writes no still: it shows its rest", async () => {
    const content = await written(scene(SHUT.replace("    delay = 1\n", "    delay = 1\n    iterations = 0\n")));
    expect(content.morph.still).toBeUndefined();
    expect(drawn(content.background)).toContain("mouth.open:default");
  });
});
