// The preview warms the urls the renderer is about to request. Warming must
// never be able to decide what the game renders: the engine resolves a
// filtered image through its own runtime channel, and the sweep resolves the
// same names against the compiled structs, so the sweep works on copies and
// writes nothing back. #648 made the expensive part of that resolution a
// memoized pure function of the root image and its attributes, shared by both;
// these pin that the sharing changed neither property.

import { describe, expect, it } from "vitest";
import { resolveImageLayers } from "../../../../sparkdown/src/compiler/utils/resolveImageLayers";
import { resolveImageSrcs } from "./resolveImageSrcs";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg"><g id='hat' data-name='hat.on'><path/></g><g id='body'><path/></g></svg>`;

const context = () => ({
  image: {
    portrait: {
      $type: "image",
      $name: "portrait",
      ext: "svg",
      src: "/file:/local/assets/portrait.svg?v=1",
      data: `data:image/svg+xml,${encodeURIComponent(SVG)}`,
    } as any,
    stripped: {
      $type: "image",
      $name: "stripped",
      ext: "svg",
      src: "/file:/local/assets/stripped.svg?v=1&content=abc",
    } as any,
    portrait__hat: {
      $type: "image",
      $name: "portrait__hat",
      src: "/file:/local/assets/portrait__hat.png?v=1",
    } as any,
    portrait__body: {
      $type: "image",
      $name: "portrait__body",
      src: "/file:/local/assets/portrait__body.png?v=1",
    } as any,
  },
  layered_image: {
    layers: {
      $type: "layered_image",
      $name: "layers",
      assets: {
        "hat.on": { $type: "image", $name: "portrait__hat" },
        body: { $type: "image", $name: "portrait__body" },
      },
    } as any,
  },
  filtered_image: {
    "stripped~hat.off": {
      $type: "filtered_image",
      $name: "stripped~hat.off",
      image: { $type: "image", $name: "stripped" },
      attributes: ["hat.off"],
    } as any,
    "portrait~hat.off": {
      $type: "filtered_image",
      $name: "portrait~hat.off",
      image: { $type: "image", $name: "portrait" },
      attributes: ["hat.off"],
    } as any,
    "layers~hat.off": {
      $type: "filtered_image",
      $name: "layers~hat.off",
      image: { $type: "layered_image", $name: "layers" },
      attributes: ["hat.off"],
    } as any,
  },
});

/** Every key of every struct the program holds, so an added one is visible. */
const shape = (ctx: any) =>
  Object.entries(ctx).flatMap(([type, structs]: [string, any]) =>
    Object.entries(structs).map(
      ([name, struct]: [string, any]) =>
        `${type}.${name}: ${Object.keys(struct).sort().join(",")}`,
    ),
  );

/** How the game resolves a displayed name: the program's own structs. */
const gameSrcs = (ctx: any, name: string) =>
  resolveImageLayers(ctx, ctx.filtered_image?.[name] ?? ctx.image?.[name]).map(
    (layer) => layer.src,
  );

describe("warming the urls the renderer will request", () => {
  it("writes nothing onto the program's structs", () => {
    const ctx = context();
    const before = shape(ctx);
    resolveImageSrcs(ctx, [
      "stripped~hat.off",
      "layers~hat.off",
      "layers",
      "portrait",
    ]);
    expect(shape(ctx)).toEqual(before);
  });

  it("resolves the same urls the game resolves for the same name", () => {
    const warm = context();
    const game = context();
    for (const name of ["stripped~hat.off", "layers~hat.off"]) {
      expect(resolveImageSrcs(warm, [name])).toEqual(gameSrcs(game, name));
    }
  });

  it("agrees with the game when both resolve through the same structs", () => {
    // On the page they do: the warm-up and the renderer read one context, so
    // one holds the derivation the other reuses.
    const ctx = context();
    for (const name of ["stripped~hat.off", "layers~hat.off"]) {
      const warmFirst = resolveImageSrcs(ctx, [name]);
      expect(warmFirst).toEqual(gameSrcs(ctx, name));
      expect(resolveImageSrcs(ctx, [name])).toEqual(warmFirst);
    }
  });

  it("still skips a look whose root keeps its source inlined", () => {
    // Nothing fetches a `data:` uri, and building one means rewriting the
    // whole SVG, so those are skipped without paying for it.
    const ctx = context();
    expect(resolveImageSrcs(ctx, ["portrait~hat.off"])).toEqual([]);
  });
});
