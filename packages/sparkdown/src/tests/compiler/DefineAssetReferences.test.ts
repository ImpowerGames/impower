import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { File } from "../../compiler/types/File";

// A define property that names an asset is checked against the images,
// layered images and filtered images the program declares, in both spellings:
// a bare name (`image = warm`) and a typed one (`image = filtered_image.warm`).
// A name that is declared resolves without a warning; one that is not warns.

const uri = "file:///project/main.sd";
const asset = (path: string): File => ({
  uri: `file:///project/assets/${path}`,
  type: "image",
  name: path.split("/").at(-1)!.replace(/\.[^.]+$/, ""),
  ext: path.split(".").at(-1)!,
  src: `/file:/local/assets/${path}`,
});
const compile = (lines: string[], files: File[] = []) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri, name: "main", type: "script", ext: "sd", text: lines.join("\n"), version: 1, languageId: "sparkdown" },
      ...files,
    ],
  });
  return compiler.compile({ textDocument: { uri } }).program;
};
const warnings = (program: ReturnType<typeof compile>) =>
  (program.diagnostics?.[uri] ?? []).map((d) => ({
    message: typeof d.message === "string" ? d.message : d.message.value,
    line: d.range.start.line,
    from: d.range.start.character,
    to: d.range.end.character,
  }));
const missing = (program: ReturnType<typeof compile>) =>
  warnings(program).filter((w) => w.message.startsWith("Cannot find"));

describe("asset references in define bodies", () => {
  it("accepts a bare name of a declared image and filtered image (#1594)", () => {
    const program = compile([
      "First beat.",
      "",
      "define source as image with",
      '  src = "https://example.com/a.svg"',
      "end",
      "",
      "define warm as filtered_image with",
      "  image = source",
      "end",
      "",
      "define portrait as filtered_image with",
      "  image = warm",
      "end",
    ]);
    expect(missing(program)).toEqual([]);
  });

  it("accepts a bare name of an image file and of a layered image", () => {
    const program = compile(
      [
        "First beat.",
        "",
        "define stack as layered_image with",
        "  assets = { backdrop }",
        "end",
        "",
        "define warm as filtered_image with",
        "  image = backdrop",
        "end",
        "",
        "define stacked as filtered_image with",
        "  image = stack",
        "end",
      ],
      [asset("backdrop.png")],
    );
    expect(missing(program)).toEqual([]);
  });

  it("accepts the bare names of a circular pair, which the cycle check reports", () => {
    const program = compile([
      "First beat.",
      "",
      "define loop_a as filtered_image with",
      "  image = loop_b",
      "end",
      "",
      "define loop_b as filtered_image with",
      "  image = loop_a",
      "end",
    ]);
    expect(missing(program)).toEqual([]);
  });

  it("keeps the warning on a bare name declared nowhere", () => {
    const program = compile([
      "First beat.",
      "",
      "define warm as filtered_image with",
      "  image = does_not_exist_anywhere",
      "end",
    ]);
    expect(missing(program)).toEqual([
      { message: "Cannot find variable named `does_not_exist_anywhere`", line: 3, from: 10, to: 33 },
    ]);
  });

  it("warns on a typed reference to an undeclared look (#1593)", () => {
    const program = compile([
      "First beat.",
      "",
      "define warm as filtered_image with",
      "  image = filtered_image.missing",
      "end",
    ]);
    expect(missing(program)).toEqual([
      { message: "Cannot find filtered_image named `missing`", line: 3, from: 25, to: 32 },
    ]);
  });

  it("warns on a typed reference to an undeclared image or layered image", () => {
    const program = compile([
      "First beat.",
      "",
      "define warm as filtered_image with",
      "  image = image.missing",
      "end",
      "",
      "define cool as filtered_image with",
      "  image = layered_image.missing",
      "end",
    ]);
    expect(missing(program)).toEqual([
      { message: "Cannot find image named `missing`", line: 3, from: 16, to: 23 },
      { message: "Cannot find layered_image named `missing`", line: 7, from: 24, to: 31 },
    ]);
  });

  it("warns on a typed reference whose name is declared only as another type", () => {
    const program = compile(
      [
        "First beat.",
        "",
        "define warm as filtered_image with",
        "  image = filtered_image.backdrop",
        "end",
      ],
      [asset("backdrop.png")],
    );
    expect(missing(program)).toEqual([
      { message: "Cannot find filtered_image named `backdrop`", line: 3, from: 25, to: 33 },
    ]);
  });

  it("accepts typed references to declared assets of each type", () => {
    const program = compile(
      [
        "First beat.",
        "",
        "define stack as layered_image with",
        "  assets = { backdrop }",
        "end",
        "",
        "define warm as filtered_image with",
        "  image = image.backdrop",
        "end",
        "",
        "define cool as filtered_image with",
        "  image = filtered_image.warm",
        "end",
        "",
        "define stacked as filtered_image with",
        "  image = layered_image.stack",
        "end",
      ],
      [asset("backdrop.png")],
    );
    expect(missing(program)).toEqual([]);
  });
});
