import { expect, it } from "vitest";
import { createRasterImageDefinitions, isRasterLayerFile } from "../../attributes/rasterSource";

const file = (path: string) => {
  const name = path.split("/").pop()!;
  return { uri: `file:///project/${path}`, type: "image" as const, name: name.replace(/\.[^.]+$/, ""), ext: "png", src: `/${name}` };
};

it("stacks numbered layers under an assets folder in either spelling", () => {
  for (const home of ["assets", "Assets", "ASSETS"]) {
    const files = [file(`${home}/Images/mia/10_body.png`), file(`${home}/Images/mia/20_face.png`)];
    expect(files.every(isRasterLayerFile)).toBe(true);
    expect(Object.keys(createRasterImageDefinitions(files).layeredImages)).toEqual(["mia"]);
  }
});

it("does not treat the assets folder itself, in any spelling, as a layered image", () => {
  for (const home of ["assets", "Assets"]) {
    expect(isRasterLayerFile(file(`${home}/10_body.png`))).toBe(false);
  }
  expect(isRasterLayerFile(file("art/mia/10_body.png"))).toBe(false);
});
