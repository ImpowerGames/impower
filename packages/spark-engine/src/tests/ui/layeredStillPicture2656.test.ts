import { describe, expect, test } from "vitest";
import { createHarness, flattenMessages } from "./harness/uiTestHarness";

const P = "inmemory:///assets/Images";

const file = (path: string, ext = "png") => {
  const leaf = path.slice(path.lastIndexOf("/") + 1);
  return { uri: `${P}/${path}`, type: "image", name: leaf.slice(0, leaf.lastIndexOf(".")), ext, src: `/src/${path}` } as any;
};

const FILES = [
  file("ava.png"),
  file("ava mouth.closed default.png"),
  file("ava mouth.open.png"),
  file("office.png"),
  file("office desk.png"),
  file("office lamp.png"),
  file("sky.png"),
  file("logo.svg", "svg"),
];

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

async function written(show: string, prelude = "") {
  const source = `${prelude}\nscene start\n  HERO:\n    [[show ${show}]]\n    Line one.\nend\n`;
  const harness = createHarness(source, 0, { assets: FILES });
  await harness.ready;
  await harness.preview(source.split("\n").findIndex((line) => line.includes("Line one.")));
  await new Promise((resolve) => setTimeout(resolve, 200));
  const writes = flattenMessages(harness.messages).filter(
    (message: any) => message?.method === "ui/write-image" && message.params.instructions[0]?.content,
  );
  return writes.map((write: any) => write.params.instructions[0].content);
}

describe("an image write of a layered picture made of image files (#2656)", () => {
  test("carries the picture's layer files in stacking order, bottom first", async () => {
    const [content] = await written("portrait ava");
    expect(content.background).toBe('url("/src/ava mouth.closed default.png"), url("/src/ava.png")');
    expect(content.pictures).toEqual([
      {
        layer: 0,
        span: 2,
        files: [
          { src: "/src/ava.png", name: "ava.png" },
          { src: "/src/ava mouth.closed default.png", name: "ava mouth.closed default.png" },
        ],
      },
    ]);
  });

  test("gives a layered picture shown above another image the layer index it starts at", async () => {
    const [content] = await written("backdrop sky office");
    const layers = content.background.split(", ").reverse();
    expect(layers[0]).toBe('url("/src/sky.png")');
    expect(content.pictures).toHaveLength(1);
    const [picture] = content.pictures;
    expect(picture.layer).toBe(1);
    expect(picture.span).toBe(layers.length - 1);
    expect(picture.files.map((f: any) => `url("${f.src}")`)).toEqual(layers.slice(1));
    expect(picture.files[0]).toEqual({ src: "/src/office.png", name: "office.png" });
  });

  test("carries the layer files of a picture a morph plays on too", async () => {
    const [content] = await written("portrait ava", FLAP);
    expect(content.morph?.plays?.length).toBeGreaterThan(0);
    expect(content.pictures).toEqual([
      {
        layer: 0,
        span: 2,
        files: [
          { src: "/src/ava.png", name: "ava.png" },
          { src: "/src/ava mouth.closed default.png", name: "ava mouth.closed default.png" },
        ],
      },
    ]);
  });

  test("does not mark a single image", async () => {
    const [content] = await written("backdrop sky");
    expect(content.background).toBe('url("/src/sky.png")');
    expect(content.pictures).toBeUndefined();
  });

  test("does not mark an SVG", async () => {
    const [content] = await written("backdrop logo");
    expect(content.pictures).toBeUndefined();
  });

  test("does not mark a layered picture with an SVG layer", async () => {
    const prelude = `define kit as layered_image with\n  assets = {\n    ["base"] = sky,\n    ["mark"] = logo,\n  }\nend\n`;
    const [content] = await written("backdrop kit", prelude);
    expect(content.background.split(", ")).toHaveLength(2);
    expect(content.pictures).toBeUndefined();
  });

  test("asks the asset loader to load a layered picture's files as layer files, and a single image's file as a plain image", async () => {
    const source = `scene start\n  HERO:\n    Line one.\nend\n`;
    const harness = createHarness(source, 0, { assets: FILES });
    await harness.ready;
    const assets = (harness.game as any).module.assets;
    expect(assets.resolveImageItems(["ava"])).toEqual([
      { kind: "image", src: "/src/ava.png", layer: true },
      { kind: "image", src: "/src/ava mouth.closed default.png", layer: true },
    ]);
    expect(assets.resolveImageItems(["sky", "logo"])).toEqual([
      { kind: "image", src: "/src/sky.png" },
      { kind: "image", src: "/src/logo.svg" },
    ]);
  });

  test("marks a file as a layer file when one picture shows it alone and another as one of its layers", async () => {
    const kit = ["define kit as layered_image with", "  assets = {", '    ["base"] = sky,', '    ["top"] = prop,', "  }", "end"];
    const source = [...kit, "", "scene start", "  HERO:", "    Line one.", "end", ""].join("\n");
    const harness = createHarness(source, 0, { assets: [...FILES, file("prop.png")] });
    await harness.ready;
    const assets = (harness.game as any).module.assets;
    expect(assets.resolveImageItems(["sky", "kit"])).toEqual([
      { kind: "image", src: "/src/sky.png", layer: true },
      { kind: "image", src: "/src/prop.png", layer: true },
    ]);
  });

  test("marks a hand-written layered_image of image files", async () => {
    const prelude = `define kit as layered_image with\n  assets = {\n    ["base"] = sky,\n    ["top"] = office,\n  }\nend\n`;
    const [content] = await written("backdrop kit", prelude);
    expect(content.pictures?.[0]).toMatchObject({ layer: 0, span: content.background.split(", ").length });
    expect(content.pictures[0].files[0]).toEqual({ src: "/src/sky.png", name: "sky.png" });
  });
});
