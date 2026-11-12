import { describe, expect, test } from "vitest";
import { blinkScript, talkingPortrait, talkScript } from "@impower/sparkdown/src/tests/morph/fixtures";
import { getImageOwner } from "../../game/modules/ui/utils/getImageOwner";
import { createHarness } from "./harness/uiTestHarness";

const art = (name: string) =>
  ({
    uri: `inmemory:///${name}.svg`,
    type: "image",
    name,
    ext: "svg",
    data: talkingPortrait(),
  }) as any;

const DEFINES = `define mia as character with
  name = "MIA"
end

define bunny as character with
  name = "BUNNY"
end

define sleepy as filtered_image with
  image = image.mia@night
end

define sleepier as filtered_image with
  image = image.sleepy
end
`;

const ASSETS = [art("mia"), art("mia@night"), art("stranger")];

async function contextOf() {
  const h = createHarness(`${DEFINES}\n\nscene start\n  Line.\nend\n`, 0, { assets: ASSETS });
  await h.ready;
  return (h.game.module.ui as any).context;
}

describe("the character an image belongs to (#2111)", () => {
  test.each([
    ["mia", "mia", "mia"],
    ["mia@night", "mia@night", "mia"],
    ["a named look built on mia@night", "sleepy", "mia"],
    ["a named look built on a named look", "sleepier", "mia"],
    ["an image whose name gives no character", "stranger", undefined],
    ["a character name after the first @", "stranger@mia", undefined],
  ] as const)("%s", async (_label, name, owner) => {
    expect(getImageOwner(await contextOf(), name)).toBe(owner);
  });

  test("the image write carries the owner with each play", async () => {
    const source = `${DEFINES}\n${blinkScript()}\n${talkScript()}\n\nscene start\n  MIA:\n    [[show portrait sleepy]]\n    Line.\nend\n`;
    const h = createHarness(source, 0, { assets: ASSETS });
    await h.ready;
    await h.preview(source.split("\n").findIndex((line) => line.includes("Line.")));
    const writes = h.messages
      .flatMap((message) => (message?.method === "ui/batch" ? message.params.messages : [message]))
      .filter((message) => message?.method === "ui/write-image" && message.params.target === "portrait" && message.params.instructions.length);
    const plays = writes.at(-1)?.params.instructions[0].content.morph.plays;
    expect(plays.map((play: any) => [play.morph, play.owner])).toEqual([
      ["blink", "mia"],
      ["talk", "mia"],
    ]);
  });
});
