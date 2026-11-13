import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { SparkdownWorkspace } from "../../workspace/classes/SparkdownWorkspace";

const MAIN = "file:///proj/main.sd";

const fileName = (uri: string) => SparkdownWorkspace.prototype.getFileName.call(SparkdownWorkspace.prototype, uri);

const compile = (fonts: string[]): SparkProgram => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: MAIN, type: "script", name: "main", ext: "sd", text: "", version: 1, languageId: "sparkdown" },
      ...fonts.map((uri) => ({ uri, type: "font", name: fileName(uri), ext: "ttf", src: uri, version: 1 })),
    ] as never,
  });
  return compiler.compile({ textDocument: { uri: MAIN } }).program;
};

const face = (program: SparkProgram, name: string) => {
  const font = program.context?.["font"]?.[name];
  return { family: font?.font_family, weight: font?.font_weight, style: font?.font_style };
};

describe("font styles named with @ (#2202)", () => {
  const program = compile([
    "file:///proj/fonts/title.ttf",
    "file:///proj/fonts/title@bold.ttf",
    "file:///proj/fonts/title%40italic.ttf",
    "file:///proj/fonts/title@bolditalic.ttf",
    "file:///proj/fonts/title@italicbold.ttf",
    "file:///proj/fonts/title@BoldItalic.ttf",
    "file:///proj/fonts/caption__bold.ttf",
  ]);

  it("reads title.ttf as regular title", () => {
    expect(face(program, "title")).toEqual({ family: "title", weight: "normal", style: "normal" });
  });

  it("reads title@bold.ttf as bold title", () => {
    expect(face(program, "title@bold")).toEqual({ family: "title", weight: "700", style: "normal" });
  });

  it("reads title@italic.ttf as italic title", () => {
    expect(face(program, "title@italic")).toEqual({ family: "title", weight: "normal", style: "italic" });
  });

  it.each(["title@bolditalic", "title@italicbold", "title@BoldItalic"])("reads %s.ttf as bold italic title", (name) => {
    expect(face(program, name)).toEqual({ family: "title", weight: "700", style: "italic" });
  });

  it("no longer reads caption__bold.ttf as a bold style of caption", () => {
    expect(face(program, "caption__bold")).toEqual({ family: "caption__bold", weight: "normal", style: "normal" });
  });
});
