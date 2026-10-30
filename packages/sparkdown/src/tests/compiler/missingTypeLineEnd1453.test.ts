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

const BODY_FORMS = [
  "t:",
  "local t = {}\n  t:",
  "local t = {}\n  t: --[[c]]",
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
  "local w: number & --[==[c]==]\n  local z = 1",
  "local w: --[=========[c]=========]\n  local z = 1",
  "local w: --[==[c]==] = 1",
  "local w:\n    number = 1",
  "local w: --[[c]]\n    number = 1",
  "local w: number |\n    string = 1",
];

const STORY_LUAU_TAIL = "\nif true then end\n";
const STORY_FORMS: [form: string, text: (form: string) => string, luau: (form: string) => string][] = [
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
    (form): [string, (form: string) => string, (form: string) => string] => [
      form,
      (f) => `-> start\nscene start\n  ${f}\n  local v = 1\n  Narrative.\nend\n`,
      (f) => `\n\n  ${f}\n`,
    ],
  ),
  ...["type F = number | --[[c]]", "type F = () -> --[[c]]", "type F = () ->", "type F = number |"].map(
    (form): [string, (form: string) => string, (form: string) => string] => [
      form,
      (f) => `${f}${STORY_LUAU_TAIL}Narrative.\n`,
      (f) => `${f}${STORY_LUAU_TAIL}`,
    ],
  ),
];

describe("a missing type at a line end reads alike in both engines (I-1453)", () => {
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
    for (const [form, script, luau] of STORY_FORMS) {
      const text = script(form);
      test(`${JSON.stringify(form)}: engines agree`, () => expectEnginesAgree(text));
      test(`${JSON.stringify(form)}: Luau's errors at Luau's ranges`, () => {
        const official = officialErrors(luau(form));
        expect(official.length, "the official parser reports the form").toBeGreaterThan(0);
        expect(sparkdownErrors(text)).toEqual(official);
      });
    }
  });
});
