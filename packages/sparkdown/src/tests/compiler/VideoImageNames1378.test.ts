import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";
import type { File } from "../../compiler/types/File";

// A video name is a valid image-command target (I-1378): `[[show LAYER NAME]]`
// and `[[animate LAYER NAME]]` resolve it against `video.<name>` beside the
// image types, and a name that is both an image and a video is an error on the
// line that names it.

const uri = "file:///project/main.sd";
const file = (path: string, type: "image" | "video"): File => ({
  uri: `file:///project/assets/${path}`,
  type,
  name: path.split("/").at(-1)!.replace(/\.[^.]+$/, ""),
  ext: path.split(".").at(-1)!,
  src: `/file:/local/assets/${path}`,
});
const compile = (text: string, files: File[] = []) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri, name: "main", type: "script", ext: "sd", text, version: 1, languageId: "sparkdown" },
      ...files,
    ],
  });
  return compiler.compile({ textDocument: { uri } }).program;
};
const diagnostics = (program: ReturnType<typeof compile>) =>
  (program.diagnostics?.[uri] ?? []).map((d) => ({
    line: d.range.start.line,
    character: d.range.start.character,
    severity: d.severity,
    message: typeof d.message === "string" ? d.message : d.message.value,
  }));
const naming = (program: ReturnType<typeof compile>, name: string) =>
  diagnostics(program).filter((d) => d.message.includes(`\`${name}\``));
const referenceIdsAt = (text: string, needle: string) => {
  const documents = new SparkdownDocumentRegistry(["references"]);
  documents.set({ textDocument: { uri, text, version: 1, languageId: "sparkdown" } });
  const from = text.indexOf(needle);
  const ids: string[][] = [];
  const r = documents.annotations(uri).references.iter();
  while (r.value) {
    if (r.from === from && r.to === from + needle.length) {
      ids.push(r.value.type.symbolIds ?? []);
    }
    r.next();
  }
  return ids;
};

describe("video names in image commands (I-1378)", () => {
  it.each(["show", "animate"])("references video.<name> from [[%s LAYER NAME]]", (control) => {
    const text = `[[${control} backdrop bunny_idle]]\n`;
    expect(referenceIdsAt(text, "bunny_idle")).toEqual([
      ["filtered_image.bunny_idle", "layered_image.bunny_idle", "image.bunny_idle", "graphic.bunny_idle", "video.bunny_idle"],
    ]);
  });

  it.each(["show", "animate"])("accepts a video file named in [[%s LAYER NAME]]", (control) => {
    const program = compile(`[[${control} backdrop bunny_idle]]\nA beat.\n`, [file("bunny_idle.webm", "video")]);
    expect(naming(program, "bunny_idle")).toEqual([]);
  });

  it("accepts a defined video named in [[show LAYER NAME]]", () => {
    const program = compile(
      `define bunny_idle as video with\n  src = "bunny_idle.webm"\nend\n[[show backdrop bunny_idle]]\nA beat.\n`,
    );
    expect(naming(program, "bunny_idle")).toEqual([]);
  });

  it("still reports a name that is neither an image nor a video", () => {
    const program = compile(`[[show backdrop nowhere]]\nA beat.\n`, [file("bunny_idle.webm", "video")]);
    expect(naming(program, "nowhere").map((d) => d.message)).toEqual(["Cannot find image named `nowhere`"]);
  });

  it("reports a name provided by both an image file and a video file on the show line", () => {
    const program = compile(`A beat.\n[[show backdrop bunny]]\nAnother.\n`, [
      file("bunny.png", "image"),
      file("bunny.webm", "video"),
    ]);
    expect(naming(program, "bunny")).toEqual([
      {
        line: 1,
        character: 16,
        severity: 1,
        message: "`bunny` is defined as both an image and a video, so `[[show]]` and `[[animate]]` cannot tell which to display: rename one of them",
      },
    ]);
  });

  it("reports a defined image that shares its name with a video file", () => {
    const program = compile(
      `define bunny as image with\n  src = "bunny.png"\nend\n[[animate backdrop bunny]]\nA beat.\n`,
      [file("bunny.webm", "video")],
    );
    expect(naming(program, "bunny").map((d) => [d.line, d.severity])).toEqual([[3, 1]]);
  });

  it("does not report an image-only name", () => {
    const program = compile(`[[show backdrop bunny]]\nA beat.\n`, [file("bunny.png", "image")]);
    expect(naming(program, "bunny")).toEqual([]);
  });
});
