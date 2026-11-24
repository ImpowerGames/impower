import { describe, expect, test } from "vitest";
import { buildAttributeVocabulary } from "../../attributes";
import { bakeMorphArtifact } from "../../morph/bake";
import { layeredMorphArtwork, layeredMorphDrawn, layeredMorphModel } from "../../morph/layered";
import { buildMorphRecipe } from "../../morph/recipe";
import { morphFrameState, morphPosesAt } from "../../morph/render";
import type { MorphArtifact } from "../../morph/types";

const image = (name: string) => ({ $type: "image", $name: name, src: `/${name}.png`, uri: `file:///${name}.png` });

const context = (layered: Record<string, any>) => ({
  image: Object.fromEntries(["base", "closed", "open", "lids", "feather", "lash"].map((name) => [name, image(name)])),
  layered_image: layered,
});

const FOUR = {
  $type: "layered_image",
  $name: "kit",
  assets: {
    base: { $name: "base" },
    "mouth.closed default": { $name: "closed" },
    "mouth.open": { $name: "open" },
    "lids.on": { $name: "lids" },
  },
};

const recipe = (blend: string, group: string, states: string[]) =>
  buildMorphRecipe("m", {
    blend,
    keyframes: states.map((state, index) => ({ offset: index / (states.length - 1), [group]: { state } })),
  } as never);

const bake = (layered: any, blend: string, group: string, states: string[]) => {
  const artwork = layeredMorphArtwork(context({ [layered.$name]: layered }) as never, layered)!;
  return { artwork, artifact: bakeMorphArtifact({ source: artwork.text, selection: {}, recipes: [recipe(blend, group, states)], key: "k" }) };
};

const drawnAt = (artifact: MorphArtifact, offset: number) =>
  layeredMorphDrawn(layeredMorphModel(artifact)!, morphFrameState(artifact, morphPosesAt(artifact, { m: offset })));

