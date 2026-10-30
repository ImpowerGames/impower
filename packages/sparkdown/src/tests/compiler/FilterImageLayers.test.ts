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

const source = (
  layers: Record<string, string>,
  excludes: string[],
) => `define portrait as layered_image with
  assets = {
${Object.entries(layers)
  .map(([key, asset]) => `    ["${key}"] = ${asset},`)
  .join("\n")}
  }
end

define p as filtered_image with
  image = portrait,
  attributes = { ${excludes.map((e) => `"${e}.off"`).join(", ")} }
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
          "hat.on": "portrait__hat",
          "body": "portrait__body",
          "scarf.on": "portrait__scarf",
          "shoes": "portrait__shoes",
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
    expect(drawnLayers(program)).toEqual([
      "portrait__body",
      "portrait__shoes",
    ]);
  });

  it("removes only what the filter names", () => {
    const program = compile(
      source(
        {
          "hat.on": "portrait__hat",
          "body": "portrait__body",
        },
        ["hat"],
      ),
      ["portrait__hat", "portrait__body"],
    );
    expect(drawnLayers(program)).toEqual(["portrait__body"]);
  });

  it("draws every default layer when the filter removes nothing", () => {
    const program = compile(
      `define portrait as layered_image with
  assets = {
    ["hat.on"] = portrait__hat,
    ["body"] = portrait__body,
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
    const program = compile(
      source(
        {
          "hat.on": "portrait__hat",
          "body": "portrait__body",
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
    const program = compile(
      source(
        {
          "hat.on": "portrait__hat",
          "body": "portrait__body",
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

  it("previews default attributes when passed a layered image directly", () => {
    const program = compile(source({ "hat.on": "portrait__hat", body: "portrait__body" }, []), ["portrait__hat", "portrait__body"]);
    expect(getImagePreviewSrc(program.context, program.context?.["layered_image"]?.["portrait"])).toBe("/file:/local/assets/portrait__body.png?v=1");
  });

  it("survives a layered_image that has no assets yet", () => {
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
    expect(drawnLayers(program)).toEqual(["none"]);
  });

  it("survives a HAND-BUILT layered_image with no assets at all", () => {
    const context: any = {
      layered_image: {
        portrait: { $type: "layered_image", $name: "portrait" },
      },
      filtered_image: {
        p: {
          $type: "filtered_image",
          $name: "p",
          image: { $type: "layered_image", $name: "portrait" },
          attributes: [],
        },
      },
    };
    expect(() => filterImage(context, context.filtered_image.p)).not.toThrow();
    expect(context.filtered_image.p.filtered_layers ?? []).toEqual([]);
  });

  it("re-derives the same set when called again on the same struct", () => {
    const program = compile(
      source(
        {
          "hat.on": "portrait__hat",
          "body": "portrait__body",
        },
        ["hat"],
      ),
      ["portrait__hat", "portrait__body"],
    );
    expect(drawnLayers(program)).toEqual(["portrait__body"]);
    expect(drawnLayers(program)).toEqual(["portrait__body"]);
  });
});
