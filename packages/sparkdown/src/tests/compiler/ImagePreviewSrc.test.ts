// Asset completions/hovers show a thumbnail by resolving the struct down to a
// loadable `<img src>`. Only a plain `image` carries `src` (copied off the
// workspace file by `populateAssets`); `layered_image.assets` and
// `filtered_image.image` hold bare REFERENCES (`{ $type, $name }`, with an
// empty `$type` for a bare name), so reading `.src` straight off one always
// yields undefined and the preview silently disappears (issue #290).

import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { File } from "../../compiler/types/File";
import {
  getImagePreviewMarkup,
  getImagePreviewSrc,
} from "../../compiler/utils/getImagePreviewSrc";

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

const SVG = `<svg xmlns="http://www.w3.org/2000/svg"><circle cx="1" cy="1" r="1"/></svg>`;

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

const previewOf = (program: any, type: string, name: string) =>
  getImagePreviewSrc(program.context, program.context?.[type]?.[name]);

describe("image preview src resolution", () => {
  it("resolves a plain image to its workspace src", () => {
    const program = compile("", [assetFile("file://proj/a/photo.jpg")]);
    expect(previewOf(program, "image", "photo")).toBe(
      "/file:/local/assets/photo.jpg?v=1",
    );
  });

  it("resolves a layered_image through its first layer reference", () => {
    const program = compile(
      `define bg_danbys as layered_image with
  assets = {
    bg_danbys__base,
    bg_danbys__prop,
  }
end
`,
      [
        assetFile("file://proj/a/bg_danbys__base.png"),
        assetFile("file://proj/a/bg_danbys__prop.png"),
      ],
    );
    // Regression guard: `assets[0].src` is undefined — these are references.
    expect(
      program.context?.["layered_image"]?.["bg_danbys"]?.["assets"]?.[0]?.[
        "src"
      ],
    ).toBeUndefined();
    expect(previewOf(program, "layered_image", "bg_danbys")).toBe(
      "/file:/local/assets/bg_danbys__base.png?v=1",
    );
  });

  it("resolves a layered_image whose assets are a keyed table, not an array", () => {
    const program = compile(
      `define bg_shop as layered_image with
  assets = {
    base = bg_shop__base,
    prop = bg_shop__prop,
  }
end
`,
      [
        assetFile("file://proj/a/bg_shop__base.png"),
        assetFile("file://proj/a/bg_shop__prop.png"),
      ],
    );
    expect(previewOf(program, "layered_image", "bg_shop")).toBe(
      "/file:/local/assets/bg_shop__base.png?v=1",
    );
  });

  it("resolves an svg's implicit filtered_image to its filtered source", () => {
    const program = compile("", [
      assetFile("file://proj/a/portrait.svg", SVG),
    ]);
    const src = previewOf(program, "filtered_image", "portrait");
    expect(src).toMatch(/^data:image\/svg\+xml,/);
  });

  it("falls back to the root image when a filtered_image has no filtered_src", () => {
    // A filtered_image over a RASTER layered_image can't produce a filtered
    // svg source, so it must preview the underlying layer instead of nothing.
    const program = compile(
      `define bg_town as layered_image with
  assets = {
    bg_town__base,
  }
end

define bg_town_dim as filtered_image with
  image = bg_town
end
`,
      [assetFile("file://proj/a/bg_town__base.png")],
    );
    expect(
      program.context?.["filtered_image"]?.["bg_town_dim"]?.["filtered_src"],
    ).toBeUndefined();
    expect(previewOf(program, "filtered_image", "bg_town_dim")).toBe(
      "/file:/local/assets/bg_town__base.png?v=1",
    );
  });

  it("skips missing layers instead of giving up on the whole image", () => {
    const program = compile(
      `define bg_partial as layered_image with
  assets = {
    bg_missing_layer,
    bg_partial__real,
  }
end
`,
      [assetFile("file://proj/a/bg_partial__real.png")],
    );
    expect(previewOf(program, "layered_image", "bg_partial")).toBe(
      "/file:/local/assets/bg_partial__real.png?v=1",
    );
  });

  it("terminates on a circular reference chain", () => {
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
    expect(previewOf(program, "filtered_image", "loop_a")).toBeUndefined();
  });

  it("does not chase a non-image struct that shares an image's name", () => {
    const program = compile(
      `define hero as character with
  name = "HERO"
end
`,
      [assetFile("file://proj/a/hero.png")],
    );
    expect(previewOf(program, "character", "hero")).toBeUndefined();
  });

  it("escapes the markup it builds", () => {
    const program = compile("", [assetFile('file://proj/a/we"ird.png')]);
    const markup = getImagePreviewMarkup(
      program.context,
      program.context?.["image"]?.['we"ird'],
    );
    expect(markup).toBe(
      `<img src="/file:/local/assets/we&quot;ird.png?v=1" alt="we&quot;ird" height="180" />`,
    );
  });
});
