import { describe, expect, test } from "vitest";
import { talkingPortrait, talkScript } from "@impower/sparkdown/src/tests/morph/fixtures";
import { createHarness, flattenMessages } from "./harness/uiTestHarness";

const P = "inmemory:///assets/Images/Portraits";

const png = (path: string) => {
  const leaf = path.slice(path.lastIndexOf("/") + 1);
  return { uri: `${P}/${path}`, type: "image", name: leaf.slice(0, leaf.lastIndexOf(".")), ext: "png", src: `/src/${path}` } as any;
};

const FILES = [png("ava.png"), png("ava mouth.closed default.png"), png("ava mouth.open.png"), png("ava lids.on.png")];

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

const FLAP = `morph flap {
  blend = cut
  keyframes {
    from {
      mouth {
        state = closed
      }
    }
    50% {
      mouth {
        state = open
      }
    }
    to {
      mouth {
        state = closed
      }
    }
  }
}
`;

async function written(source: string, assets: any[], again?: string) {
  const harness = createHarness(source, 0, { assets });
  const logged: [string, string][] = [];
  (harness.game as any)._context.system.log = (message: unknown, severity: string) => logged.push([String(message), severity]);
  await harness.ready;
  await harness.preview(source.split("\n").findIndex((line) => line.includes("Line one.")));
  await new Promise((resolve) => setTimeout(resolve, 200));
  const rewritten = again ? (harness.game as any).module.ui.getMorphContent([again], () => undefined) : undefined;
  await new Promise((resolve) => setTimeout(resolve, 200));
  const messages = flattenMessages(harness.messages);
  const writes = messages.filter(
    (message: any) =>
      message?.method === "ui/write-image" && message.params.target === "portrait" && message.params.instructions[0]?.content?.morph,
  );
  return {
    contents: [...writes.map((write: any) => write.params.instructions[0].content), ...(rewritten ? [{ morph: rewritten }] : [])],
    artifacts: messages.filter((message: any) => message?.method === "morph/artifact").map((message: any) => message.params),
    warnings: logged.filter(([, severity]) => severity === "warning").map(([message]) => message),
  };
}

