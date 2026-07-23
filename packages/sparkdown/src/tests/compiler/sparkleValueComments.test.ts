// Trailing `--` / `//` line comments on struct/style value lines must NOT leak
// into the compiled value. The grammar's unquoted value tokens (`StylingValue`
// / `UnquotedStringFieldValue`) greedily span to end-of-line, so the comment
// lands inside the value node; the three struct lowerers strip it (gated on the
// unquoted node names, so quoted values keep a legitimate `--`/`//`).
// See project_sparkle_element_line_comments.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

function compile(source: string): any {
  const compiler = new SparkdownCompiler();
  const uri = "inmemory:///main.sd";
  compiler.configure({
    files: [
      {
        uri,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  return compiler.compile({ textDocument: { uri } }).program;
}

describe("Sparkle struct/style value trailing comments", () => {
  test("style scalar values drop a trailing --/// comment", () => {
    const style = compile(
      `style card with\n` +
        `  background-color = red -- swap later\n` +
        `  note = blue // done\n` +
        `end\n`,
    ).styles?.["card"];
    expect(style?.["background-color"]).toBe("red");
    expect(style?.["note"]).toBe("blue");
  });

  test("values without a whitespace-delimited comment are untouched", () => {
    const style = compile(
      `style card with\n` +
        `  transition = all 0.2s ease-in\n` + // spaces, no marker
        `  grid-template = auto-fill\n` + // single hyphen
        `  bg = url(http://x.com/y)\n` + // `//` after `:` is not a comment
        `end\n`,
    ).styles?.["card"];
    expect(style?.["transition"]).toBe("all 0.2s ease-in");
    expect(style?.["grid-template"]).toBe("auto-fill");
    expect(style?.["bg"]).toBe("url(http://x.com/y)");
  });

  test("a quoted value keeps a `--` inside the quotes", () => {
    const style = compile(
      `style card with\n  quip = "a -- b"\nend\n`,
    ).styles?.["card"];
    expect(style?.["quip"]).toBe("a -- b");
  });

  test("typed (animation) keyframe values drop a trailing comment", () => {
    const kf = compile(
      `animation slide as animation with\n` +
        `  target = layer.self\n` +
        `  keyframes:\n` +
        `    -\n` +
        `      background_position = right -- move it\n` +
        `end\n`,
    ).context?.animation?.slide?.keyframes;
    expect(kf?.[0]?.["background_position"]).toBe("right");
  });
});
