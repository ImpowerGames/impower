// A trailing line comment on a TYPED define's field silently changed the
// field's TYPE.
//
// `coerceScalarLiteral` anchors every literal test to the whole RHS string, so
// `delay = 5 -- note` failed the number test and fell through to "store it as a
// string". A number became a string, a boolean became a string, and a quoted
// string kept both its quotes and the comment. No diagnostic in any case.
//
// The style-block path was already correct (see sparkleValueComments) — which
// is what made this easy to miss: the same syntax behaves differently depending
// on which lowerer reads it.

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

const robin = (trailing: string) =>
  compile(
    `define Bird with\n  name = ""\n  delay = 0\n  fill = false\nend\n` +
      `define robin as Bird with\n` +
      `  name = "red"${trailing}\n` +
      `  delay = 5${trailing}\n` +
      `  fill = true${trailing}\n` +
      `end\n`,
  ).context?.Bird?.robin;

describe("a trailing comment does not change a typed field's value", () => {
  for (const [label, marker] of [
    ["no comment (control)", ""],
    ["`//`", " // note"],
    ["`--`", " -- note"],
  ] as const) {
    test(label, () => {
      const bird = robin(marker);
      expect(bird?.name).toBe("red");
      expect(bird?.delay).toBe(5);
      expect(bird?.fill).toBe(true);
    });
  }

  // The stripper requires whitespace before the marker, and `//` additionally
  // requires a following space or end-of-line — so neither a URL nor a CSS
  // custom property is mistaken for a comment.
  test("a `://` URL and a `--custom` property survive", () => {
    const out = compile(
      `define Bird with\n  name = ""\n  tint = ""\nend\n` +
        `define robin as Bird with\n` +
        `  name = "http://x.com/y"\n` +
        `  tint = "var(--theme-color-red)"\n` +
        `end\n`,
    ).context?.Bird?.robin;
    expect(out?.name).toBe("http://x.com/y");
    expect(out?.tint).toBe("var(--theme-color-red)");
  });
});
