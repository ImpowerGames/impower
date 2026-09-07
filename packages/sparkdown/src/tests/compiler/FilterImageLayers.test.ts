// #302: filtering a `layered_image` root must consider EVERY layer. The result
// was built inside the per-asset loop, so each iteration discarded the previous
// one and `filtered_layers` ended up holding at most one layer — or none at
// all, when the final layer didn't decide it.
//
// `filtered_layers` is the set of layers to DRAW (`UIModule.getImageAssets`
// renders it), and `filterMatchesName` selects what gets filtered OUT — the
// same predicate `filterSVG` uses to delete nodes. So a layer survives when the
// predicate says false. Verified through both tables:
//   excludes ["hat"]        -> "filter hat" true,       "filter default body" false
//   includes ["look_left"]  -> "filter look_right" true, "filter look_left"   false
// i.e. true marks the layer the author is filtering away, in both directions.
//
// These compile real `.sd` source rather than hand-building a context, so the
// selection runs against the reference shapes the compiler actually emits
// (bare references carry `$type: ""`, and `assets` keys survive verbatim).
// Positional entries are matched on the layer's `$name`, which is a sparkdown
// identifier and so can never contain a standalone `filter`; the keyed form is
// the shape that reaches the selection.

import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { File } from "../../compiler/types/File";
import { filterImage } from "../../compiler/utils/filterImage";
import { getImagePreviewSrc } from "../../compiler/utils/getImagePreviewSrc";
import { resolveImageLayers } from "../../compiler/utils/resolveImageLayers";

const MAIN_URI = "file://proj/main.sd";

const assetFile = (name: string): File => ({
  uri: `file://proj/assets/${name}.png`,
  type: "image",
  name,
  ext: "png",
  src: `/file:/local/assets/${name}.png?v=1`,
});

const compile = (text: string, assets: string[]) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: MAIN_URI,
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      },
      ...assets.map(assetFile),
    ],
  });
  return compiler.compile({ textDocument: { uri: MAIN_URI } }).program;
};

/** `.sd` source for a filtered layered image, with `excludes` as authored. */
const source = (
  layers: Record<string, string>,
  excludes: string[],
) => `define hat_filter as filter with
  includes = { "" },
  excludes = { ${excludes.map((e) => `"${e}"`).join(", ")} }
end

define portrait as layered_image with
  assets = {
${Object.entries(layers)
  .map(([key, asset]) => `    ["${key}"] = ${asset},`)
  .join("\n")}
  }
end

define p as filtered_image with
  image = portrait,
  filters = { hat_filter }
end
`;

const drawnLayers = (program: any) => {
  const filteredImage = program.context?.filtered_image?.p;
  filterImage(program.context!, filteredImage);
  return (filteredImage.filtered_layers ?? []).map(
    (l: { $name: string }) => l.$name,
  );
};

