// #302: filtering a `layered_image` root must consider EVERY layer. The result
// was built inside the per-asset loop, so each iteration discarded the previous
// one and `filtered_layers` ended up holding at most the last selected layer —
// or nothing at all, when the final layer wasn't selected even though earlier
// ones were.
//
// These compile real `.sd` source rather than hand-building a context: the
// selection runs against the reference shapes the compiler actually emits
// (bare references carry `$type: ""`, and `assets` keys survive verbatim), so
// the test can't drift from the real struct layout.
//
// `filterMatchesName` needs the standalone word `filter` in the name it tests,
// and never selects a name tagged `default`. Positional `assets` entries are
// matched on the layer's `$name`, which is a sparkdown identifier and so can
// never contain a standalone `filter`; the keyed form below is the shape that
// actually reaches the selection. Whether the selected set denotes the layers
// to draw or the layers to drop is a separate question this test takes no
// position on — it pins accumulation only.

import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { File } from "../../compiler/types/File";
import { filterImage } from "../../compiler/utils/filterImage";

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

const selectedLayers = (program: any) => {
  const filteredImage = program.context?.filtered_image?.p;
  filterImage(program.context, filteredImage);
  return (filteredImage.filtered_layers ?? []).map(
    (l: { $name: string }) => l.$name,
  );
};

describe("filterImage over a layered_image root", () => {
  it("accumulates every selected layer, not just the last one", () => {
    const program = compile(
      source(
        {
          "filter hat": "portrait__hat",
          "filter default body": "portrait__body",
          "filter scarf": "portrait__scarf",
        },
        ["hat", "scarf"],
      ),
      ["portrait__hat", "portrait__body", "portrait__scarf"],
    );
    expect(selectedLayers(program)).toEqual([
      "portrait__hat",
      "portrait__scarf",
    ]);
  });

  it("keeps an earlier selection when the final layer is not selected", () => {
    // The overwrite's worst shape: the last iteration replaced a real result
    // with an empty array, reporting that nothing was selected at all.
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
    expect(selectedLayers(program)).toEqual(["portrait__hat"]);
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
    expect(() => selectedLayers(program)).not.toThrow();
    expect(selectedLayers(program)).toEqual([]);
  });

  it("re-derives the same set when called again on the same struct", () => {
    // A layered root never sets `filtered_src`, so the early-out in filterImage
    // never latches and the loop re-runs on every hover, preview and image
    // lookup. Accumulating INTO the existing array would grow it each time.
    const program = compile(
      source(
        {
          "filter hat": "portrait__hat",
          "filter scarf": "portrait__scarf",
        },
        ["hat", "scarf"],
      ),
      ["portrait__hat", "portrait__scarf"],
    );
    expect(selectedLayers(program)).toEqual([
      "portrait__hat",
      "portrait__scarf",
    ]);
    expect(selectedLayers(program)).toEqual([
      "portrait__hat",
      "portrait__scarf",
    ]);
  });
});
