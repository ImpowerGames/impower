import { describe, expect, it } from "vitest";
import { buildSVGAttributeVocabulary, parseLayerName, resolveAttributes } from "../../attributes";
import { imageFileNameOf, imageThingsOf } from "../../attributes/imageFileName";
import { rasterLayerOfPath } from "../../attributes/rasterSource";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { filterSVG } from "../../compiler/utils/filterSVG";
import { resolveImageLayers } from "../../compiler/utils/resolveImageLayers";
import { resolveImageReference } from "../../compiler/utils/resolveImageReference";
import { sortFilteredName } from "../../compiler/utils/sortFilteredName";
import { SparkdownWorkspace } from "../../workspace/classes/SparkdownWorkspace";

const workspace = Object.create(SparkdownWorkspace.prototype) as SparkdownWorkspace;
workspace.loadConfiguration({ imageFiles: "**/*.{png,webp,svg}", audioFiles: "**/*.{wav,mp3}" });
const ROOT = "file:///proj";
const MAIN = `${ROOT}/main.sd`;
const P = `${ROOT}/assets/Images/Portraits`;

const compile = (uris: readonly string[], text: string): SparkProgram => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: MAIN, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" },
      ...uris.map((uri) => ({
        uri,
        type: workspace.getFileType(uri),
        name: workspace.getFileName(uri),
        ext: workspace.getFileExtension(uri),
        src: uri,
        version: 1,
      })),
    ] as never,
  });
  return compiler.compile({ textDocument: { uri: MAIN } }).program;
};

const scene = (...lines: string[]) => `scene start\n${lines.map((line) => `  ${line}\n`).join("")}end\n`;

const leaf = (src: string) => decodeURIComponent(src.slice(src.lastIndexOf("/") + 1));

const drawn = (program: SparkProgram, reference: string) =>
  resolveImageLayers(
    program.context,
    resolveImageReference(program.context, { $name: sortFilteredName(reference) }),
  ).map((layer) => leaf(layer.src));

const warnings = (program: SparkProgram) =>
  Object.entries(program.diagnostics ?? {})
    .flatMap(([uri, diagnostics]) =>
      diagnostics.map((d) => ({
        file: leaf(uri),
        message: typeof d.message === "string" ? d.message : d.message.value,
      })),
    )
    .filter(({ message }) => !message.startsWith("Unused"));

const parsed = (name: string) => {
  const { label, conditions, default: isDefault, diagnostics } = parseLayerName(name);
  return { label, conditions, default: isDefault, codes: diagnostics.map((d) => d.code) };
};

