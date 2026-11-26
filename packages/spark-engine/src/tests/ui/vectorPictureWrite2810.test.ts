import { describe, expect, test } from "vitest";
import { createHarness, flattenMessages } from "./harness/uiTestHarness";

const P = "inmemory:///assets/Images";

const file = (path: string, ext = "png") => {
  const leaf = path.slice(path.lastIndexOf("/") + 1);
  return { uri: `${P}/${path}`, type: "image", name: leaf.slice(0, leaf.lastIndexOf(".")), ext, src: `/src/${path}` } as any;
};

const FILES = [file("sky.png"), file("dusk.svg", "svg"), file("logo.svg", "svg")];

const KIT = `define kit as layered_image with
  assets = {
    ["base"] = sky,
    ["mark"] = logo,
  }
end
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

describe("an image write whose picture has vector files carries what the player draws it from (#2810)", () => {
  test("an SVG picture is marked as a vector picture of one layer, with its file and name", async () => {
    const [content] = await written("backdrop dusk");
    expect(content.background).toBe('url("/src/dusk.svg")');
    expect(content.pictures).toEqual([{ layer: 0, span: 1, name: "dusk", vector: true, files: [{ src: "/src/dusk.svg", name: "dusk.svg" }] }]);
  });

  test("a layered picture with an SVG layer is marked as a vector picture with every layer file, bottom first", async () => {
    const [content] = await written("backdrop kit", KIT);
    expect(content.background.split(", ")).toHaveLength(2);
    expect(content.pictures).toHaveLength(1);
    const [picture] = content.pictures;
    expect(picture).toMatchObject({ layer: 0, span: 2, name: "kit", vector: true });
    expect(picture.files.map((f: any) => `url("${f.src}")`)).toEqual(content.background.split(", ").reverse());
    expect(picture.files.map((f: any) => f.name).sort()).toEqual(["logo.svg", "sky.png"]);
  });

  test("a vector picture shown above a bitmap starts at its own layer", async () => {
    const [content] = await written("backdrop sky dusk");
    const layers = content.background.split(", ").reverse();
    expect(layers).toEqual(['url("/src/sky.png")', 'url("/src/dusk.svg")']);
    expect(content.pictures).toEqual([{ layer: 1, span: 1, name: "dusk", vector: true, files: [{ src: "/src/dusk.svg", name: "dusk.svg" }] }]);
  });

  test("a write of a single bitmap image carries no picture to draw", async () => {
    const [content] = await written("backdrop sky");
    expect(content.background).toBe('url("/src/sky.png")');
    expect(content.pictures).toBeUndefined();
  });
});
