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
    ["`--`", " -- note"],
    ["`--` without a space", "-- note"],
  ] as const) {
    test(label, () => {
      const bird = robin(marker);
      expect(bird?.name).toBe("red");
      expect(bird?.delay).toBe(5);
      expect(bird?.fill).toBe(true);
    });
  }

  test("`//` is floor division, reported", () => {
    const program = compile(
      `define Bird with\n  delay = 0\nend\n` +
        `define robin as Bird with\n  delay = 5 // note\nend\n`,
    );
    const messages = Object.values(program.diagnostics ?? {})
      .flat()
      .map((d: any) => (typeof d.message === "string" ? d.message : d.message.value));
    expect(messages).toContain("Cannot find variable named `note`");
    expect(program.context?.Bird?.robin?.delay).not.toBe(5);
  });

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

  test("a ` -- ` or ` // ` inside a quoted string is kept verbatim", () => {
    const out = compile(
      `define Bird with\n  name = ""\n  alt = ""\n  note = ""\nend\n` +
        `define robin as Bird with\n` +
        `  name = "Chapter 1 -- The Beginning"\n` +
        `  alt = "see // note"\n` +
        `  note = 'single -- quoted'\n` +
        `end\n`,
    ).context?.Bird?.robin;
    expect(out?.name).toBe("Chapter 1 -- The Beginning");
    expect(out?.alt).toBe("see // note");
    expect(out?.note).toBe("single -- quoted");
  });

  test("an in-string marker and a real trailing comment coexist", () => {
    const out = compile(
      `define Bird with\n  name = ""\nend\n` +
        `define robin as Bird with\n` +
        `  name = "wait -- hold" -- authored note\n` +
        `end\n`,
    ).context?.Bird?.robin;
    expect(out?.name).toBe("wait -- hold");
  });
});