describe("a layer name is words separated by spaces (#2572)", () => {
  it("reads an SVG layer's name, conditions and default", () => {
    expect(parsed("hair-top hat.off")).toEqual({
      label: "hair-top", conditions: [{ group: "hat", options: ["off"] }], default: false, codes: [],
    });
    expect(parsed("face.neutral default")).toEqual({
      label: "", conditions: [{ group: "face", options: ["neutral"] }], default: true, codes: [],
    });
    expect(parsed("pupils eyes.open look.camera default")).toEqual({
      label: "pupils",
      conditions: [{ group: "eyes", options: ["open"] }, { group: "look", options: ["camera"] }],
      default: true,
      codes: [],
    });
  });

  it("reads a run of spaces, spaces at the ends and a tab as one separator", () => {
    const expected = parsed("pupils eyes.open default");
    expect(parsed("pupils   eyes.open  default")).toEqual(expected);
    expect(parsed("  pupils eyes.open default  ")).toEqual(expected);
    expect(parsed("pupils\teyes.open\tdefault")).toEqual(expected);
  });

  it("warns for a name holding a space character that is not an ordinary space", () => {
    for (const space of [" ", " ", "　", "​"]) {
      const result = parseLayerName(`hair-top${space}hat.off`);
      expect(result.conditions).toEqual([]);
      expect(result.diagnostics.map((d) => d.code)).toEqual(["invalid-layer-name"]);
      expect(result.diagnostics[0]!.message).toContain("a space character that is not an ordinary space");
    }
  });

  it("reads ':' and '~' as part of one word that is not a valid name, with no conditions", () => {
    for (const name of ["hair-top:hat.off", "hair-top~hat.off", "face.happy:default", "a:b~c"]) {
      const result = parseLayerName(name);
      expect(result.conditions).toEqual([]);
      expect(result.default).toBe(false);
      expect(result.diagnostics.map((d) => d.code)).toEqual(["invalid-layer-name"]);
    }
  });

  it("shows the look an SVG with space-named layers is asked for", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
  <g id="body"/>
  <g id="neutral" data-name="face.neutral default"/>
  <g id="happy" data-name="face.happy"/>
  <g id="pupils-camera" data-name="pupils eyes.open look.camera default"/>
  <g id="pupils-left" data-name="pupils eyes.open look.left"/>
  <g id="hair-top" data-name="hair-top hat.off"/>
  <g id="hat" data-name="hat.on"/>
</svg>`;
    const ids = (attributes: string[]) => {
      const vocabulary = buildSVGAttributeVocabulary(svg);
      const output = filterSVG(svg, resolveAttributes(vocabulary, attributes).selection);
      return [...output.matchAll(/\bid=['"]([^'"]*)['"]/g)].map((m) => m[1]);
    };
    expect(buildSVGAttributeVocabulary(svg).diagnostics).toEqual([]);
    expect(ids([])).toEqual(["body", "neutral", "pupils-camera", "hair-top"]);
    expect(ids(["happy", "look.left", "hat"])).toEqual(["body", "happy", "pupils-left", "hat"]);
  });
});

describe("a layer file in a portrait folder starts with digits and a space (#2572)", () => {
  it("reads 20 hair-top hat.off.png as layer 20 named hair-top hat.off", () => {
    expect(rasterLayerOfPath("/proj/assets/Images/mia/20 hair-top hat.off.png")).toEqual({
      folder: "mia", directory: "/proj/assets/Images/mia", order: 20, name: "hair-top hat.off",
    });
    expect(rasterLayerOfPath("/proj/assets/Images/mia/7 face.happy.png")?.order).toBe(7);
  });

  it("reads 90_body.png as the plain image 90_body, with no warning", () => {
    expect(rasterLayerOfPath("/proj/assets/Images/mia/90_body.png")).toBeUndefined();
    const program = compile([`${P}/mia/90_body.png`], scene());
    expect(workspace.getFileName(`${P}/mia/90_body.png`)).toBe("90_body");
    expect(Object.keys(program.context?.["image"] ?? {})).toContain("90_body");
    expect(Object.keys(program.context?.["layered_image"] ?? {})).not.toContain("mia");
    expect(warnings(program)).toEqual([]);
  });

  it("gives 90_body.png beside numbered layers the same omitted-file warning as any plain image, and keeps it the plain image 90_body", () => {
    const files = [`${P}/mia/90 body.png`, `${P}/mia/90_body.png`, `${P}/mia/face.png`];
    const program = compile(files, scene());
    expect(Object.keys(program.context?.["image"] ?? {})).toContain("90_body");
    const omitted = warnings(program).filter(({ message }) => message.includes("is omitted from automatic portrait"));
    expect(omitted.map(({ file }) => file).sort()).toEqual(["90_body.png", "face.png"]);
    expect(omitted.find(({ file }) => file === "90_body.png")!.message).toBe(
      omitted.find(({ file }) => file === "face.png")!.message.replaceAll("face.png", "90_body.png"),
    );
  });

  it("composes a folder of space-named files into the look a line asks for", () => {
    const files = [
      `${P}/mia/90 body.png`,
      `${P}/mia/60 face.neutral default.png`,
      `${P}/mia/60 face.happy.png`,
      `${P}/mia/20 hair-top hat.off.png`,
      `${P}/mia/10 hat.on.png`,
      `${P}/mia/7 face.happy.png`,
    ].map((uri) => uri.replaceAll(" ", "%20"));
    const program = compile(files, scene("[[mia]]", "[[mia:happy:hat]]"));
    expect(warnings(program)).toEqual([]);
    expect(drawn(program, "mia")).toEqual(["90 body.png", "60 face.neutral default.png", "20 hair-top hat.off.png"]);
    expect(drawn(program, "mia:happy:hat")).toEqual(["90 body.png", "60 face.happy.png", "10 hat.on.png", "7 face.happy.png"]);
  });
});

describe("a layer file beside a picture puts a space after the picture's name (#2572)", () => {
  const AVA = [
    `${P}/ava.png`,
    `${P}/ava@night.png`,
    `${P}/ava 30 face.happy.png`,
    `${P}/ava 30 face.sad.png`,
    `${P}/ava 20 mouth.closed default.png`,
    `${P}/ava 20 mouth.open.png`,
    `${P}/ava@night face.happy.png`,
  ];

  it("reads the picture, the stacking number and the layer", () => {
    expect(imageFileNameOf(`${P}/ava face.happy.png`)).toEqual({ name: "ava", picture: "ava", alternate: null, layer: "face.happy" });
    expect(imageFileNameOf(`${P}/ava 20 mouth.closed default.png`)).toEqual({
      name: "ava", picture: "ava", alternate: null, layer: "mouth.closed default", order: 20,
    });
    expect(imageFileNameOf(`${P}/ava@night face.happy.png`)).toEqual({
      name: "ava@night", picture: "ava@night", alternate: "night", layer: "face.happy",
    });
  });

  it("reads the same picture and layer whether the URI writes its space as %20 or as a space", () => {
    const spaced = imageThingsOf([`${P}/ava.png`, `${P}/ava 20 mouth.closed default.png`]);
    const encoded = imageThingsOf([`${P}/ava.png`, `${P}/ava%2020%20mouth.closed%20default.png`]);
    const shape = (things: typeof spaced) =>
      things.map((thing) => ({
        name: thing.name,
        pictures: thing.pictures.map((picture) => ({
          name: picture.name,
          layers: picture.layers.map(({ layer, order }) => ({ layer, order })),
        })),
      }));
    expect(shape(encoded)).toEqual(shape(spaced));
    expect(shape(spaced)).toEqual([
      { name: "ava", pictures: [{ name: "ava", layers: [{ layer: "mouth.closed default", order: 20 }] }] },
    ]);
    expect(workspace.getFileName(`${P}/ava%2020%20mouth.closed%20default.png`)).toBe("ava");
  });

  it("composes the picture's layers on both hosts and warns for none of them", () => {
    for (const files of [AVA, AVA.map((uri) => uri.replaceAll(" ", "%20"))]) {
      const program = compile(files, scene("[[ava]]", "[[ava:happy]]", "[[ava:sad:mouth.open]]", "[[ava@night:happy]]"));
      expect(warnings(program)).toEqual([]);
      expect(drawn(program, "ava")).toEqual(["ava.png", "ava 20 mouth.closed default.png"]);
      expect(drawn(program, "ava:happy")).toEqual(["ava.png", "ava 30 face.happy.png", "ava 20 mouth.closed default.png"]);
      expect(drawn(program, "ava:sad:mouth.open")).toEqual(["ava.png", "ava 30 face.sad.png", "ava 20 mouth.open.png"]);
      expect(drawn(program, "ava@night:happy")).toEqual(["ava@night.png", "ava@night face.happy.png"]);
    }
  });

  it("explains a no-break space in a layer file's name the same way whether the URI encodes it or not", () => {
    const spaceWarnings = (files: string[]) =>
      warnings(compile(files, scene("[[ava]]", "[[mia]]")))
        .map(({ message }) => message)
        .filter((message) => message.includes("a space character that is not an ordinary space"));
    const literal = [`${P}/ava.png`, `${P}/ava face.neutral default.png`, `${P}/mia/90 body.png`, `${P}/mia/60 face.neutral default.png`];
    const encoded = literal.map((uri) => uri.replaceAll(" ", "%20").replaceAll(" ", "%C2%A0"));
    expect(spaceWarnings(literal)).toHaveLength(2);
    expect(spaceWarnings(encoded)).toEqual(spaceWarnings(literal));
  });

  it("reads ava~face.happy.png as a plain image named by the text before its first dot", () => {
    expect(imageFileNameOf(`${P}/ava~face.happy.png`)).toEqual({ name: "ava~face", picture: "ava~face.happy", alternate: null });
    expect(workspace.getFileName(`${P}/ava~face.happy.png`)).toBe("ava~face");
    const [ava] = imageThingsOf([`${P}/ava.png`, `${P}/ava~face.happy.png`]);
    expect(ava!.pictures.map((picture) => [picture.name, picture.layers.length])).toEqual([["ava", 0]]);
  });

  it("reads ava 2.png as stacking number 2 with no layer name, and warns", () => {
    expect(imageFileNameOf(`${P}/ava 2.png`)).toEqual({ name: "ava", picture: "ava", alternate: null, layer: "", order: 2 });
    const program = compile([`${P}/ava.png`, `${P}/ava 2.png`], scene("[[ava]]"));
    expect(warnings(program).map(({ message }) => message)).toEqual([
      'Layer file "ava 2.png" has no name after its stacking number. Name the layer, as in ava blush.png or ava face.happy.png.',
    ]);
  });

  it("reads night sky.png as an always-showing layer sky on the picture night, with no warning", () => {
    expect(imageFileNameOf(`${P}/night sky.png`)).toEqual({ name: "night", picture: "night", alternate: null, layer: "sky" });
    const program = compile([`${P}/night.png`, `${P}/night sky.png`], scene("[[night]]"));
    expect(warnings(program)).toEqual([]);
    expect(drawn(program, "night")).toEqual(["night.png", "night sky.png"]);
  });

  it("spells the space form in its messages", () => {
    const defaults = compile([`${P}/bo.png`, `${P}/bo face.happy default.png`, `${P}/bo face.sad default.png`], scene("[[bo]]"));
    expect(warnings(defaults).map(({ message }) => message)).toContain(
      'Picture "bo" marks more than one default for face: bo face.happy default.png, bo face.sad default.png. Keep default on one of them.',
    );
    const mixed = compile([`${P}/bo.png`, `${P}/bo 10 hat.on.png`, `${P}/bo blush.png`], scene("[[bo]]"));
    expect(warnings(mixed).map(({ message }) => message)).toContain(
      'Picture "bo" mixes numbered and unnumbered layers. bo blush.png has no stacking number, so it stacks below the numbered layers. Number every layer, as in bo 10 blush.png, or none.',
    );
    const omitted = compile([`${P}/mia/90 body.png`, `${P}/mia/blush.png`], scene("[[mia]]"));
    expect(warnings(omitted).map(({ message }) => message)).toContainEqual(expect.stringContaining('Rename it to "NN blush.png"'));
  });
});
