import { describe, expect, it } from "vitest";
import { byLayerStacking, imageFileNameOf, imageThingsOf } from "../../attributes/imageFileName";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
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

const leaf = (src: string) => src.slice(src.lastIndexOf("/") + 1);

const drawn = (program: SparkProgram, reference: string) =>
  resolveImageLayers(
    program.context,
    resolveImageReference(program.context, { $name: sortFilteredName(reference) }),
  ).map((layer) => leaf(layer.src));

const messages = (program: SparkProgram) =>
  Object.entries(program.diagnostics ?? {}).flatMap(([uri, diagnostics]) =>
    diagnostics.map((d) => ({
      file: leaf(uri),
      line: d.range.start.line,
      message: typeof d.message === "string" ? d.message : d.message.value,
    })),
  );

const warnings = (program: SparkProgram) => messages(program).filter(({ message }) => !message.startsWith("Unused"));

const collisions = (program: SparkProgram) =>
  messages(program)
    .filter(({ message }) => message.startsWith("Asset name collision"))
    .map(({ file, message }) => `${file}: ${/`([^`]+)`/.exec(message)![1]}`);

const AVA = [
  `${P}/ava.png`,
  `${P}/ava@night.png`,
  `${P}/ava~20_face.happy.png`,
  `${P}/ava~20_face.sad.png`,
  `${P}/ava~30_mouth.closed~default.png`,
  `${P}/ava~30_mouth.open.png`,
  `${P}/ava~10_hat.on.png`,
  `${P}/ava@night~face.happy.png`,
];

const REFERENCES = scene("[[ava]]", "[[ava:happy:hat]]", "[[ava@night:face.happy]]", "[[ava:mouth.open:sad]]");

describe("the one file-name rule for pictures and their layers (#2201)", () => {
  it("reads an order number right after the ~ apart from the layer's name, and only there", () => {
    expect(imageFileNameOf(`${P}/ava~20_face.happy.png`)).toEqual({ name: "ava", picture: "ava", alternate: null, layer: "face.happy", order: 20 });
    expect(imageFileNameOf(`${P}/ava@night~face.happy.png`)).toEqual({ name: "ava@night", picture: "ava@night", alternate: "night", layer: "face.happy" });
    expect(imageFileNameOf(`${P}/ava~blush.png`)).toEqual({ name: "ava", picture: "ava", alternate: null, layer: "blush" });
    expect(imageFileNameOf(`${P}/ava~face_2.happy.png`).layer).toBe("face_2.happy");
    expect(imageFileNameOf(`${P}/ava.v2.png`)).toEqual({ name: "ava", picture: "ava.v2", alternate: null });
    expect(imageFileNameOf(`${P}/mia/30_face.neutral~default.png`)).toEqual({ name: "30_face", picture: "30_face.neutral~default", alternate: null });
  });

  it("splits files into things, their pictures and each picture's layers in stacking order, its own file apart", () => {
    const things = imageThingsOf([...AVA, `${P}/mia/90_body.png`, `${ROOT}/assets/Images/office.png`]);
    expect(things.map((thing) => [thing.name, thing.pictures.map((picture) => picture.name)])).toEqual([
      ["ava", ["ava", "ava@night"]],
      ["office", ["office"]],
    ]);
    const [ava, night] = things[0]!.pictures;
    expect(ava!.path).toBe(`${P}/ava.png`);
    expect(ava!.layers.map((layer) => leaf(layer.path))).toEqual([
      "ava~30_mouth.closed~default.png",
      "ava~30_mouth.open.png",
      "ava~20_face.happy.png",
      "ava~20_face.sad.png",
      "ava~10_hat.on.png",
    ]);
    expect(night!.layers.map((layer) => layer.layer)).toEqual(["face.happy"]);
    expect(ava!.unnumbered).toEqual([]);
  });

  it("stacks the lowest number on top, unnumbered layers by file name, and an unnumbered layer below a numbered one", () => {
    const sorted = (paths: string[]) =>
      paths.map((path) => ({ path, ...imageFileNameOf(path) }))
        .map(({ path, layer, order }) => ({ path, layer: layer!, ...(order === undefined ? {} : { order }) }))
        .sort(byLayerStacking)
        .map((layer) => leaf(layer.path));
    expect(sorted([`${P}/a~10_hat.png`, `${P}/a~20_face.png`])).toEqual(["a~20_face.png", "a~10_hat.png"]);
    expect(sorted([`${P}/a~hat.png`, `${P}/a~face.png`])).toEqual(["a~face.png", "a~hat.png"]);
    expect(sorted([`${P}/a~10_hat.png`, `${P}/a~face.png`])).toEqual(["a~face.png", "a~10_hat.png"]);
  });
});

describe("layer files beside a picture compose into it (#2201)", () => {
  it("makes each picture with layer files a layered picture of its own name, its file at the bottom", () => {
    const program = compile(AVA, REFERENCES);
    expect(Object.keys(program.context?.["layered_image"] ?? {}).filter((name) => !name.startsWith("$")).sort()).toEqual(["ava", "ava@night"]);
    expect(drawn(program, "ava")).toEqual(["ava.png", "ava~30_mouth.closed~default.png"]);
    expect(drawn(program, "ava:happy:hat")).toEqual([
      "ava.png",
      "ava~30_mouth.closed~default.png",
      "ava~20_face.happy.png",
      "ava~10_hat.on.png",
    ]);
    expect(drawn(program, "ava@night:face.happy")).toEqual(["ava@night.png", "ava@night~face.happy.png"]);
    expect(drawn(program, "ava:mouth.open:sad")).toEqual(["ava.png", "ava~30_mouth.open.png", "ava~20_face.sad.png"]);
  });

  it("raises no warning for these files and no collision between the options of one group", () => {
    const program = compile(AVA, REFERENCES);
    expect(collisions(program)).toEqual([]);
    expect(warnings(program)).toEqual([]);
  });

  it("keeps a layer on its own picture: an alternate never shows its base's layers", () => {
    const program = compile(AVA, scene("[[ava@night:hat]]"));
    expect(drawn(program, "ava@night:hat")).toEqual(["ava@night.png"]);
    expect(warnings(program).map(({ message }) => message)).toEqual([
      'This image has no attribute "hat". The attribute is ignored.',
    ]);
  });

  it("stacks unnumbered layers in file-name order, the first at the bottom", () => {
    const files = [`${P}/bo.png`, `${P}/bo~hair.png`, `${P}/bo~blush.png`, `${P}/bo~cap.on.png`];
    const program = compile(files, scene("[[bo:cap]]"));
    expect(drawn(program, "bo:cap")).toEqual(["bo.png", "bo~blush.png", "bo~cap.on.png", "bo~hair.png"]);
    expect(drawn(program, "bo")).toEqual(["bo.png", "bo~blush.png", "bo~hair.png"]);
  });

  it("keeps the first-dot name for a file with no ~, and layers it all the same", () => {
    expect(workspace.getFileName(`${P}/ava.v2.png`)).toBe("ava");
    const program = compile([`${P}/ava.v2.png`, `${P}/ava~face.happy.png`], scene("[[ava:happy]]"));
    expect(drawn(program, "ava:happy")).toEqual(["ava.v2.png", "ava~face.happy.png"]);
  });

  it("lets a define name the composed picture as image.ava@night and choose its options", () => {
    const text = `define ava@party as filtered_image with
  image = image.ava@night
  attributes = { "face.happy" }
end

${scene("[[ava@party]]")}`;
    const program = compile(AVA, text);
    expect(warnings(program)).toEqual([]);
    expect(drawn(program, "ava@party")).toEqual(["ava@night.png", "ava@night~face.happy.png"]);
  });

  it("lets a define name a folder portrait as image.mia, by the same rule", () => {
    const text = `define mia_party as filtered_image with
  image = image.mia
  attributes = { "face.happy" }
end

${scene("[[mia_party]]")}`;
    const program = compile([`${P}/mia/90_body.png`, `${P}/mia/30_face.happy.png`, `${P}/mia/30_face.neutral~default.png`], text);
    expect(warnings(program)).toEqual([]);
    expect(drawn(program, "mia_party")).toEqual(["90_body.png", "30_face.happy.png"]);
  });

  it("still warns for image.X when no picture of that name exists", () => {
    const text = `define nobody_party as filtered_image with
  image = image.nobody
end

${scene("[[nobody_party]]")}`;
    expect(warnings(compile(AVA, text)).map(({ message }) => message)).toContain("Cannot find image named `nobody`");
  });

  it("lets an explicit layered_image of that name override the composed picture", () => {
    const text = `define ava as layered_image with
  assets = { office }
end

${scene("[[ava]]")}`;
    const program = compile([...AVA, `${ROOT}/assets/Images/office.png`], text);
    expect(drawn(program, "ava")).toEqual(["office.png"]);
    expect(collisions(program)).toEqual([]);
  });

  it("draws a folder stack and a picture with layer files side by side in one project", () => {
    const files = [...AVA, `${P}/mia/90_body.png`, `${P}/mia/30_face.happy.png`, `${P}/mia/30_face.neutral~default.png`];
    const program = compile(files, scene("[[mia:happy]]", "[[ava:happy]]"));
    expect(drawn(program, "mia:happy")).toEqual(["90_body.png", "30_face.happy.png"]);
    expect(drawn(program, "ava:happy")).toEqual(["ava.png", "ava~30_mouth.closed~default.png", "ava~20_face.happy.png"]);
    expect(warnings(program)).toEqual([]);
  });
});

describe("the problems a picture's layer files can have (#1039)", () => {
  it("allows layers with no base file, with no warning: the picture is its layers", () => {
    const program = compile([`${P}/cy~body.png`, `${P}/cy~face.happy.png`], scene("[[cy]]", "[[cy:happy]]"));
    expect(drawn(program, "cy")).toEqual(["cy~body.png"]);
    expect(drawn(program, "cy:happy")).toEqual(["cy~body.png", "cy~face.happy.png"]);
    expect(warnings(program)).toEqual([]);
  });

  it("warns on the line for an option the picture lacks, and still shows the rest", () => {
    const program = compile(AVA, scene("[[ava@night:sad]]"));
    expect(drawn(program, "ava@night:sad")).toEqual(["ava@night.png"]);
    expect(warnings(program)).toEqual([
      { file: "main.sd", line: 1, message: 'This image has no attribute "sad". The attribute is ignored.' },
    ]);
  });

  it("warns on both files when two layers of one group are its default", () => {
    const files = [`${P}/ava.png`, `${P}/ava~mouth.closed~default.png`, `${P}/ava~mouth.open~default.png`];
    const found = warnings(compile(files, scene("[[ava]]")));
    expect(found.map(({ file }) => file).sort()).toEqual(["ava~mouth.closed~default.png", "ava~mouth.open~default.png"]);
    for (const { message } of found) {
      expect(message).toContain("ava~mouth.closed~default.png");
      expect(message).toContain("ava~mouth.open~default.png");
    }
  });

  it("warns, naming the unnumbered files, when a picture mixes numbered and unnumbered layers", () => {
    const files = [`${P}/ava.png`, `${P}/ava~10_hat.on.png`, `${P}/ava~face.happy.png`, `${P}/ava~blush.png`];
    const found = warnings(compile(files, scene("[[ava]]")));
    expect(found.map(({ file }) => file).sort()).toEqual(["ava~blush.png", "ava~face.happy.png"]);
    for (const { message } of found) {
      expect(message).toContain("ava~blush.png");
      expect(message).toContain("ava~face.happy.png");
      expect(message).not.toContain("ava~10_hat.on.png");
    }
  });

  it("warns on a malformed layer name", () => {
    const found = warnings(compile([`${P}/ava.png`, `${P}/ava~face..happy.png`], scene("[[ava]]")));
    expect(found).toHaveLength(1);
    expect(found[0]!.file).toBe("ava~face..happy.png");
    expect(found[0]!.message).toContain('Layer "face..happy"');
  });

  it("warns on a layer file with no name after the ~", () => {
    const found = warnings(compile([`${P}/ava.png`, `${P}/ava~.png`, `${P}/ava~10_.png`], scene("[[ava]]")));
    expect(found.map(({ file }) => file).sort()).toEqual(["ava~.png", "ava~10_.png"]);
    expect(found.find(({ file }) => file === "ava~.png")!.message).toContain("ava~.png");
  });

  it("raises no warning for a group with no default beside a base, and shows none of its layers", () => {
    const program = compile([`${P}/ava.png`, `${P}/ava~face.happy.png`, `${P}/ava~face.sad.png`], scene("[[ava]]"));
    expect(drawn(program, "ava")).toEqual(["ava.png"]);
    expect(warnings(program)).toEqual([]);
  });

  it("keeps the folder stack's warning for a group with no resting choice", () => {
    const program = compile([`${P}/mia/90_body.png`, `${P}/mia/30_face.happy.png`, `${P}/mia/30_face.sad.png`], scene("[[mia]]"));
    expect(warnings(program).map(({ message }) => message).join("\n")).toContain("has no resting choice for face");
  });

  it("warns, naming both, for one thing stacked two ways: a file beside a folder stack of its name", () => {
    expect(collisions(compile([`${P}/ava.png`, `${P}/ava/90_body.png`], scene("[[ava]]"))).sort()).toEqual([
      "90_body.png: ava",
      "ava.png: ava",
    ]);
    expect(collisions(compile([`${P}/ava.png`, `${P}/ava~face.happy.png`, `${P}/ava/90_body.png`], scene("[[ava]]"))).sort()).toEqual([
      "90_body.png: ava",
      "ava.png: ava",
    ]);
  });

  it("still warns for a real duplicate in two folders", () => {
    const files = [`${ROOT}/assets/Images/Portraits/ava.png`, `${ROOT}/assets/Images/Backdrops/ava.png`];
    expect(collisions(compile(files, scene("[[ava]]"))).sort()).toEqual(["ava.png: ava", "ava.png: ava"]);
  });

  it("raises no collision for two options of one group", () => {
    expect(collisions(compile([`${P}/ava~face.happy.png`, `${P}/ava~face.sad.png`], scene("[[ava:happy]]")))).toEqual([]);
  });
});

describe("an existing project that uses today's names (#2201)", () => {
  const FILES = [
    `${P}/mia/90_body.png`,
    `${P}/mia/30_face.happy.png`,
    `${P}/mia/30_face.neutral~default.png`,
    `${ROOT}/assets/Images/office.png`,
    `${ROOT}/assets/Images/v1.2.png`,
    `${P}/ava.png`,
    `${P}/ava@night.png`,
  ];
  const TEXT = scene("[[office]]", "[[v1]]", "[[mia]]", "[[mia:happy]]", "[[ava]]", "[[ava@night]]");

  it("keeps every picture that has no layer file drawn as it was", () => {
    const program = compile(FILES, TEXT);
    expect(drawn(program, "office")).toEqual(["office.png"]);
    expect(drawn(program, "v1")).toEqual(["v1.2.png"]);
    expect(drawn(program, "mia")).toEqual(["90_body.png", "30_face.neutral~default.png"]);
    expect(drawn(program, "mia:happy")).toEqual(["90_body.png", "30_face.happy.png"]);
    expect(drawn(program, "ava")).toEqual(["ava.png"]);
    expect(drawn(program, "ava@night")).toEqual(["ava@night.png"]);
    expect(program.context?.["image"]?.["ava"]?.src).toBe(`${P}/ava.png`);
    expect(warnings(program)).toEqual([]);
  });

  it("draws the layers a script already chooses once their files sit beside the picture", () => {
    const program = compile([...FILES, `${P}/ava~face.happy.png`], scene("[[ava]]", "[[ava:happy]]"));
    expect(drawn(program, "ava")).toEqual(["ava.png"]);
    expect(drawn(program, "ava:happy")).toEqual(["ava.png", "ava~face.happy.png"]);
  });
});
