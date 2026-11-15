import { describe, expect, test } from "vitest";
import { testCompiler } from "../engineUnderTest";

const URI = "inmemory:///main.sd";

const script = (line: string) =>
  ["scene start", "  choose", line, "      Body.", "      done", "  end", "end", ""].join("\n");

const displayScript = (line: string) => ["scene start", line, "  done", "end", ""].join("\n");

const NOT_CLOSED = /^This `(\[\[|\(\()` opens no directive, because no `(\]\]|\)\))` closes it before the line ends or a choice's square bracket starts or ends/;

const unclosed = (text: string) => {
  const compiler = testCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" } as any],
  });
  const program = compiler.compile({ textDocument: { uri: URI } }).program;
  const lines = text.split("\n");
  return (program.diagnostics?.[URI] ?? []).flatMap((d: any) => {
    const message = (typeof d.message === "string" ? d.message : d.message.value) as string;
    if (!NOT_CLOSED.test(message)) return [];
    const line = lines[d.range.start.line]!;
    return [`${d.severity === 2 ? "warning" : d.severity}:${d.range.start.character}:${line.slice(d.range.start.character, d.range.end.character)}`];
  });
};

describe("an opener with no closer in its part of the line is text, and warns that the directive is not closed (I-2337)", () => {
  test.each([
    ["at a display line's end", "  [[mia with fade", ["warning:2:[["]],
    ["after words at a display line's end", "  Hello ((play music theme", ["warning:8:(("]],
    ["after a closed directive", "  Hello [[mia]] and [[bunny", ["warning:20:[["]],
    ["at a choice bracket", "    + Go ((a [x] b)) now", ["warning:9:(("]],
    ["inside the choice brackets", "    + Go [((play music] now", ["warning:10:(("]],
    ["at a choice line's end after the brackets", "    + Go [x] [[mia with fade", ["warning:13:[["]],
    ["at a divert", "    + Go [x] [[mia with fade -> next", ["warning:13:[["]],
    ["in a run of openers", "    + Go (((a [x] b)) now", ["warning:9:(("]],
  ])("%s: `%s`", (_label, line, expected) => {
    const text = line.trimStart().startsWith("+") ? script(line) : displayScript(line);
    expect(unclosed(text)).toEqual(expected);
  });

  test.each([
    ["a closed directive", "  [[mia with fade]]"],
    ["a closed directive in a choice", "    + Go [x] ((play music theme)) now"],
    ["an escaped opener", "  \\[[mia with fade"],
    ["an opener in raw text", "  `[[mia with fade`"],
    ["a single bracket", "  Go (left) or [right"],
  ])("%s does not warn: `%s`", (_label, line) => {
    const text = line.trimStart().startsWith("+") ? script(line) : displayScript(line);
    expect(unclosed(text)).toEqual([]);
  });
});
