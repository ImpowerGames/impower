// #648: resolving a filtered image is a pure function of its root image and the
// attributes gathered along the chain of named looks, so it is computed once per
// distinct pair. The preview page resolves every displayed and every predicted
// image on every preview update, and the layer-visibility walk visits every
// layer of the vocabulary, which is thousands of nodes for an attribute
// portrait.
//
// What the memo must NOT do is outlive the inputs it was derived from: #340
// removed a latch on the struct because a root redefined from `image` to
// `layered_image` kept serving the old derivation. These pin both halves — the
// work happens once for repeated identical input, and every input that can
// change the answer re-derives it.

import { describe, expect, it, vi } from "vitest";


const counters = vi.hoisted(() => ({ visibility: 0 }));

vi.mock("../../attributes", async () => {
  const actual =
    await vi.importActual<typeof import("../../attributes")>("../../attributes");
  return {
    ...actual,
    evaluateAttributeVisibility: (
      ...args: Parameters<typeof actual.evaluateAttributeVisibility>
    ) => {
      counters.visibility += 1;
      return actual.evaluateAttributeVisibility(...args);
    },
  };
});

const { buildSVGAttributeVocabulary } = await import("../../attributes");
const { filterImage, resolveImageAttributes } = await import(
  "../../compiler/utils/filterImage"
);

const SVG = `<svg xmlns="http://www.w3.org/2000/svg"><g id='hat' data-name='hat.on'><path/></g><g id='body'><path/></g></svg>`;

const imageRootContext = (overrides: Record<string, unknown> = {}) => ({
  image: {
    portrait: {
      $type: "image",
      $name: "portrait",
      ext: "svg",
      src: "/file:/local/assets/portrait.svg?v=1",
      attribute_vocabulary: buildSVGAttributeVocabulary(SVG),
      ...overrides,
    } as any,
  },
  filtered_image: {
    p: {
      $type: "filtered_image",
      $name: "p",
      image: { $type: "image", $name: "portrait" },
      attributes: ["hat.off"],
    } as any,
  },
});

const layeredRootContext = () => ({
  image: {
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
    portrait: {
      $type: "layered_image",
      $name: "portrait",
      assets: {
        "hat.on": { $type: "image", $name: "portrait__hat" },
        body: { $type: "image", $name: "portrait__body" },
      },
    } as any,
  },
  filtered_image: {
    p: {
      $type: "filtered_image",
      $name: "p",
      image: { $type: "layered_image", $name: "portrait" },
      attributes: ["hat.off"],
    } as any,
  },
});

const drawnLayers = (filteredImage: any): string[] =>
  (filteredImage.filtered_layers ?? []).map((l: { $name: string }) => l.$name);

describe("resolving the same filtered image twice", () => {
  it("evaluates layer visibility once", () => {
    const context = layeredRootContext();
    counters.visibility = 0;
    filterImage(context, context.filtered_image.p);
    filterImage(context, context.filtered_image.p);
    filterImage(context, context.filtered_image.p);
    expect(drawnLayers(context.filtered_image.p)).toEqual(["portrait__body"]);
    expect(counters.visibility).toBe(1);
  });

  it("does not walk layer visibility at all for a plain image root", () => {
    // Only the selection reaches the `?attributes=` URL of an `image` root;
    // nothing on the player reads the diagnostics the walk produces.
    const context = imageRootContext();
    counters.visibility = 0;
    filterImage(context, context.filtered_image.p);
    expect(context.filtered_image.p.filtered_src).toMatch(/&attributes=/);
    expect(counters.visibility).toBe(0);
  });
});

describe("re-deriving when an input changes", () => {
  it("re-derives when the root file's signature changes", () => {
    const context = imageRootContext();
    filterImage(context, context.filtered_image.p);
    expect(context.filtered_image.p.filtered_src).toContain("?v=1");
    context.image.portrait.src = "/file:/local/assets/portrait.svg?v=2";
    filterImage(context, context.filtered_image.p);
    expect(context.filtered_image.p.filtered_src).toContain("?v=2");
  });

  it("re-derives when the root's type changes (#340)", () => {
    const context: any = imageRootContext();
    filterImage(context, context.filtered_image.p);
    expect(typeof context.filtered_image.p.filtered_src).toBe("string");

    // The same name redefined as a layered image: no flattened source any
    // more, a list of surviving layers instead.
    const root = context.image.portrait;
    const wasVocabulary = root.attribute_vocabulary;
    const layered = layeredRootContext();
    root.$type = "layered_image";
    root.attribute_vocabulary = undefined;
    root.assets = layered.layered_image.portrait.assets;
    context.image.portrait__hat = layered.image.portrait__hat;
    context.image.portrait__body = layered.image.portrait__body;
    context.filtered_image.p.image = { $type: "image", $name: "portrait" };
    filterImage(context, context.filtered_image.p);
    expect(context.filtered_image.p.filtered_src).toBeUndefined();
    expect(drawnLayers(context.filtered_image.p)).toEqual(["portrait__body"]);

    // And back again.
    root.$type = "image";
    root.attribute_vocabulary = wasVocabulary;
    delete root.assets;
    filterImage(context, context.filtered_image.p);
    expect(context.filtered_image.p.filtered_layers).toBeUndefined();
    expect(typeof context.filtered_image.p.filtered_src).toBe("string");
  });

  it("tells no attributes apart from one empty attribute", () => {
    // A trailing `~`, which is what a half-typed reference looks like, reaches
    // resolution as a list holding one empty string. It earns a warning; an
    // empty list does not, and the two must not share a derivation.
    const context = imageRootContext();
    const look = context.filtered_image.p;
    look.attributes = [];
    expect(resolveImageAttributes(context, look).diagnostics).toEqual([]);
    look.attributes = [""];
    expect(resolveImageAttributes(context, look).diagnostics).toEqual([
      expect.objectContaining({ code: "unknown-attribute", attribute: "" }),
    ]);
    look.attributes = [];
    expect(resolveImageAttributes(context, look).diagnostics).toEqual([]);
  });

  it("re-derives when the root's file extension changes", () => {
    // The extension decides whether the root is filtered as an SVG, so it is
    // one of the fields a derivation is only valid for.
    // A served file whose address carries no extension is filtered as an SVG
    // on the strength of `ext` alone.
    const context = imageRootContext({
      data: undefined,
      src: "/file:/local/assets/portrait?v=1",
    });
    filterImage(context, context.filtered_image.p);
    expect(context.filtered_image.p.filtered_src).toMatch(/&attributes=/);
    context.image.portrait.ext = "png";
    filterImage(context, context.filtered_image.p);
    expect(context.filtered_image.p.filtered_src).toBe(
      "/file:/local/assets/portrait?v=1",
    );
  });

  it("re-derives when a named look's attributes change", () => {
    const context = layeredRootContext();
    counters.visibility = 0;
    filterImage(context, context.filtered_image.p);
    expect(drawnLayers(context.filtered_image.p)).toEqual(["portrait__body"]);
    context.filtered_image.p.attributes = ["hat.on"];
    filterImage(context, context.filtered_image.p);
    expect(drawnLayers(context.filtered_image.p)).toEqual([
      "portrait__hat",
      "portrait__body",
    ]);
    expect(counters.visibility).toBe(2);
  });
});
