import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { SparkdownWorkspace } from "../../workspace/classes/SparkdownWorkspace";

const workspace = Object.create(SparkdownWorkspace.prototype) as SparkdownWorkspace;
workspace.loadConfiguration({ imageFiles: "**/*.{png,webp,svg}", audioFiles: "**/*.{wav,mp3}" });
const ROOT = "file:///proj";
const MAIN = `${ROOT}/main.sd`;
const P = `${ROOT}/assets/Images/Portraits`;
const TEXT = `define ava as character with
  name = "Ava"
end

scene start
  [[ava:face.happy]]
  ava: Hello there.
  [[ava@night]]
end
`;

const compile = (uris: readonly string[]): SparkProgram => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: MAIN, type: "script", name: "main", ext: "sd", text: TEXT, version: 1, languageId: "sparkdown" },
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

const collisions = (program: SparkProgram) =>
  Object.entries(program.diagnostics ?? {}).flatMap(([uri, diagnostics]) =>
    diagnostics
      .map((d) => (typeof d.message === "string" ? d.message : d.message.value))
      .filter((message) => message.startsWith("Asset name collision"))
      .map((message) => `${uri.slice(uri.lastIndexOf("/") + 1)}: ${/`([^`]+)`/.exec(message)![1]}`),
  );

const STACK = [`${P}/ava.png`, `${P}/ava@night.png`, `${P}/ava~face.happy.png`, `${P}/ava~face.sad.png`];

describe("layer files named name~group.option (#2186)", () => {
  it("names a layer file by the picture it belongs to, and keeps first-dot names for files that are not layers", () => {
    expect(STACK.map((uri) => workspace.getFileName(uri))).toEqual(["ava", "ava@night", "ava", "ava"]);
    expect(workspace.getFileName(`${P}/ava@night~face.sad.png`)).toBe("ava@night");
    expect(workspace.getFileName(`${P}/ava%40night~face.sad.png`)).toBe("ava@night");
    expect(workspace.getFileName(`${P}/v1.2.png`)).toBe("v1");
    expect(workspace.getFileName(`${P}/mia/30_face.neutral~default.png`)).toBe("30_face");
    expect(workspace.getFileName(`${ROOT}/assets/Audio/chime~loud.wav`)).toBe("chime~loud");
  });

  it("raises no collision for the layers of one picture, its alternate or its base", () => {
    const program = compile([...STACK, `${P}/bo.png`]);
    expect(collisions(program)).toEqual([]);
    expect(program.context?.["image"]?.["ava"]?.src).toBe(`${P}/ava.png`);
    expect(program.context?.["image"]?.["ava@night"]?.src).toBe(`${P}/ava@night.png`);
  });

  it("still warns, naming the member, for two files that are the same layer", () => {
    const program = compile([...STACK, `${P}/ava~face.happy.webp`, `${P}/Extras/ava~face.sad.png`]);
    expect(collisions(program).sort()).toEqual([
      "ava~face.happy.png: ava~face.happy",
      "ava~face.happy.webp: ava~face.happy",
      "ava~face.sad.png: ava~face.sad",
      "ava~face.sad.png: ava~face.sad",
    ]);
  });

  it("still warns for two files that are the same picture", () => {
    expect(collisions(compile([...STACK, `${P}/ava.webp`])).sort()).toEqual([
      "ava.png: ava",
      "ava.webp: ava",
    ]);
  });

  it("renames a layer file with its picture, keeping its group, option and extension", () => {
    expect(workspace.getRenamedUri(`${P}/ava~face.happy.png`, "bea")).toBe(`${P}/bea~face.happy.png`);
    expect(workspace.getRenamedUri(`${P}/ava%40night~face.sad.png`, "bea@night")).toBe(`${P}/bea@night~face.sad.png`);
    expect(workspace.getRenamedUri(`${P}/v1.2.png`, "v2")).toBe(`${P}/v2.2.png`);
  });
});
