import { describe, expect, it } from "vitest";
import { assetNameOf, imageFileNameOf, imageThingsOf, thingNameOf } from "../../attributes/imageFileName";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
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

const EDGES = ["@foo", "foo@", "@", "~foo", "%40foo"];

describe("a file name whose @ or ~ has nothing on one side is a whole picture name (#2262)", () => {
  it.each([
    ["@foo", "@foo"],
    ["foo@", "foo@"],
    ["@", "@"],
    ["~foo", "~foo"],
    ["@foo~face", "@foo"],
    ["foo@~face", "foo@"],
    ["ava@night", "ava"],
    ["ava~face", "ava"],
    ["ava@night~face", "ava"],
  ])("the thing of %s is %s", (name, thing) => {
    expect(thingNameOf(name)).toBe(thing);
  });

  it.each([
    ["@foo", { name: "@foo", picture: "@foo", alternate: null }],
    ["foo@", { name: "foo@", picture: "foo@", alternate: null }],
    ["@", { name: "@", picture: "@", alternate: null }],
    ["~foo", { name: "~foo", picture: "~foo", alternate: null }],
    ["%40foo", { name: "%40foo", picture: "%40foo", alternate: null }],
    ["@foo~face", { name: "@foo", picture: "@foo", alternate: null, layer: "face" }],
  ])("the file name of %s.png", (stem, expected) => {
    expect(imageFileNameOf(`${P}/${stem}.png`)).toEqual(expected);
  });

  it("groups each edge as its own thing of one picture with no alternate, named as the compiler names it", () => {
    const paths = EDGES.map((stem) => `${P}/${stem}.png`);
    const things = imageThingsOf(paths);
    expect(things.map((thing) => [thing.name, thing.pictures.map((picture) => [picture.name, picture.alternate])])).toEqual(
      [
        ["@", [["@", null]]],
        ["@foo", [["@foo", null]]],
        ["foo@", [["foo@", null]]],
        ["~foo", [["~foo", null]]],
      ],
    );
    expect(things.flatMap((thing) => thing.pictures.map((picture) => picture.name)).sort()).toEqual(
      [...new Set(paths.map((path) => assetNameOf(path, "image")))].sort(),
    );
  });

  it("the compiler holds each edge as an image of that name and claims none as a layer of an empty picture", () => {
    const program = compile(["@foo", "foo@", "@", "~foo"].map((stem) => `${P}/${stem}.png`), "scene start\nend\n");
    const images = Object.keys(program.context?.["image"] ?? {});
    expect(images).toEqual(expect.arrayContaining(["@foo", "foo@", "@", "~foo"]));
    expect(images).not.toContain("");
  });
});
