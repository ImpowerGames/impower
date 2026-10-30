import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { File } from "../../compiler/types/File";

const uri = "file:///project/main.sd";
const asset = (path: string): File => ({
  uri: `file:///project/assets/${path}`,
  type: "image",
  name: path.split("/").at(-1)!.replace(/\.[^.]+$/, ""),
  ext: path.split(".").at(-1)!,
  src: `/file:/local/assets/${path}`,
});
const compilerFor = (text: string, files: File[] = []) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri, name: "main", type: "script", ext: "sd", text, version: 1, languageId: "sparkdown" },
      ...files,
    ],
  });
  return compiler;
};
const compile = (lines: string[], files: File[] = []) =>
  compilerFor(lines.join("\n"), files).compile({ textDocument: { uri } }).program;
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

  it("warns on a parenthesized bare name declared nowhere (#1612)", () => {
    const program = compile([
      "First beat.",
      "define a6 as filtered_image with",
      "  image = (missing3)",
      "end",
      "define a7 as filtered_image with",
      "  image = ((missing4))",
      "end",
    ]);
    expect(missing(program)).toEqual([
      { message: "Cannot find variable named `missing3`", line: 2, from: 11, to: 19 },
      { message: "Cannot find variable named `missing4`", line: 5, from: 12, to: 20 },
    ]);
  });

  it("accepts a parenthesized bare name of a declared asset", () => {
    const program = compile(
      [
        "First beat.",
        "define warm as filtered_image with",
        "  image = (backdrop)",
        "end",
        "define cool as filtered_image with",
        "  image = ((warm))",
        "end",
      ],
      [asset("backdrop.png")],
    );
    expect(missing(program)).toEqual([]);
  });

  it("checks a parenthesized typed reference", () => {
    const program = compile(
      [
        "First beat.",
        "define warm as filtered_image with",
        "  image = (filtered_image.missing)",
        "end",
        "define cool as filtered_image with",
        "  image = (image.backdrop)",
        "end",
      ],
      [asset("backdrop.png")],
    );
    expect(missing(program)).toEqual([
      { message: "Cannot find filtered_image named `missing`", line: 2, from: 26, to: 33 },
    ]);
  });

  it("follows edits to the asset and to the reference across compiles", () => {
    let text = [
      "First beat.",
      "",
      "define warm as filtered_image with",
      '  src = "https://example.com/a.svg"',
      "end",
      "",
      "define portrait as filtered_image with",
      "  image = warm",
      "end",
      "",
      "define typed as filtered_image with",
      "  image = filtered_image.warm",
      "end",
      "",
      "Last beat.",
    ].join("\n");
    const compiler = compilerFor(text);
    let version = 1;
    const edit = (find: string, replace: string) => {
      const offset = text.indexOf(find);
      expect(offset, `"${find}" is in the text`).toBeGreaterThanOrEqual(0);
      const position = (at: number) => {
        const before = text.slice(0, at).split("\n");
        return { line: before.length - 1, character: before.at(-1)!.length };
      };
      version += 1;
      compiler.updateDocument({
        textDocument: { uri, version },
        contentChanges: [
          { range: { start: position(offset), end: position(offset + find.length) }, text: replace },
        ],
      } as never);
      text = text.slice(0, offset) + replace + text.slice(offset + find.length);
      const incremental = missing(compiler.compile({ textDocument: { uri } }).program);
      expect(incremental).toEqual(missing(compilerFor(text).compile({ textDocument: { uri } }).program));
      return incremental;
    };

    expect(missing(compiler.compile({ textDocument: { uri } }).program)).toEqual([]);
    expect(edit("Last beat.", "Last beat, edited.")).toEqual([]);
    expect(edit("define warm as", "define warmer as")).toEqual([
      { message: "Cannot find variable named `warm`", line: 7, from: 10, to: 14 },
      { message: "Cannot find filtered_image named `warm`", line: 11, from: 25, to: 29 },
    ]);
    expect(edit("First beat.", "First beat again.")).toHaveLength(2);
    expect(edit("define warmer as", "define warm as")).toEqual([]);
    expect(edit("  image = warm\n", "  image = warm2\n")).toEqual([
      { message: "Cannot find variable named `warm2`", line: 7, from: 10, to: 15 },
    ]);
    expect(edit("  image = warm2\n", "  image = warm\n")).toEqual([]);
  });
});
