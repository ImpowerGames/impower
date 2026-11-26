import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "../../src/compiler/types/SparkProgram";
import { SparkdownWorkspace } from "../../src/workspace/classes/SparkdownWorkspace";

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

const messagesOf = (program: SparkProgram) =>
  Object.values(program.diagnostics ?? {}).flatMap((list) =>
    (list ?? []).map((d) => ({ message: typeof d.message === "string" ? d.message : d.message.value, severity: d.severity, line: d.range.start.line, from: d.range.start.character, to: d.range.end.character })),
  );

const TILDE = "An image name can't start with `~`: write the picture's name first, then its filters\n> e.g. `[[portrait~happy]]`";

describe("an image tag whose name starts with ~ is an error, since no script can write that name (#2614)", () => {
  it.each([
    ["[[~zzz]]", 2, 6],
    ["[[show portrait ~zzz]]", 16, 20],
    ["[[~zzz~happy]]", 2, 12],
  ])("%s reports the name, with or without the file", (tag, from, to) => {
    for (const files of [[], [`${P}/~zzz.png`]]) {
      const program = compile(files, `scene start\n${tag}\nend\n`);
      expect(messagesOf(program)).toContainEqual({ message: TILDE, severity: 1, line: 1, from, to });
    }
  });

  it("an indented [[~blush]] beside an image file ~blush.png reports the name (#2615)", () => {
    const program = compile([`${ROOT}/assets/Images/~blush.png`], "scene start\n  [[~blush]]\nend\n");
    expect(messagesOf(program)).toContainEqual({ message: TILDE, severity: 1, line: 1, from: 4, to: 10 });
  });

  it.each(["[[zzz]]", "[[zzz~happy]]", "[[show portrait zzz]]"])("%s does not report it", (tag) => {
    const program = compile([], `scene start\n${tag}\nend\n`);
    expect(messagesOf(program).map((d) => d.message)).not.toContain(TILDE);
  });
});
