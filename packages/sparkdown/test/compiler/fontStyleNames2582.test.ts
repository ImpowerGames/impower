import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "../../src/compiler/types/SparkProgram";
import { SparkdownWorkspace } from "../../src/workspace/classes/SparkdownWorkspace";

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

const BOLD_ITALIC = { weight: "700", style: "italic" };
const REGULAR = { weight: "normal", style: "normal" };

const CASES: [string, { family: string; weight: string; style: string }][] = [
  ["title@bold@italic", { family: "title", ...BOLD_ITALIC }],
  ["title@italic@bold", { family: "title", ...BOLD_ITALIC }],
  ["title@Italic@BOLD", { family: "title", ...BOLD_ITALIC }],
  ["title@bolditalic@italic", { family: "title", ...BOLD_ITALIC }],
  ["title@bold@italicbold", { family: "title", ...BOLD_ITALIC }],
  ["title@bold@bold", { family: "title", weight: "700", style: "normal" }],
  ["title@italic@italic", { family: "title", weight: "normal", style: "italic" }],
  ["title@bold", { family: "title", weight: "700", style: "normal" }],
  ["title@italic", { family: "title", weight: "normal", style: "italic" }],
  ["title@bolditalic", { family: "title", ...BOLD_ITALIC }],
  ["title@ItalicBold", { family: "title", ...BOLD_ITALIC }],
  ["title@light", { family: "title@light", ...REGULAR }],
  ["title@light@bold", { family: "title@light@bold", ...REGULAR }],
  ["title@bold@light", { family: "title@bold@light", ...REGULAR }],
  ["title@bold@", { family: "title@bold@", ...REGULAR }],
  ["title@@bold", { family: "title@@bold", ...REGULAR }],
  ["my@font@bold", { family: "my@font@bold", ...REGULAR }],
];

describe("font styles written as several @ words (#2582)", () => {
  const program = compile(CASES.map(([name]) => `file:///proj/fonts/${name}.ttf`));

  it.each(CASES)("reads %s.ttf", (name, expected) => {
    expect(face(program, name)).toEqual(expected);
  });
});
