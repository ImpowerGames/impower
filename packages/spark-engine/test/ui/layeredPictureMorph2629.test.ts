import { describe, expect, test } from "vitest";
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

  test("a picked look that shows no layer paints nothing, rather than the unpicked look", async () => {
    const files = [{ uri: "inmemory:///overlay.png", type: "image", name: "overlay", ext: "png", src: "/src/overlay.png" }] as any[];
    const chatter = `morph chatter {\n  blend = cut\n  keyframes {\n    from {\n      lids {\n        state = off\n      }\n    }\n    to {\n      lids {\n        state = on\n      }\n    }\n  }\n  timing {\n    trigger = speech\n  }\n}\n`;
    const source = `${chatter}\ndefine kit as layered_image with\n  assets = {\n    ["lids.on"] = overlay,\n  }\nend\n\nscene start\n  HERO:\n    [[show portrait kit]]\n    Line one.\nend\n`;
    const harness = createHarness(source, 0, { assets: files });
    await harness.ready;
    await harness.preview(source.split("\n").findIndex((line) => line.includes("Line one.")));
    const ui = (harness.game as any).module.ui;
    expect(ui.getBackgroundImageFromString("kit")).toBe('url("/src/overlay.png")');
    expect(ui.getBackgroundImageFromString("kit", undefined, "none")).toBe("none");
    expect(ui.getBackgroundImageFromString("teal", undefined, "none")).toBe("linear-gradient(teal)");
  });

  test("a hand-written picture whose base file has the picture's own name plays its morph and bakes its layered artwork", async () => {
    const files = [
      { uri: "inmemory:///kit.png", type: "image", name: "kit", ext: "png", src: "/src/kit.png" },
      { uri: "inmemory:///overlay.png", type: "image", name: "overlay", ext: "png", src: "/src/overlay.png" },
    ] as any[];
    const source = `${LIDS}\ndefine kit as layered_image with\n  assets = {\n    ["base"] = kit,\n    ["lids.on"] = overlay,\n  }\nend\n\nscene start\n  HERO:\n    [[show portrait kit]]\n    Line one.\nend\n`;
    const { contents, artifacts, warnings } = await written(source, files, "kit");
    const plays = contents.at(-1).morph.plays;
    expect(plays.map((play: any) => [play.morph, play.ref.image, play.ref.layered, play.picture?.files.map((file: any) => file.src)])).toEqual([
      ["lids_blink", "kit", true, ["/src/kit.png", "/src/overlay.png"]],
    ]);
    const sent = artifacts.filter((params: any) => params.key === plays[0].ref.key);
    expect(sent.map((params: any) => [params.error, params.artifact?.status])).toEqual([[undefined, "live"]]);
    expect(warnings).toEqual([]);
  });

  test("inside one write, two different pick functions for one picture each get their own look", async () => {
    const files = [{ uri: "inmemory:///overlay.png", type: "image", name: "overlay", ext: "png", src: "/src/overlay.png" }] as any[];
    const chatter = `morph chatter {\n  blend = cut\n  keyframes {\n    from {\n      lids {\n        state = off\n      }\n    }\n    to {\n      lids {\n        state = on\n      }\n    }\n  }\n  timing {\n    trigger = speech\n  }\n}\n`;
    const source = `${chatter}\ndefine kit as layered_image with\n  assets = {\n    ["lids.on"] = overlay,\n  }\nend\n\nscene start\n  HERO:\n    [[show portrait kit]]\n    Line one.\nend\n`;
    const harness = createHarness(source, 0, { assets: files });
    await harness.ready;
    await harness.preview(source.split("\n").findIndex((line) => line.includes("Line one.")));
    const ui = (harness.game as any).module.ui;
    const own = () => undefined;
    const none = () => "none";
    const srcs = (pick: unknown) => ui.getImageAssets("", "kit", undefined, pick).map((asset: any) => asset.src);
    const inWrite = ui.withPictureLooks(() => [srcs(own), srcs(none), srcs(own), srcs(none)]);
    expect(inWrite).toEqual([["/src/overlay.png"], [], ["/src/overlay.png"], []]);
    expect(ui.withPictureLooks(() => [srcs(none), srcs(own)])).toEqual([[], ["/src/overlay.png"]]);
  });

  test("a write that throws part-way closes its look cache, so the next write resolves afresh", async () => {
    const files = [{ uri: "inmemory:///overlay.png", type: "image", name: "overlay", ext: "png", src: "/src/overlay.png" }] as any[];
    const source = `define kit as layered_image with\n  assets = {\n    ["lids.on"] = overlay,\n  }\nend\n\nscene start\n  HERO:\n    [[show portrait kit]]\n    Line one.\nend\n`;
    const harness = createHarness(source, 0, { assets: files });
    await harness.ready;
    await harness.preview(source.split("\n").findIndex((line) => line.includes("Line one.")));
    const ui = (harness.game as any).module.ui;
    expect(() =>
      ui.withPictureLooks(() => {
        ui.pictureLook("", "kit");
        throw new Error("part-way");
      }),
    ).toThrow("part-way");
    const first = ui.pictureLook("", "kit");
    expect(ui.pictureLook("", "kit")).not.toBe(first);
    ui.withPictureLooks(() => expect(ui.pictureLook("", "kit")).toBe(ui.pictureLook("", "kit")));
  });

  test("a named image that shows no layer paints none without a pick too, and is still an image, not a video", async () => {
    const files = [
      { uri: "inmemory:///overlay.png", type: "image", name: "overlay", ext: "png", src: "/src/overlay.png" },
      { uri: "inmemory:///base_file.png", type: "image", name: "base_file", ext: "png", src: "/src/base_file.png" },
    ] as any[];
    const source = `define kit as layered_image with\n  assets = {\n    ["lids.on"] = overlay,\n  }\nend\n\nscene start\n  HERO:\n    [[show portrait kit]]\n    Line one.\nend\n`;
    const harness = createHarness(source, 0, { assets: files });
    await harness.ready;
    await harness.preview(source.split("\n").findIndex((line) => line.includes("Line one.")));
    const ui = (harness.game as any).module.ui;
    expect(ui.getImageSrcsByName("kit")).toBeNull();
    expect(ui.getBackgroundImageFromString("kit")).toBe("none");
    expect(ui.getBackgroundImageFromValue({ $name: "kit" })).toBe("none");
    expect(ui.getVideoSrcByName("kit")).toBeUndefined();
    expect(["kit", "base_file"].map((asset) => ui.getBackgroundImageFromString(asset)).reverse().join(", ")).toBe('url("/src/base_file.png"), none');
    expect(ui.getImageUrlsFromBackground(ui.getBackgroundImageFromString("kit"))).toEqual([]);
  });

  test("an overlay-only picture whose morph rests on its overlay shows that overlay through every way the engine paints it", async () => {
    const files = [{ uri: "inmemory:///overlay.png", type: "image", name: "overlay", ext: "png", src: "/src/overlay.png" }] as any[];
    const show = `morph show {\n  blend = cut\n  keyframes {\n    from {\n      lids {\n        state = off\n      }\n    }\n    to {\n      lids {\n        state = on\n      }\n    }\n  }\n}\n`;
    const source = `${show}\ndefine kit as layered_image with\n  assets = {\n    ["lids.on"] = overlay,\n  }\nend\n\nscene start\n  HERO:\n    [[show portrait kit]]\n    Line one.\nend\n`;
    const harness = createHarness(source, 0, { assets: files });
    await harness.ready;
    await harness.preview(source.split("\n").findIndex((line) => line.includes("Line one.")));
    await new Promise((resolve) => setTimeout(resolve, 200));
    const ui = (harness.game as any).module.ui;
    const overlay = 'url("/src/overlay.png")';
    expect(ui.getImageAssets("", "kit").map((asset: any) => asset.src)).toEqual(["/src/overlay.png"]);
    expect(ui.getImageSrcsByName("kit")).toEqual(["/src/overlay.png"]);
    expect(ui.getBackgroundImageFromString("kit")).toBe(overlay);
    expect(ui.getBackgroundImageFromString("kit", undefined, "none")).toBe(overlay);
    const created: any[] = [];
    const createElement = ui.createElement;
    ui.createElement = (_parent: unknown, state: any) => (created.push(state), {});
    ui.createImage(null, ["kit"], "background_image");
    ui.createElement = createElement;
    expect(created.map((state) => [state.type, state.style?.background_image, state.attributes?.src])).toEqual([
      ["span", overlay, undefined],
      ["img", undefined, "/src/overlay.png"],
    ]);
    expect(ui.imagePick({ speaker: "HERO" }, "kit")).toBeUndefined();
    const content = ui.getMorphContent(["kit"], () => undefined);
    expect(content.plays.map((play: any) => [play.morph, play.layer, play.picture])).toEqual([
      ["show", 0, { span: 1, files: [{ src: "/src/overlay.png", name: "overlay.png" }] }],
    ]);
    const writes = flattenMessages(harness.messages).filter(
      (message: any) => message?.method === "ui/write-image" && message.params.target === "portrait" && message.params.instructions[0]?.content,
    );
    const written = writes.at(-1).params.instructions[0].content;
    expect(written.background).toBe(overlay);
    expect(written.morph?.plays.map((play: any) => play.morph)).toEqual(["show"]);
  });

  test("an overlay-only picture of a character listening on another's line rests in its own look, not its speech morph's rest", async () => {
    const files = [{ uri: "inmemory:///overlay.png", type: "image", name: "overlay", ext: "png", src: "/src/overlay.png" }] as any[];
    const chatter = `morph chatter {\n  blend = cut\n  keyframes {\n    from {\n      lids {\n        state = off\n      }\n    }\n    to {\n      lids {\n        state = on\n      }\n    }\n  }\n  timing {\n    trigger = speech\n  }\n}\n`;
    const write = async (speaker: string) => {
      const source = `define ava as character with\n  name = "AVA"\nend\n\n${chatter}\ndefine ava as layered_image with\n  assets = {\n    ["lids.on"] = overlay,\n  }\nend\n\nscene start\n  ${speaker}:\n    [[show portrait ava]]\n    Line one.\nend\n`;
      const harness = createHarness(source, 0, { assets: files });
      await harness.ready;
      await harness.preview(source.split("\n").findIndex((line) => line.includes("Line one.")));
      await new Promise((resolve) => setTimeout(resolve, 100));
      const writes = flattenMessages(harness.messages).filter(
        (message: any) => message?.method === "ui/write-image" && message.params.target === "portrait" && message.params.instructions[0]?.content,
      );
      return writes.at(-1).params.instructions[0].content;
    };
    const listening = await write("BOB");
    expect(listening.background).toBe("none");
    expect(listening.morph).toBeUndefined();
    const speaking = await write("AVA");
    expect(speaking.background).toBe('url("/src/overlay.png")');
    expect(speaking.morph?.plays.map((play: any) => play.morph)).toEqual(["chatter"]);
  });
});
