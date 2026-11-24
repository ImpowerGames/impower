import { describe, expect, test } from "vitest";
import { talkingPortrait, talkScript } from "@impower/sparkdown/src/tests/morph/fixtures";
import { createHarness, flattenMessages } from "./harness/uiTestHarness";

const LIDS = `morph lids_blink {
  blend = cut
  keyframes {
    from {
      lids {
        state = off
      }
    }
    50% {
      lids {
        state = on
      }
    }
    to {
      lids {
        state = off
      }
    }
  }
}
`;

const svg = { uri: "inmemory:///bunny.svg", type: "image", name: "bunny", ext: "svg", data: talkingPortrait() } as any;
const png = (name: string) => ({ uri: `inmemory:///${name}.png`, type: "image", name, ext: "png", src: `/src/${name}.png` }) as any;

const kit = (assets: string) => `define kit as layered_image with\n  assets = {\n${assets}  }\nend\n`;

async function written(source: string, assets: any[]) {
  const harness = createHarness(source, 0, { assets });
  const logged: [string, string][] = [];
  (harness.game as any)._context.system.log = (message: unknown, severity: string) => logged.push([String(message), severity]);
  await harness.ready;
  await harness.preview(source.split("\n").findIndex((line) => line.includes("Line one.")));
  await new Promise((resolve) => setTimeout(resolve, 200));
  const messages = flattenMessages(harness.messages);
  const writes = messages.filter(
    (message: any) =>
      message?.method === "ui/write-image" && message.params.target === "portrait" && message.params.instructions[0]?.content?.morph,
  );
  return {
    contents: writes.map((write: any) => write.params.instructions[0].content),
    artifacts: messages.filter((message: any) => message?.method === "morph/artifact").map((message: any) => message.params),
    warnings: logged.filter(([, severity]) => severity === "warning").map(([message]) => message),
  };
}

describe("an SVG layer keeps its own morphs inside a picture its own morph drives (#2632)", () => {
  const scene = `scene start\n  HERO:\n    [[show portrait kit]]\n    Line one.\n    Line two.\nend\n`;

  test("an image write carries the picture's plays and the SVG layer's plays, and no conflict warning", async () => {
    const source = `${LIDS}\n${talkScript()}\n${kit('    ["face"] = bunny,\n    ["lids.on"] = lid_file,\n')}\n${scene}`;
    const { contents, artifacts, warnings } = await written(source, [svg, png("lid_file")]);
    const content = contents.at(-1);
    const plays = content.morph.plays;
    expect(plays.map((play: any) => [play.morph, play.ref.image, play.layer])).toEqual([["lids_blink", "kit", 0]]);
    const files = plays[0].picture.files;
    expect(files.map((file: any) => [file.src, file.plays?.map((play: any) => [play.morph, play.ref.image])])).toEqual([
      [expect.stringMatching(/^data:image\/svg\+xml,/), [["talk", "bunny"]]],
      ["/src/lid_file.png", undefined],
    ]);
    expect(files.map((file: any) => file.layer)).toEqual([0, undefined]);
    const keys = [plays[0].ref.key, files[0].plays[0].ref.key];
    for (const key of keys) {
      expect(artifacts.filter((params: any) => params.key === key)).toHaveLength(1);
    }
    expect(warnings).toEqual([]);
  });

  test("an SVG layer hidden at rest keeps its own plays while the picture's morph plays", async () => {
    const source = `${LIDS}\n${talkScript()}\n${kit('    ["base"] = base_file,\n    ["lids.on"] = bunny,\n')}\n${scene}`;
    const { contents, warnings } = await written(source, [svg, png("base_file")]);
    const plays = contents.at(-1).morph.plays;
    expect(plays.map((play: any) => [play.morph, play.ref.image])).toEqual([["lids_blink", "kit"]]);
    expect(plays[0].picture.files.map((file: any) => [file.plays?.map((play: any) => play.morph), file.layer])).toEqual([
      [undefined, undefined],
      [["talk"], undefined],
    ]);
    expect(warnings).toEqual([]);
  });

  test("a morph that fits both the picture and its SVG layer plays once at each level", async () => {
    const mouth = `morph chew {\n  blend = cut\n  keyframes {\n    from {\n      mouth {\n        state = open\n      }\n    }\n    to {\n      mouth {\n        state = closed\n      }\n    }\n  }\n}\n`;
    const source = `${mouth}\n${kit('    ["face"] = bunny,\n    ["mouth.open"] = open_file,\n    ["mouth.closed default"] = closed_file,\n')}\n${scene}`;
    const { contents, warnings } = await written(source, [svg, png("open_file"), png("closed_file")]);
    const plays = contents.at(-1).morph.plays;
    expect(plays.map((play: any) => [play.morph, play.ref.image])).toEqual([["chew", "kit"]]);
    expect(plays[0].picture.files[0].plays.map((play: any) => [play.morph, play.ref.image])).toEqual([["chew", "bunny"]]);
    expect(warnings).toEqual([]);
  });
});
