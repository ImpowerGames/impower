import { describe, expect, test } from "vitest";
import { testCompiler } from "../engineUnderTest";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";

const URI = "inmemory:///main.sd";
const BRACKETS = /^This line looks like a `(match|plural)` set between `\.\.` marks/;
const warning = (keyword: string, value: string) =>
  `This line looks like a \`${keyword}\` set between \`..\` marks, but it is printed as text because its value has no brackets. If a set was meant, write \`.. ${keyword}(${value}) | ...\``;

const scene = (...lines: string[]) =>
  ["store n = 2", 'store mood = "happy"', "store player = { mood = \"happy\" }", "", "scene start", ...lines.map((line) => `  ${line}`), "end", ""].join("\n");

const play = (text: string) => {
  const ctx = makeRuntimeStoryFromSource(text, URI);
  const warnings = ctx.warningMessages.filter((m: string) => !m.startsWith("No layout element is named `Bob`"));
  return { errors: ctx.errorMessages, warnings, out: ctx.story.ContinueMaximally() };
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

const BARE_SPELLINGS: [string, string, string][] = [
  ["a tab after the keyword (6978228428)", "It is .. match\tmood|happy=a|other=b .. today.", "mood"],
  ["a tab before the bar", "It is .. match mood\t|happy=a|other=b .. today.", "mood"],
  ["tabs around every mark (6978228428)", "It is\t..\tplural\tn|one=a|other=b\t..\ttoday.", "n"],
  ["a no-break space after the keyword (6978228428)", "It is .. match mood|happy=a|other=b .. today.", "mood"],
  ["a name with an underscore", "It is .. match my_mood|happy=a|other=b .. today.", "my_mood"],
  ["a negative number", "It is .. plural -1|one=a|other=b .. today.", "-1"],
  ["a leading-dot number (6978570245)", "Fraction .. plural .5|one=apple|other=apples .. here.", ".5"],
  ["a trailing-dot number (6978570245)", "Whole .. plural 1.|one=apple|other=apples .. here.", "1."],
  ["a number with a signed exponent (6978570245)", "Power .. plural 1e+3|one=apple|other=apples .. here.", "1e+3"],
  ["a negative leading-dot number", "It is .. plural -.5|one=a|other=b .. today.", "-.5"],
  ["a decimal number", "It is .. plural 1.5|one=a|other=b .. today.", "1.5"],
  ["a hexadecimal number", "It is .. plural 0x1F|one=a|other=b .. today.", "0x1F"],
  ["a number with an underscore", "It is .. plural 1_000|one=a|other=b .. today.", "1_000"],
  ["an unbroken sum", "It is .. plural n-1|one=a|other=b .. today.", "n-1"],
  ["an unbroken call", "It is .. match string.upper(mood)|HAPPY=a|other=b .. today.", "string.upper(mood)"],
];

const BRACKETED: [string, string, string][] = [
  ["a bracketed plural", "You have {n} .. plural(n)|one=apple|other=apples .. in the basket.", "You have 2 apples in the basket.\n"],
  ["a bracketed match", "It is .. match(mood)|happy=a|other=b .. today.", "It is a today.\n"],
  ["a bracketed match after a space", "It is .. match (mood)|happy=a|other=b .. today.", "It is a today.\n"],
  ["a bracketed match after a tab", "It is .. match\t(mood)|happy=a|other=b .. today.", "It is a today.\n"],
];

const PROSE: [string[], { errors: string[]; warnings: string[]; out: string }][] = [
  [["Wait .. match the colours .. then go."], { errors: [], warnings: [], out: "Wait .. match the colours .. then go.\n" }],
  [["Wait .. match the colours | or not."], { errors: [], warnings: [], out: "Wait .. match the colours | or not.\n" }],
  [["A plural noun | and .. so on."], { errors: [], warnings: [], out: "A plural noun | and .. so on.\n" }],
  [["Pick one: match|plural .. done."], { errors: [], warnings: ["Cannot find character named `Pick one`"], out: "match|plural .. done.\n" }],
  [["It is ..match mood|happy=a|other=b .. today."], { errors: [], warnings: [], out: "It is ..match mood|happy=a|other=b .. today.\n" }],
  [["It is .. match mood|happy=a|other=b..today."], { errors: [], warnings: [], out: "It is .. match mood|happy=a|other=b..today.\n" }],
  [["Escaped \\.. match mood|happy=a|other=b .. today."], { errors: [], warnings: [], out: "Escaped .. match mood|happy=a|other=b .. today.\n" }],
  [["It is .. cycle|a|b .. today."], { errors: [], warnings: [], out: "It is a today.\n" }],
  [["Note // .. match mood|happy=a|other=b .. today."], { errors: [], warnings: [], out: "Note\n" }],
  [["cycle | It is .. match mood|happy=a|other=b .. today. | B. end"], { errors: [], warnings: [], out: "It is .. match mood\n" }],
  [["Wait ... match the colours | or not ... then go."], { errors: [], warnings: [], out: "Wait ... match the colours | or not ... then go.\n" }],
  [["@ Bob: Wait ... plural forms | are hard ... to learn."], { errors: [], warnings: [], out: "Wait ... plural forms | are hard ... to learn.\n" }],
  [["@ Bob", "  Wait ... match it | or not ... fine."], { errors: [], warnings: [], out: "@ Bob\nWait ... match it | or not ... fine.\n" }],
  [["choose", "  + Wait ... match it | or not ... fine", "    Done.", "end"], { errors: [], warnings: [], out: "" }],
  [['It is {".. match mood|happy=a|other=b .."} today.'], { errors: [], warnings: [], out: "It is .. match mood|happy=a|other=b .. today.\n" }],
  [["It is {mood} .. and | match .. today."], { errors: [], warnings: [], out: "It is happy .. and | match .. today.\n" }],
  [["Wait .. match the colours | or not .. then go."], { errors: [], warnings: [], out: "Wait .. match the colours | or not .. then go.\n" }],
  [["@ Bob: Wait .. match the colours | or not .. then go."], { errors: [], warnings: [], out: "Wait .. match the colours | or not .. then go.\n" }],
  [["@ Bob", "  Wait .. match the colours | or not .. then go."], { errors: [], warnings: [], out: "@ Bob\nWait .. match the colours | or not .. then go.\n" }],
  [["choose", "  + Wait .. match the colours | or not .. then go", "    Done.", "end"], { errors: [], warnings: [], out: "" }],
  [["cycle", "| Wait .. match the colours | or not .. then go.", "| B.", "end"], { errors: [], warnings: [], out: "Wait .. match the colours | or not .. then go.\n" }],
  [["Count .. plural 3 apples | or more .. today."], { errors: [], warnings: [], out: "Count .. plural 3 apples | or more .. today.\n" }],
];

const STYLED_PROSE: string[] = [
  "Wait .. match **the colours** | or not .. then go.",
  "Wait .. match *the colours* | or not .. then go.",
  "Wait .. match `the colours` | or not .. then go.",
  'Wait .. match {"the colours"} | or not .. then go.',
  "Wait .. plural *forms* | are hard .. to learn.",
];

const STYLED_CONTEXTS: [string, (line: string) => string[]][] = [
  ["an action", (line) => [line]],
  ["a dialogue line", (line) => [`@ Bob: ${line}`]],
  ["a dialogue block", (line) => ["@ Bob", `  ${line}`]],
  ["a choice", (line) => ["choose", `  + ${line}`, "    Done.", "end"]],
  ["a multi-line cycle arm", (line) => ["cycle", `| ${line}`, "| B.", "end"]],
];

describe("a glued match or plural with a bare value is reported, asking for brackets (#2500)", () => {
  test.each(BARE)("%s gets one warning, on its value, and still compiles and plays as on main", (_, line, keyword, value, out) => {
    const text = scene(line);
    expect(bracketDiagnostics(text)).toEqual([{ message: warning(keyword, value), severity: 2, marked: value }]);
    expect(play(text)).toEqual({ errors: [], warnings: [warning(keyword, value)], out });
  });

  test.each(BARE_SPELLINGS)("%s gets one warning, marking the value alone, and no error", (_, line, value) => {
    const text = scene(line);
    expect(bracketDiagnostics(text).map((d) => [d.marked, d.severity])).toEqual([[value, 2]]);
    expect(play(text).errors).toEqual([]);
  });

  test.each(BRACKETED)("%s is not reported and plays its arm", (_, line, out) => {
    expect(bracketDiagnostics(scene(line))).toEqual([]);
    expect(play(scene(line))).toEqual({ errors: [], warnings: [], out });
  });

  test.each(PROSE)("story text %j is not reported and plays as written", (lines, result) => {
    expect(bracketDiagnostics(scene(...lines))).toEqual([]);
    expect(play(scene(...lines))).toEqual(result);
  });

  test.each(STYLED_CONTEXTS.flatMap(([where, wrap]) => STYLED_PROSE.map((line) => [where, line, wrap(line)] as const)))(
    "styled or interpolated prose in %s, %s, is not reported (6978928707)",
    (_, __, lines) => {
      expect(bracketDiagnostics(scene(...lines))).toEqual([]);
      expect(play(scene(...lines)).errors).toEqual([]);
    },
  );

  test.each([
    ["Wait .. plural forms | are hard .. to learn.", "forms"],
    ["Wait .. match don't | stop .. now.", "don't"],
  ])("one unbroken run between the keyword and a bar, closed by `..`, has the bare form's own shape and gets the warning, playing as written: %s", (line, marked) => {
    expect(bracketDiagnostics(scene(line)).map((d) => [d.marked, d.severity])).toEqual([[marked, 2]]);
    const played = play(scene(line));
    expect(played.errors).toEqual([]);
    expect(played.warnings).toHaveLength(1);
    expect(played.out).toBe(`${line}\n`);
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
