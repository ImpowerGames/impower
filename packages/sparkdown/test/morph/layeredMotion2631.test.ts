import { describe, expect, test } from "vitest";
import { bakeMorphArtifact } from "../../src/morph/bake";
import { layeredMorphArtwork, layeredMorphDrawn, layeredMorphModel } from "../../src/morph/layered";
import { buildMorphRecipe } from "../../src/morph/recipe";
import { morphFrameState, morphPosesAt } from "../../src/morph/render";
import type { MorphArtifact } from "../../src/morph/types";

const image = (name: string) => ({ $type: "image", $name: name, src: `/${name}.png`, uri: `file:///${name}.png` });

const KIT = {
  $type: "layered_image",
  $name: "kit",
  assets: {
    base: { $name: "base" },
    brows: { $name: "brows" },
    "lids.on": { $name: "lids" },
  },
};

const CONTEXT = {
  image: Object.fromEntries(["base", "brows", "lids"].map((name) => [name, image(name)])),
  layered_image: { kit: KIT },
};

const bake = (morph: Record<string, unknown>) => {
  const artwork = layeredMorphArtwork(CONTEXT as never, KIT)!;
  return bakeMorphArtifact({ source: artwork.text, selection: {}, recipes: [buildMorphRecipe("m", morph as never)], key: "k" });
};

const drawnAt = (artifact: MorphArtifact, offset: number) =>
  layeredMorphDrawn(layeredMorphModel(artifact)!, morphFrameState(artifact, morphPosesAt(artifact, { m: offset })));

const BLINK = (moved: Record<string, unknown>) => ({
  blend: "cut",
  keyframes: [
    { offset: 0, lids: { state: "off" } },
    { offset: 0.5, lids: { state: "on" }, ...moved },
    { offset: 1, lids: { state: "off" } },
  ],
});

describe("a morph moves and fades the layers of a picture made of image files (#2631)", () => {
  test("a moved label gets a movement wrapper around its layer file, and is drawn with that label", () => {
    const artifact = bake(BLINK({ brows: { translate: "0 8px" } }));
    expect(artifact.status).toBe("live");
    expect(artifact.diagnostics).toEqual([]);
    const live = artifact.parts.filter((part) => part.kind === "live").map((part) => part.svg).join("");
    expect(live).toMatch(/<g data-morph-motion=['"]brows['"][^>]*><image[^>]*data-name=['"]brows['"]/);
    expect(drawnAt(artifact, 0.5)).toEqual([
      { file: 0, opacity: 1, motions: [] },
      { file: 1, opacity: 1, motions: [{ label: "brows", wrapper: 0 }] },
      { file: 2, opacity: 1, motions: [] },
    ]);
  });

  test("a label no layer of the picture has moves nothing and reports nothing", () => {
    const artifact = bake(BLINK({ nose: { translate: "0 8px" } }));
    expect(artifact.status).toBe("live");
    expect(artifact.diagnostics).toEqual([]);
    expect(artifact.parts.map((part) => part.svg).join("")).not.toContain("data-morph-motion");
    expect(drawnAt(artifact, 0.5).every(({ motions }) => motions.length === 0)).toBe(true);
  });

  test("a `paints` entry's opacity fades its image-file layer at its pose, and its fill and stroke do nothing", () => {
    const artifact = bake({
      ...BLINK({}),
      paints: [{ targets: ["brows"], state: "lids.on", opacity: 0.25, fill: "#f00", stroke: "#0f0" }],
    });
    expect(artifact.status).toBe("live");
    expect(drawnAt(artifact, 0)).toContainEqual({ file: 1, opacity: 1, motions: [] });
    expect(drawnAt(artifact, 0.5)).toContainEqual({ file: 1, opacity: 0.25, motions: [] });
    const brows = layeredMorphModel(artifact)!.chains.find(({ file }) => file === 1)!.chain.at(-1)!;
    expect(brows.tagName).toBe("image");
  });
});
