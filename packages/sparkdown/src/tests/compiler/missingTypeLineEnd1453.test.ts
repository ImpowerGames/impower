// A type annotation's `:`, a method access's `:` or a type's `|`, `&` or
// `->` that ends its line, or is followed on it only by a comment, is
// scoped alike by both TextMate engines, whatever the next line holds
// (I-1453, closing I-1346 and I-1363): the missing-type rules decide on
// their own line, as vscode-textmate does, and the author still sees Luau's
// error for a missing type at Luau's range.
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { officialErrorList } from "./officialSyntax";
import { compareEnginesFull, formatDivergences } from "./scopeEquality";
import { messageOf, NOT_SYNTAX } from "./luauSyntaxReadings";

const URI = "inmemory:///main.sd";
const HEADER = "function run()\n  ";
const FOOTER = "\nend\n";
const STORY = "After {run()}.\n";

/** Sparkdown's syntax errors, as `start-end message` in 0-based lines and characters. */
function sparkdownErrors(text: string): string[] {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  return (compiler.compile({ textDocument: { uri: URI } } as never).program.diagnostics?.[URI] ?? [])
    .filter((d) => d.severity === DiagnosticSeverity.Error && !NOT_SYNTAX.some((pattern) => pattern.test(messageOf(d))))
    .map((d) => `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${messageOf(d)}`)
    .sort();
}

/**
 * The official parser's errors, with a missing type's range ending with
 * the line it is missing from, as Sparkdown reports it (I-1318, I-1322).
 */
function officialErrors(luau: string): string[] {
  return officialErrorList(luau)
    .map((e) => e.replace(/^(\d+):(\d+)-(\d+):\d+ (Expected type, got .*)$/, (all, line, column, endLine, message) =>
      Number(endLine) > Number(line) ? `${line}:${column}-${Number(line) + 1}:0 ${message}` : all))
    .sort();
}

async function expectEnginesAgree(source: string): Promise<void> {
  const result = await compareEnginesFull(source);
  expect(result.divergences, formatDivergences(source, result.divergences)).toEqual([]);
}

// Forms in a function body, where a type may go on at the next line.
const BODY_FORMS = [
  // I-1346: a method access whose `:` ends its line before `end`.
  "t:",
  "local t = {}\n  t:",
  "local t = {}\n  t: --[[c]]",
  // The same lookahead's other readers: an annotation, a return type and a
  // type operator that end their line before a statement keyword.
  "local w:\n  local z = 1",
  "local w: --[[c]]\n  local z = 1",
  "local w: -- line\n  local z = 1",
  "local function g():\n    return 1\n  end",
  "local function g(): --[[c]]\n    return 1\n  end",
  "local w: number |\n  local z = 1",
  "local w: number | --[[c]]\n  local z = 1",
  "local w: number &\n  local z = 1",
  "type F = () ->\n  local z = 1",
  "type F = () -> --[[c]]\n  local z = 1",
  // A comment of a longer level, whose level a lookahead must not capture:
  // textmate-grammar-tree requires a match's captures to cover the match.
  "local w: number & --[==[c]==]\n  local z = 1",
  "local w: --[=========[c]=========]\n  local z = 1",
  "local w: --[==[c]==] = 1",
  // Controls: a type on the next line is the annotation's.
  "local w:\n    number = 1",
  "local w: --[[c]]\n    number = 1",
  "local w: number |\n    string = 1",
];

// I-1363: story statements, which end at their line. A story declaration's
// missing type is the one Luau reports for its line read alone; a story
// type alias's is the one Luau reports for the story's Luau lines read
// together, where the next statement's `local` stands in place of the type.
const STORY_LUAU_TAIL = "\nlocal v = 1\n";
const STORY_TAIL = `${STORY_LUAU_TAIL}Narrative.\n`;
const STORY_FORMS: [form: string, luau: (form: string) => string][] = [
  ...[
    "local w: number | --[[c]]",
    "local w: number | -- line",
    "local w: --[[c]]",
    "local w: number |",
    "local w:",
    "local w: number & -- line",
    "local w: number & --[==[c]==]",
    "local w: --[=========[c]=========]",
    "local w: number || --[[c]]",
    "local w: --[[c]] = 1",
  ].map(
    (form): [string, (form: string) => string] => [form, (f) => `${f}\n`],
  ),
  ...["type F = number | --[[c]]", "type F = () -> --[[c]]", "type F = () ->", "type F = number |"].map(
    (form): [string, (form: string) => string] => [form, (f) => `${f}${STORY_LUAU_TAIL}`],
  ),
];

describe("a missing type at a line end reads alike in both engines (I-1453)", () => {
  // The tickets' own reproductions.
  test("I-1346: a method access whose `:` ends its line before `end`", () =>
    expectEnginesAgree("Value {f()}.\nfunction f()\n  t:\nend\n"));
  test("I-1363: a type operator before a comment at a story line's end", () =>
    expectEnginesAgree("local w: number | --[[c]]\nlocal v = 1\nNarrative.\n"));

  describe("in a function body", () => {
    for (const form of BODY_FORMS) {
      const luau = `${HEADER}${form}${FOOTER}`;
      const text = `${luau}${STORY}`;
      test(`${JSON.stringify(form)}: engines agree`, () => expectEnginesAgree(text));
      test(`${JSON.stringify(form)}: Luau's errors at Luau's ranges`, () => {
        expect(sparkdownErrors(text)).toEqual(officialErrors(luau));
      });
    }
  });

  describe("in a story statement", () => {
    for (const [form, luau] of STORY_FORMS) {
      const text = `${form}${STORY_TAIL}`;
      test(`${JSON.stringify(form)}: engines agree`, () => expectEnginesAgree(text));
      test(`${JSON.stringify(form)}: Luau's errors at Luau's ranges`, () => {
        const official = officialErrors(luau(form));
        expect(official.length, "the official parser reports the form").toBeGreaterThan(0);
        expect(sparkdownErrors(text)).toEqual(official);
      });
    }
  });
});
