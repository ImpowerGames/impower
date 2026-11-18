import { describe, expect, test } from "vitest";
import { testCompiler } from "../engineUnderTest";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";

const URI = "inmemory:///main.sd";
const BRACKETS = /^Inside a line, put the value of `(match|plural)` in brackets/;

const scene = (...lines: string[]) =>
  ["store n = 2", 'store mood = "happy"', "store player = { mood = \"happy\" }", "", "scene start", ...lines.map((line) => `  ${line}`), "end", ""].join("\n");

const play = (text: string) => {
  const ctx = makeRuntimeStoryFromSource(text, URI);
  return { errors: ctx.errorMessages, warnings: ctx.warningMessages, out: ctx.story.ContinueMaximally() };
};

const bracketDiagnostics = (text: string) => {
  const compiler = testCompiler();
  compiler.configure({ files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }] });
  const { program } = compiler.compile({ textDocument: { uri: URI } });
  const lines = text.split("\n");
  return (program.diagnostics?.[URI] ?? [])
    .map((d) => ({
      message: typeof d.message === "string" ? d.message : d.message.value,
      severity: d.severity,
      marked: lines[d.range.start.line]!.slice(d.range.start.character, d.range.end.character),
    }))
    .filter((d) => BRACKETS.test(d.message));
};

const BARE: [string, string, string, string, string][] = [
  ["a bare plural in an action", "You have {n} .. plural n|one=apple|other=apples .. in the basket.", "plural", "n", "You have 2 .. plural n|one=apple|other=apples .. in the basket.\n"],
  ["a bare match in an action", "It is .. match mood|happy=a|other=b .. today.", "match", "mood", "It is .. match mood|happy=a|other=b .. today.\n"],
  ["a bare match with spaces around its bars", "It is .. match mood | happy = a | other = b .. today.", "match", "mood", "It is .. match mood | happy = a | other = b .. today.\n"],
  ["a bare dotted name", "It is .. match player.mood|happy=a|other=b .. today.", "match", "player.mood", "It is .. match player.mood|happy=a|other=b .. today.\n"],
  ["a bare number", "One .. plural 1|one=apple|other=apples .. here.", "plural", "1", "One .. plural 1|one=apple|other=apples .. here.\n"],
  ["an interpolation in an arm", "It is .. match mood|happy={n}|other=b .. today.", "match", "mood", "It is .. match mood|happy=2|other=b .. today.\n"],
  ["a bare match in a dialogue line", "@ Bob: It is .. match mood|happy=a|other=b .. today.", "match", "mood", "It is .. match mood|happy=a|other=b .. today.\n"],
  ["a bare match closing at the line's end", "It is .. match mood|happy=a|other=b ..", "match", "mood", "It is .. match mood|happy=a|other=b"],
];

const BRACKETED: [string, string, string][] = [
  ["a bracketed plural", "You have {n} .. plural(n)|one=apple|other=apples .. in the basket.", "You have 2 apples in the basket.\n"],
  ["a bracketed match", "It is .. match(mood)|happy=a|other=b .. today.", "It is a today.\n"],
  ["a bracketed match after a space", "It is .. match (mood)|happy=a|other=b .. today.", "It is a today.\n"],
];

const PROSE: string[] = [
  "Wait .. match the colours .. then go.",
  "Wait .. match the colours | or not.",
  "A plural noun | and .. so on.",
  "Pick one: match|plural .. done.",
  "It is ..match mood|happy=a|other=b .. today.",
  "It is .. match mood|happy=a|other=b..today.",
  "Escaped \\.. match mood|happy=a|other=b .. today.",
  "It is .. cycle|a|b .. today.",
  "Note // .. match mood|happy=a|other=b .. today.",
  "cycle | It is .. match mood|happy=a|other=b .. today. | B. end",
];

describe("a glued match or plural with a bare value is reported, asking for brackets (#2500)", () => {
  test.each(BARE)("%s is reported once, on its value, and plays as on main", (_, line, keyword, value, out) => {
    const text = scene(line);
    expect(bracketDiagnostics(text)).toEqual([
      {
        message: `Inside a line, put the value of \`${keyword}\` in brackets, as in \`.. ${keyword}(${value}) | ...\`: without them the whole set is printed as text`,
        severity: 1,
        marked: value,
      },
    ]);
    const played = play(text);
    expect(played.errors.filter((message) => !BRACKETS.test(message))).toEqual([]);
    expect(played.out).toBe(out);
  });

  test.each(BRACKETED)("%s is not reported and plays its arm", (_, line, out) => {
    expect(bracketDiagnostics(scene(line))).toEqual([]);
    expect(play(scene(line))).toEqual({ errors: [], warnings: [], out });
  });

  test.each(PROSE)("story text `%s` is not reported", (line) => {
    expect(bracketDiagnostics(scene(line))).toEqual([]);
  });

  test("a Luau string holding the bare form is not reported", () => {
    expect(bracketDiagnostics(scene('& local s = "x .. match mood|happy=a|other=b .. y"', "{s}"))).toEqual([]);
  });

  test("a set at the start of a line, where `..` joins the line before for the bracketed spelling too, is not reported", () => {
    expect(bracketDiagnostics(scene("Before ..", ".. match mood|happy=a|other=b .. today."))).toEqual([]);
  });

  test("a bare set in a choice is reported", () => {
    const text = scene("choose", "  + Pick .. match mood|happy=a|other=b .. now", "    Done.", "end");
    expect(bracketDiagnostics(text).map((d) => d.marked)).toEqual(["mood"]);
  });

  test("two bare sets on one line are each reported", () => {
    const line = "It is .. match mood|happy=a|other=b .. and .. plural n|one=x|other=y .. today.";
    expect(bracketDiagnostics(scene(line)).map((d) => d.marked)).toEqual(["mood", "n"]);
  });
});