describe("filterImage over a layered_image root", () => {
  it("keeps every layer the filter does not remove, not just one", () => {
    const program = compile(
      source(
        {
          "filter hat": "portrait__hat",
          "filter default body": "portrait__body",
          "filter scarf": "portrait__scarf",
          "filter default shoes": "portrait__shoes",
        },
        ["hat", "scarf"],
      ),
      [
        "portrait__hat",
        "portrait__body",
        "portrait__scarf",
        "portrait__shoes",
      ],
    );
    // Two survivors, non-adjacent, spanning the first and last iterations —
    // the shape the per-iteration overwrite could not produce.
    expect(drawnLayers(program)).toEqual([
      "portrait__body",
      "portrait__shoes",
    ]);
  });

  it("removes only what the filter names", () => {
    const program = compile(
      source(
        {
          "filter hat": "portrait__hat",
          "filter default body": "portrait__body",
        },
        ["hat"],
      ),
      ["portrait__hat", "portrait__body"],
    );
    expect(drawnLayers(program)).toEqual(["portrait__body"]);
  });

  it("draws every default layer when the filter removes nothing", () => {
    // A filter-less filtered_image shows exactly the default layers.
    const program = compile(
      `define portrait as layered_image with
  assets = {
    ["filter hat"] = portrait__hat,
    ["filter default body"] = portrait__body,
  }
end

define p as filtered_image with
  image = portrait
end
`,
      ["portrait__hat", "portrait__body"],
    );
    expect(drawnLayers(program)).toEqual(["portrait__body"]);
  });

  it("previews the same layers the game draws", () => {
    // resolveImageLayers feeds hover previews and thumbnails. Descending into
    // the unfiltered root would show the author layers the game drops.
    const program = compile(
      source(
        {
          "filter hat": "portrait__hat",
          "filter default body": "portrait__body",
        },
        ["hat"],
      ),
      ["portrait__hat", "portrait__body"],
    );
    expect(
      resolveImageLayers(
        program.context,
        program.context?.["filtered_image"]?.["p"],
      ).map((l) => l.src),
    ).toEqual(["/file:/local/assets/portrait__body.png?v=1"]);
  });

  it("hovers the surviving layer, not the one the filter removed", () => {
    // getImagePreviewSrc is what hover falls back to whenever fewer than two
    // layers survive -- i.e. the usual case, since a filter normally leaves
    // one variant. Descending into the root would preview the removed layer.
    const program = compile(
      source(
        {
          "filter hat": "portrait__hat",
          "filter default body": "portrait__body",
        },
        ["hat"],
      ),
      ["portrait__hat", "portrait__body"],
    );
    const filteredImage = program.context?.["filtered_image"]?.["p"];
    filterImage(program.context!, filteredImage);
    expect(getImagePreviewSrc(program.context, filteredImage)).toBe(
      "/file:/local/assets/portrait__body.png?v=1",
    );
  });

  it("survives a layered_image that has no assets yet", () => {
    // Reached on every hover and preview, so a half-typed define must not
    // throw `Object.entries(undefined)` out of the compile.
    const program = compile(
      `define portrait as layered_image with
  scale = 1
end

define p as filtered_image with
  image = portrait
end
`,
      [],
    );
    expect(() => drawnLayers(program)).not.toThrow();
    // The `layered_image` type's `$default` declares `assets = { image.none }`,
    // so a define that authors no assets inherits the empty `none` layer —
    // which is what survives filtering here. The point stays the same: the
    // half-typed define must not throw the compile.
    expect(drawnLayers(program)).toEqual(["none"]);
  });

  it("survives a HAND-BUILT layered_image with no assets at all", () => {
    // A compiled define always inherits `assets` from the type's `$default`,
    // so the case above can no longer reach the `assets ?? {}` guard in
    // `filterImage`. The LSP hover/preview paths still hand it partial,
    // hand-built structs mid-keystroke — this pins the guard directly.
    const context: any = {
      layered_image: {
        portrait: { $type: "layered_image", $name: "portrait" },
      },
      filtered_image: {
        p: {
          $type: "filtered_image",
          $name: "p",
          image: { $type: "layered_image", $name: "portrait" },
          filters: [],
        },
      },
    };
    expect(() => filterImage(context, context.filtered_image.p)).not.toThrow();
    expect(context.filtered_image.p.filtered_layers ?? []).toEqual([]);
  });

  it("re-derives the same set when called again on the same struct", () => {
    // A layered root never sets `filtered_src`, so the early-out in filterImage
    // never latches and the loop re-runs on every hover, preview and image
    // lookup. Accumulating INTO the existing array would grow it each time.
    const program = compile(
      source(
        {
          "filter hat": "portrait__hat",
          "filter default body": "portrait__body",
        },
        ["hat"],
      ),
      ["portrait__hat", "portrait__body"],
    );
    expect(drawnLayers(program)).toEqual(["portrait__body"]);
    expect(drawnLayers(program)).toEqual(["portrait__body"]);
  });
});
