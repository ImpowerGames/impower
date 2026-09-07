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
  IMAGE_PREVIEW_HEIGHT,
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
      `<img src="/file:/local/assets/we&quot;ird.png?v=1" alt="we&quot;ird" height="180" style="height:180px" />`,
    );
  });
});

// The thumbnail's height has to survive a host stylesheet that resets images
// to `height: auto`, which the web editor's page does. An HTML `height`
// attribute is a presentational hint and loses to any author rule, so on its
// own it is cancelled; an SVG root that declares only a `viewBox` then has no
// intrinsic size to fall back on and the preview collapses to nothing (#432).
// An inline style outranks author rules, so the markup states the height both
// ways: hosts that strip inline styles read the attribute, hosts that reset
// image heights read the inline style.
describe("image preview markup height", () => {
  // The shape every portrait in the reported project is exported as: an
  // aspect ratio and nothing else. An SVG that declares its own width and
  // height does not reproduce the defect.
  const VIEWBOX_ONLY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 5760 3240"><circle cx="1" cy="1" r="1"/></svg>`;

  const markupFor = (program: any, type: string, name: string) =>
    getImagePreviewMarkup(program.context, program.context?.[type]?.[name]);

  it("states the height inline for a filtered image over a viewBox-only svg", () => {
    const program = compile(
      `define portrait_angry as filtered_image with
  image = portrait
end
`,
      [assetFile("file://proj/a/portrait.svg", VIEWBOX_ONLY_SVG)],
    );
    const markup = markupFor(program, "filtered_image", "portrait_angry");
    expect(markup).toBeDefined();
    expect(markup).toContain(`style="height:${IMAGE_PREVIEW_HEIGHT}px"`);
    expect(markup).toContain(`height="${IMAGE_PREVIEW_HEIGHT}"`);
  });

  it("states the height inline for a raster image too", () => {
    const program = compile("", [assetFile("file://proj/a/backdrop.png")]);
    const markup = markupFor(program, "image", "backdrop");
    expect(markup).toContain(`style="height:${IMAGE_PREVIEW_HEIGHT}px"`);
  });

  it("states the height inline for a layered image", () => {
    const program = compile(
      `define bg as layered_image with
  assets = {
    bg__base,
    bg__prop,
  }
end
`,
      [
        assetFile("file://proj/a/bg__base.png"),
        assetFile("file://proj/a/bg__prop.png"),
      ],
    );
    const markup = markupFor(program, "layered_image", "bg");
    expect(markup).toContain(`style="height:${IMAGE_PREVIEW_HEIGHT}px"`);
  });

  it("asks for the same number in the attribute and the inline style", () => {
    const program = compile("", [assetFile("file://proj/a/backdrop.png")]);
    const markup = markupFor(program, "image", "backdrop")!;
    const attribute = /height="(\d+)"/.exec(markup)?.[1];
    const inline = /style="height:(\d+)px"/.exec(markup)?.[1];
    expect(attribute).toBe(String(IMAGE_PREVIEW_HEIGHT));
    expect(inline).toBe(attribute);
  });

  // Everything above compares the markup against the constant, so all of it
  // would still pass if the constant itself became 0 or NaN -- which renders
  // as the same empty box the ticket is about. Pin the literal once.
  it("asks for a height that draws something", () => {
    expect(IMAGE_PREVIEW_HEIGHT).toBe(180);
    const program = compile("", [assetFile("file://proj/a/backdrop.png")]);
    expect(markupFor(program, "image", "backdrop")).toContain(
      `height="180" style="height:180px"`,
    );
  });
});
