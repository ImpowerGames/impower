import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SyntaxNode } from "@lezer/common";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { ProgramStory } from "../../program/ProgramStory";
import { compileScript, storyBeats } from "../program/programHarness";
import { parseSource } from "./grammarSnapshot";
import { checkerTextUnits } from "./luauCheckerText";
import { officialSyntaxErrors } from "./officialSyntax";
import { treeScopeStackAt, vscodeScopeStacksPerChar } from "./scopeEquality";

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  "__snapshots__/grammar/luau-function/if-expression-column0-then-arm-1522.sd",
);

const fixture = readFileSync(FIXTURE, "utf8").replace(/\r\n?/g, "\n");

const URI = "inmemory:///main.sd";

function readings(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  const program = compiler.compile({ textDocument: { uri: URI } } as never).program;
  const errors = (program.diagnostics?.[URI] ?? [])
    .filter((diagnostic) => diagnostic.severity === DiagnosticSeverity.Error)
    .map((diagnostic) => (typeof diagnostic.message === "string" ? diagnostic.message : diagnostic.message.value));
  const tree = compiler.documents.tree(URI);
  if (!tree) throw new Error("Compiler kept no syntax tree");
  const units = checkerTextUnits(tree, text);
  const official = [units.prelude, ...units.flows].flatMap((unit) => officialSyntaxErrors(unit.text));
  return { errors, official: official.map((error) => error.message) };
}

function offsetOf(linePrefix: string, text: string): number {
  const lineStart = `\n${fixture}`.indexOf(`\n${linePrefix}`);
  expect(lineStart, `line ${JSON.stringify(linePrefix)}`).toBeGreaterThanOrEqual(0);
  const at = fixture.indexOf(text, lineStart);
  expect(at, `${JSON.stringify(text)} after ${JSON.stringify(linePrefix)}`).toBeGreaterThanOrEqual(lineStart);
  return at;
}

function treeRulesAt(offset: number): string[] {
  const names: string[] = [];
  for (let node: SyntaxNode | null = parseSource(fixture).resolveInner(offset, 1); node; node = node.parent) {
    names.unshift(node.name);
  }
  return names;
}

const isElseKeyword = (stack: string[]) => stack.at(-1) === "keyword.control.else.luau";

const VALUE_CASES = [
  ["a while condition", "function a(c)", "else true do"],
  ["a call argument", "function b(c)", "else 2)"],
  ["a returned value", "function d(c)", "else 2"],
  ["a value after a comment and a blank line", "function e(c)", "else 2"],
  ["a value after a `then` glued to its condition", "function n(c)", "else 2"],
] as const;

function functionText(open: string): string {
  const start = offsetOf(open, open);
  const next = fixture.indexOf("\nfunction ", start + 1);
  return fixture.slice(start, next < 0 ? undefined : next + 1);
}

describe("an if expression's then-arm value at column 0 after a `then` that ends its line (#1522)", () => {
  test.each(VALUE_CASES)("is the then arm in %s", async (_, open, elseLine) => {
    const at = offsetOf(open, `\n${elseLine}`) + 1;
    const vscode = await vscodeScopeStacksPerChar(fixture);
    const tree = parseSource(fixture);
    expect(isElseKeyword(vscode[at]!), `vscode ${JSON.stringify(vscode[at])}`).toBe(true);
    expect(isElseKeyword(treeScopeStackAt(tree, at)), `tree ${JSON.stringify(treeScopeStackAt(tree, at))}`).toBe(true);
    const value = fixture.lastIndexOf("\n", at - 2) + 1;
    expect(treeRulesAt(value)).toContain("LuauTernaryExpression");
  });

  test.each(VALUE_CASES)("is accepted, as Luau accepts it, in %s", (_, open) => {
    const result = readings(functionText(open));
    expect(result.official, "official Luau parser of projected checker text").toEqual([]);
    expect(result.errors).toEqual([]);
  });

  test.each([
    ["true", "Hello a there.\n"],
    ["false", "Hello b there.\n"],
  ])("is the value a story brace shows when the condition is %s", (value, text) => {
    const { program } = compileScript(`store c = ${value}\nHello {if c then\n"a"\nelse "b"} there.\n`);
    expect(storyBeats(new ProgramStory(program.chunks!)).beats.map((beat) => beat.text)).toEqual([text]);
  });

  test.each([
    ["an if statement's `then`", "if if c then c then"],
    ["a while loop's `do`", "while if c then c do"],
    ["a `then` glued to the value", "if if c then (c)then"],
    ["a `then` glued to a string value", 'if if c then "x"then'],
    ["a `then` after a `:`", "if if c then c:then"],
    ["a `do` after a `:`", "while if c then c:do"],
  ])("leaves %s to the statement and its body outside the arm", (_, line) => {
    const at = offsetOf(line, "\nprint(c)") + 1;
    expect(treeRulesAt(at)).not.toContain("LuauTernaryExpression");
    const keyword = offsetOf(line, line) + line.search(/(?:then|do)$/);
    expect(treeRulesAt(keyword)).not.toContain("LuauTernaryExpression");
  });

  test.each([
    "local y = if c then 1 -- )then",
    "local z = if c then 1 -- ]then",
    'local u = if c then 1 -- "then',
    "local t = if c then 1 -- ...then",
    "local s = if c then 1 -- /gthen",
    "false -- f(x)then",
  ])("leaves the next line outside the arm after %j", (line) => {
    const at = offsetOf(line, "\nprint(c)") + 1;
    expect(treeRulesAt(at)).not.toContain("LuauTernaryExpression");
  });

  test.each([
    ["a local declaration", "function g(c)", "local z = 1", "Expected identifier when parsing expression, got 'local'"],
    ["a return", "function h(c)", "return y", "Expected identifier when parsing expression, got 'return'"],
  ])("leaves the arm empty before %s that begins the next line", (_, open, statement, message) => {
    const at = offsetOf(open, `\n${statement}`) + 1;
    expect(treeRulesAt(at)).not.toContain("LuauTernaryExpression");
    const result = readings(functionText(open));
    expect(result.official).toContain(message);
    expect(result.errors).toContain(message);
  });
});
