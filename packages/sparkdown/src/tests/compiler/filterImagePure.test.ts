import { describe, expect, it } from "vitest";
import { buildSVGAttributeVocabulary } from "../../attributes";
import { filterImage } from "../../compiler/utils/filterImage";
import { getImagePreviewSrc } from "../../compiler/utils/getImagePreviewSrc";
import { resolveImageLayers } from "../../compiler/utils/resolveImageLayers";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg"><g id='hat' data-name='hat.on'><path/></g><g id='body'><path/></g></svg>`;

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

const svgContext = () =>
  deepFreeze({
    image: {
      portrait: {
        $type: "image",
        $name: "portrait",
        ext: "svg",
        src: "/file:/local/assets/portrait.svg?v=1",
        attribute_vocabulary: buildSVGAttributeVocabulary(SVG),
      },
    },
    filtered_image: {
      p: {
        $type: "filtered_image",
        $name: "p",
        image: { $type: "image", $name: "portrait" },
        attributes: ["hat.off"],
      },
    },
  } as any);

const layeredContext = () =>
  deepFreeze({
    image: {
      portrait__hat: {
        $type: "image",
        $name: "portrait__hat",
        src: "/file:/local/assets/portrait__hat.png?v=1",
      },
      portrait__body: {
        $type: "image",
        $name: "portrait__body",
        src: "/file:/local/assets/portrait__body.png?v=1",
      },
    },
    layered_image: {
      portrait: {
        $type: "layered_image",
        $name: "portrait",
        assets: {
          "hat.on": { $type: "image", $name: "portrait__hat" },
          body: { $type: "image", $name: "portrait__body" },
        },
      },
    },
    filtered_image: {
      p: {
        $type: "filtered_image",
        $name: "p",
        image: { $type: "layered_image", $name: "portrait" },
        attributes: ["hat.off"],
      },
    },
  } as any);

describe("filterImage on a frozen struct", () => {
  it("filters an svg look without touching its argument", () => {
    const context = svgContext();
    const look = context.filtered_image.p;
    const result = filterImage(context, look);
    expect(result.src).toMatch(/&attributes=/);
    expect(result.layers).toBeUndefined();
    expect(Object.keys(look)).toEqual(["$type", "$name", "image", "attributes"]);
    expect(resolveImageLayers(context, look)).toEqual([
      { src: result.src, struct: look },
    ]);
    expect(getImagePreviewSrc(context, look)).toBe(result.src);
  });

  it("filters a layered look without touching its argument", () => {
    const context = layeredContext();
    const look = context.filtered_image.p;
    const result = filterImage(context, look);
    expect(result.src).toBeUndefined();
    expect(result.layers).toEqual([{ $type: "image", $name: "portrait__body" }]);
    expect(Object.keys(look)).toEqual(["$type", "$name", "image", "attributes"]);
    expect(resolveImageLayers(context, look).map((layer) => layer.src)).toEqual([
      "/file:/local/assets/portrait__body.png?v=1",
    ]);
    expect(getImagePreviewSrc(context, look)).toBe(
      "/file:/local/assets/portrait__body.png?v=1",
    );
  });

  it("returns a fresh layers array on every call", () => {
    const context = layeredContext();
    const first = filterImage(context, context.filtered_image.p);
    const second = filterImage(context, context.filtered_image.p);
    expect(second.layers).toEqual(first.layers);
    expect(second.layers).not.toBe(first.layers);
  });
});