describe("the bake reads a picture made of image files as a stack of <image> layers (#2629)", () => {
  test("the artwork has one <image> per layer file in stacking order, named by the layer's words", () => {
    const { artwork } = bake(FOUR, "cut", "lids", ["off", "on", "off"]);
    expect(artwork.files.map((file) => [file.name, file.src])).toEqual([
      ["base", "/base.png"],
      ["mouth.closed default", "/closed.png"],
      ["mouth.open", "/open.png"],
      ["lids.on", "/lids.png"],
    ]);
    expect([...artwork.text.matchAll(/<image data-name="([^"]*)" data-layer="(\d)"/g)].map((m) => [m[1], m[2]])).toEqual([
      ["base", "0"],
      ["mouth.closed default", "1"],
      ["mouth.open", "2"],
      ["lids.on", "3"],
    ]);
    expect(artwork.paths).toEqual({ "/0/0": 0, "/0/1": 1, "/0/2": 2, "/0/3": 3 });
    expect(artwork.uri).toBe("file:///base.png");
  });

  test("a four-layer picture bakes live with no diagnostics, and cut and fade give cut and fade transitions", () => {
    for (const blend of ["cut", "fade"]) {
      const { artifact } = bake(FOUR, blend, "mouth", ["closed", "open", "closed"]);
      expect(artifact.status).toBe("live");
      expect(artifact.diagnostics).toEqual([]);
      const kinds = artifact.segments.flatMap((segment) => segment.transitions.map((t) => t.kind));
      expect(new Set(kinds)).toEqual(new Set([blend]));
    }
  });

  test("under blend = morph a file takes its fallback, with no diagnostics", () => {
    const { artifact } = bake(FOUR, "morph", "mouth", ["closed", "open"]);
    expect(artifact.status).toBe("live");
    expect(artifact.diagnostics).toEqual([]);
    expect(artifact.segments.flatMap((segment) => segment.transitions.map((t) => t.kind))).toEqual(["fade", "fade"]);
    expect(drawnAt(artifact, 0.5)).toEqual([
      { file: 0, opacity: 1 },
      { file: 1, opacity: 0.5 },
      { file: 2, opacity: 0.5 },
    ]);
  });

  test("the layers drawn at each offset follow the morph", () => {
    const { artifact } = bake(FOUR, "cut", "lids", ["off", "on", "off"]);
    const files = (offset: number) => drawnAt(artifact, offset).map((drawn) => drawn.file);
    expect(layeredMorphDrawn(layeredMorphModel(artifact)!).map((drawn) => drawn.file)).toEqual([0, 1]);
    expect(files(0)).toEqual([0, 1]);
    expect(files(0.5)).toEqual([0, 1, 3]);
    expect(files(1)).toEqual([0, 1]);
  });

  test("a layer inside a hidden parent never shows", () => {
    const nested = {
      $type: "layered_image",
      $name: "nest",
      assets: { base: { $name: "base" }, feather: { $name: "feather" }, lash: { $name: "lash" }, lid: { $name: "lids" } },
      attribute_vocabulary: buildAttributeVocabulary([
        { key: "base", name: "base" },
        { key: "hat", name: "hat.on" },
        { key: "feather", name: "feather", parent: "hat" },
        { key: "eyes", name: "lids.on" },
        { key: "lash", name: "lash", parent: "eyes" },
        { key: "lid", name: "lid", parent: "eyes" },
      ]),
    };
    const { artwork, artifact } = bake(nested, "cut", "lids", ["off", "on", "off"]);
    expect(artwork.text).toContain('<g data-name="hat.on"><image data-name="feather"');
    expect(artifact.status).toBe("live");
    const feather = artwork.files.findIndex((file) => file.name === "feather");
    const lash = artwork.files.findIndex((file) => file.name === "lash");
    for (const offset of [0, 0.25, 0.5, 0.75, 1]) {
      expect(drawnAt(artifact, offset).map((drawn) => drawn.file)).not.toContain(feather);
    }
    expect(layeredMorphDrawn(layeredMorphModel(artifact)!).map((drawn) => drawn.file)).not.toContain(lash);
    expect(drawnAt(artifact, 0.25).map((drawn) => drawn.file)).not.toContain(lash);
    expect(drawnAt(artifact, 0.5).map((drawn) => drawn.file)).toContain(lash);
  });

  test("a picture with a layer that is itself several layers has no artwork", () => {
    const outer = { $type: "layered_image", $name: "outer", assets: { base: { $name: "base" }, inner: { $type: "layered_image", $name: "kit" } } };
    expect(layeredMorphArtwork(context({ outer, kit: FOUR }) as never, outer)).toBeUndefined();
  });

  test("the artwork follows a file's source, a replaced file and replaced assets changed in place", () => {
    const ctx = context({ kit: { ...FOUR, assets: { ...FOUR.assets } } }) as any;
    const kit = ctx.layered_image.kit;
    expect(layeredMorphArtwork(ctx, kit)!.files.map((file) => file.src)).toEqual(["/base.png", "/closed.png", "/open.png", "/lids.png"]);
    ctx.image.lids.src = "/lids-2.png";
    expect(layeredMorphArtwork(ctx, kit)!.files.at(-1)!.src).toBe("/lids-2.png");
    ctx.image.lids = { ...ctx.image.lids, src: "/lids-3.png" };
    expect(layeredMorphArtwork(ctx, kit)!.files.at(-1)!.src).toBe("/lids-3.png");
    kit.assets = { base: { $name: "base" }, "lids.on": { $name: "lids" } };
    expect(layeredMorphArtwork(ctx, kit)!.files.map((file) => file.name)).toEqual(["base", "lids.on"]);
  });

  test("the artwork follows the image under a filtered_image layer when that image is replaced", () => {
    const ctx = context({}) as any;
    ctx.filtered_image = { lid_look: { $type: "filtered_image", $name: "lid_look", image: { $name: "lids" }, attributes: [] } };
    ctx.layered_image.kit = { $type: "layered_image", $name: "kit", assets: { base: { $name: "base" }, "lids.on": { $name: "lid_look" } } };
    expect(layeredMorphArtwork(ctx, ctx.layered_image.kit)!.files.at(-1)!.src).toBe("/lids.png");
    ctx.image.lids = { ...ctx.image.lids, src: "/lids-new.png" };
    expect(layeredMorphArtwork(ctx, ctx.layered_image.kit)!.files.at(-1)!.src).toBe("/lids-new.png");
  });
});
