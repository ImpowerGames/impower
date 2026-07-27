// Compositing a layered preview (#292) needs the layers flattened in the same
// order the game paints them. `UIModule.createImage` REVERSES the asset list
// before joining it into CSS `background-image` (whose first entry paints on
// top), so `assets[0]` is the BOTTOM layer. A compositor drawing in array order
// therefore matches the running game; drawing reversed would silently invert
// every layered image.

import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { File } from "../../compiler/types/File";
import { resolveImageLayerSrcs } from "../../compiler/utils/resolveImageLayerSrcs";

const MAIN_URI = "file://proj/main.sd";

const assetFile = (uri: string, text?: string): File => {
  const base = uri.split("/").slice(-1)[0]!;
  const dot = base.lastIndexOf(".");
  return {
    uri,
    type: "image",
    name: dot >= 0 ? base.slice(0, dot) : base,
    ext: dot >= 0 ? base.slice(dot + 1) : "",
    src: `/file:/local/assets/${base}?v=1`,
    text,
  };
};

const compile = (text: string, assets: File[]) => {
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
      ...assets,
    ],
  });
  return compiler.compile({ textDocument: { uri: MAIN_URI } }).program;
};

const layersOf = (program: any, type: string, name: string) =>
  resolveImageLayerSrcs(program.context, program.context?.[type]?.[name]);

describe("resolveImageLayerSrcs", () => {
  it("returns layers bottom-first, matching the order the game paints", () => {
    const program = compile(
      `define bg as layered_image with
  assets = {
    bg__base,
    bg__prop,
    bg__light,
  }
end
`,
      [
        assetFile("file://proj/a/bg__base.png"),
        assetFile("file://proj/a/bg__prop.png"),
        assetFile("file://proj/a/bg__light.png"),
      ],
    );
    expect(layersOf(program, "layered_image", "bg")).toEqual([
      "/file:/local/assets/bg__base.png?v=1",
      "/file:/local/assets/bg__prop.png?v=1",
      "/file:/local/assets/bg__light.png?v=1",
    ]);
  });

  it("flattens a keyed assets table in declaration order", () => {
    const program = compile(
      `define bg as layered_image with
  assets = {
    base = bg__base,
    prop = bg__prop,
  }
end
`,
      [
        assetFile("file://proj/a/bg__base.png"),
        assetFile("file://proj/a/bg__prop.png"),
      ],
    );
    expect(layersOf(program, "layered_image", "bg")).toEqual([
      "/file:/local/assets/bg__base.png?v=1",
      "/file:/local/assets/bg__prop.png?v=1",
    ]);
  });

  it("returns a single entry for a plain image (nothing to composite)", () => {
    const program = compile("", [assetFile("file://proj/a/photo.png")]);
    expect(layersOf(program, "image", "photo")).toEqual([
      "/file:/local/assets/photo.png?v=1",
    ]);
  });

  it("treats a filtered svg as one already-flattened source", () => {
    const program = compile("", [
      assetFile(
        "file://proj/a/portrait.svg",
        `<svg xmlns="http://www.w3.org/2000/svg"><circle cx="1" cy="1" r="1"/></svg>`,
      ),
    ]);
    const layers = layersOf(program, "filtered_image", "portrait");
    expect(layers).toHaveLength(1);
    expect(layers[0]).toMatch(/^data:image\/svg\+xml,/);
  });

  it("descends through a filtered_image onto its layered root", () => {
    const program = compile(
      `define bg as layered_image with
  assets = {
    bg__base,
    bg__prop,
  }
end

define bg_dim as filtered_image with
  image = bg
end
`,
      [
        assetFile("file://proj/a/bg__base.png"),
        assetFile("file://proj/a/bg__prop.png"),
      ],
    );
    expect(layersOf(program, "filtered_image", "bg_dim")).toEqual([
      "/file:/local/assets/bg__base.png?v=1",
      "/file:/local/assets/bg__prop.png?v=1",
    ]);
  });

  it("keeps a layer that reuses an asset an earlier layer already used", () => {
    // The cycle guard must be per-path, not global, or the repeat vanishes.
    const program = compile(
      `define bg as layered_image with
  assets = {
    bg__base,
    bg__prop,
    bg__base,
  }
end
`,
      [
        assetFile("file://proj/a/bg__base.png"),
        assetFile("file://proj/a/bg__prop.png"),
      ],
    );
    expect(layersOf(program, "layered_image", "bg")).toHaveLength(3);
  });

  it("skips layers that do not resolve", () => {
    const program = compile(
      `define bg as layered_image with
  assets = {
    bg__missing,
    bg__real,
  }
end
`,
      [assetFile("file://proj/a/bg__real.png")],
    );
    expect(layersOf(program, "layered_image", "bg")).toEqual([
      "/file:/local/assets/bg__real.png?v=1",
    ]);
  });

  it("terminates on a circular chain", () => {
    const program = compile(
      `define loop_a as filtered_image with
  image = loop_b
end

define loop_b as filtered_image with
  image = loop_a
end
`,
      [],
    );
    expect(layersOf(program, "filtered_image", "loop_a")).toEqual([]);
  });
});