describe("an image write of a picture made of image files (#2629)", () => {
  const SOURCE = `${LIDS}\n${FLAP}\n\nscene start\n  HERO:\n    [[show portrait ava]]\n    Line one.\nend\n`;

  test("carries one play for each morph on one reference spanning the picture's layers, and the artifact is sent once for its key", async () => {
    const { contents, artifacts, warnings } = await written(SOURCE, FILES, "ava");
    expect(contents).toHaveLength(2);
    for (const content of contents) {
      const plays = content.morph.plays;
      expect(plays.map((play: any) => play.morph)).toEqual(["flap", "lids_blink"]);
      expect(plays.map((play: any) => play.layer)).toEqual([0, 0]);
      expect(plays[0].ref).toEqual(plays[1].ref);
      expect(plays[0].ref).toMatchObject({ morphs: ["flap", "lids_blink"], image: "ava", groups: ["mouth", "lids"] });
      expect(plays[0].picture).toEqual({
        span: 2,
        files: [
          { src: "/src/ava.png", name: "ava.png" },
          { src: "/src/ava lids.on.png", name: "ava lids.on.png" },
          { src: "/src/ava mouth.closed default.png", name: "ava mouth.closed default.png" },
          { src: "/src/ava mouth.open.png", name: "ava mouth.open.png" },
        ],
      });
    }
    const key = contents[0].morph.plays[0].ref.key;
    const sent = artifacts.filter((params: any) => params.key === key);
    expect(sent).toHaveLength(1);
    expect(sent[0].artifact).toMatchObject({ status: "live", diagnostics: [] });
    expect(warnings).toEqual([]);
  });

  test("a hand-written layered_image whose SVG layer plays a morph of its own keeps that morph, and the picture's own morph does not play", async () => {
    const svg = { uri: "inmemory:///bunny.svg", type: "image", name: "bunny", ext: "svg", data: talkingPortrait() } as any;
    const lids = { uri: "inmemory:///lid_file.png", type: "image", name: "lid_file", ext: "png", src: "/src/lid_file.png" } as any;
    const source = `${LIDS}\n${talkScript()}\ndefine kit as layered_image with\n  assets = {\n    ["face"] = bunny,\n    ["lids.on"] = lid_file,\n  }\nend\n\nscene start\n  HERO:\n    [[show portrait kit]]\n    Line one.\n    Line two.\nend\n`;
    const { contents, warnings } = await written(source, [svg, lids]);
    const plays = contents.at(-1).morph.plays;
    expect(plays.map((play: any) => [play.morph, play.ref.image, play.picture])).toEqual([["talk", "bunny", undefined]]);
    expect(warnings).toEqual(["`lids_blink` does not play on `kit`: one of its layers plays morphs of its own, and those keep playing."]);
  });

  test("a layer with morphs of its own that is hidden at rest still keeps the picture's own morph off it", async () => {
    const svg = { uri: "inmemory:///bunny.svg", type: "image", name: "bunny", ext: "svg", data: talkingPortrait() } as any;
    const base = { uri: "inmemory:///base_file.png", type: "image", name: "base_file", ext: "png", src: "/src/base_file.png" } as any;
    const source = `${LIDS}\n${talkScript()}\ndefine kit as layered_image with\n  assets = {\n    ["base"] = base_file,\n    ["lids.on"] = bunny,\n  }\nend\n\nscene start\n  HERO:\n    [[show portrait kit]]\n    Line one.\n    Line two.\nend\n`;
    const { contents, warnings } = await written(source, [svg, base], "kit");
    expect(contents.flatMap((content: any) => content.morph?.plays ?? []).filter((play: any) => play.picture)).toEqual([]);
    expect(warnings).toEqual(["`lids_blink` does not play on `kit`: one of its layers plays morphs of its own, and those keep playing."]);
  });

  test("a picture after one whose pick changes its layer count gets its play at its own CSS layer", async () => {
    const files = [
      { uri: `${P}/cy.png`, type: "image", name: "cy", ext: "png", src: "/src/cy.png" },
      { uri: `${P}/cy mouth.on.png`, type: "image", name: "cy mouth.on", ext: "png", src: "/src/cy mouth.on.png" },
      { uri: "inmemory:///kit_base.png", type: "image", name: "kit_base", ext: "png", src: "/src/kit_base.png" },
      { uri: "inmemory:///kit_lids.png", type: "image", name: "kit_lids", ext: "png", src: "/src/kit_lids.png" },
    ] as any[];
    const chatter = `morph chatter {\n  blend = cut\n  keyframes {\n    from {\n      mouth {\n        state = off\n      }\n    }\n    to {\n      mouth {\n        state = on\n      }\n    }\n  }\n  timing {\n    trigger = speech\n  }\n}\n`;
    const source = `${LIDS}\n${chatter}\ndefine kit as layered_image with\n  assets = {\n    ["base"] = kit_base,\n    ["lids.on"] = kit_lids,\n  }\nend\n\nscene start\n  HERO:\n    [[show portrait kit]]\n    Line one.\nend\n`;
    const harness = createHarness(source, 0, { assets: files });
    await harness.ready;
    await harness.preview(source.split("\n").findIndex((line) => line.includes("Line one.")));
    const ui = (harness.game as any).module.ui;
    const pick = (asset: string) => (asset === "cy" ? "none" : undefined);
    expect(ui.getBackgroundImageFromString("cy").split("url(").length - 1).toBe(2);
    expect(ui.getBackgroundImageFromString("cy", undefined, "none").split("url(").length - 1).toBe(1);
    const content = ui.getMorphContent(["cy", "kit"], pick);
    expect(content.plays.map((play: any) => [play.morph, play.layer, play.picture?.span])).toEqual([["lids_blink", 1, 1]]);
  });
});
