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

  // The element-line "is this a block header?" test is `<stuff>:` followed by
  // end-of-line or a comment. It used to accept a BARE `//` there, so the `:` in
  // a `://` URL looked like a block-opening colon with `//rest-of-url` as its
  // trailing comment — the line was reparsed as a header and the prop value came
  // back as the fragment `"https`. `//` only opens a comment when followed by
  // whitespace/end-of-line, so the header test now requires that too.
  test("a `://` URL in a prop value is not mistaken for a block header", () => {
    const layouts = (
      compile(
        `layout main with\n` +
          `  link "Docs" #href="https://example.com/a/b?x=1"\n` +
          `end\n`,
      ) as any
    ).sparkle?.layouts;
    const link = layouts?.main?.children?.[0];
    expect(link?.tag).toBe("link");
    expect(link?.props?.href?.value).toBe("https://example.com/a/b?x=1");
  });

  test("a protocol-relative `//` URL survives too", () => {
    const layouts = (
      compile(
        `layout main with\n` +
          `  image #src="//cdn.example.com/x.png"\n` +
          `end\n`,
      ) as any
    ).sparkle?.layouts;
    expect(layouts?.main?.children?.[0]?.props?.src?.value).toBe(
      "//cdn.example.com/x.png",
    );
  });

  test("a block header still accepts `//` and `--` trailing comments", () => {
    const layouts = (
      compile(
        `layout main with\n` +
          `  column #child-gap=8: // spaced comment\n` +
          `    text "a"\n` +
          `  row #child-gap=4: -- dash comment\n` +
          `    text "b"\n` +
          `end\n`,
      ) as any
    ).sparkle?.layouts;
    const kids = layouts?.main?.children ?? [];
    expect(kids[0]?.tag).toBe("column");
    expect(kids[0]?.children?.length).toBe(1);
    expect(kids[1]?.tag).toBe("row");
    expect(kids[1]?.children?.length).toBe(1);
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
