import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { writtenText } from "../../runtime/displayStyle";

const URI = "inmemory:///main.sd";

function compile(source: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: URI, type: "script", name: "main", ext: "sd", text: source, version: 1, languageId: "sparkdown" },
    ],
  });
  return compiler.compile({ textDocument: { uri: URI } }).program;
}

const tagWarnings = (body: string) => {
  const source = `scene main\n  ${body}\nend\n`;
  const lineStart = source.indexOf(body);
  return (compile(source).diagnostics?.[URI] ?? [])
    .filter((d: any) => String(d.message?.value ?? d.message).includes("tag `<"))
    .map((d: any) => ({
      message: String(d.message?.value ?? d.message),
      severity: d.severity,
      text: body.slice(d.range.start.character - 2, d.range.end.character - 2),
      line: d.range.start.line,
      lineStart,
    }))
    .map(({ message, severity, text }) => ({ message, severity, text }));
};

describe("an unknown tag gets a warning that names it (#2145, #193 decision 11)", () => {
  test("<b2> in a story line", () => {
    expect(tagWarnings("A <b2>word</b2> here.")).toEqual([
      {
        message: "Unknown tag `<b2>`; the player removes it from the text and does nothing else",
        severity: 2,
        text: "<b2>",
      },
      {
        message: "Unknown tag `</b2>`; the player removes it from the text and does nothing else",
        severity: 2,
        text: "</b2>",
      },
    ]);
  });

  test("a tag written with an equals sign is told the colon form", () => {
    expect(tagWarnings("A <speed=0.5>word here.").map((w) => w.message)).toEqual([
      "Unknown tag `<speed=0.5>`; the player removes it from the text and does nothing else\n> A tag's value follows a colon: `<speed:0.5>`",
    ]);
  });

  test.each([
    "A <b>word</b> here.",
    "A <B>word</B> here.",
    "A <color:red>word</color> here.",
    "Go <speed:0.5>slow<wait:1> <p:2>high<w> <!>hidden</!> now.",
    "A<br> b <sub>c</sub> <sup>d</sup>",
    "Speed<speed:2> up</speed>.",
  ])("no warning for the known tags in %s", (body) => {
    expect(tagWarnings(body)).toEqual([]);
  });

  test("in a dialogue line, a choice line and a span", () => {
    expect(tagWarnings("NOVA: Hi <x>there").map((w) => w.text)).toEqual(["<x>"]);
    expect(
      tagWarnings("choose\n    + Go <y>far [<z>a] now\n      Done.\n  end").map((w) => w.message),
    ).toEqual([
      "Unknown tag `<y>`; the player removes it from the text and does nothing else",
      "Unknown tag `<z>`; the player removes it from the text and does nothing else",
    ]);
    expect(tagWarnings("A *b <q>c* d").map((w) => w.text)).toEqual(["<q>"]);
  });
});

describe("the compiler carries a tag in the line's text, not as written (#2145)", () => {
  const texts = (body: string) => {
    const program = compile(`scene main\n  ${body}\nend\n`);
    const strings: string[] = [];
    const seen = new Set<unknown>();
    const visit = (value: unknown) => {
      if (typeof value === "string") strings.push(value);
      else if (value && typeof value === "object" && !ArrayBuffer.isView(value) && !seen.has(value)) {
        seen.add(value);
        Object.values(value).forEach(visit);
      }
    };
    visit(program);
    return strings;
  };

  test("no compiled string holds the tag's brackets, and the written text is the source", () => {
    const strings = texts("A <b>word</b> here.");
    expect(strings.filter((s) => s.includes("<b>"))).toEqual([]);
    expect(strings.map((s) => writtenText(s))).toContain("A <b>word</b> here.");
  });
});
