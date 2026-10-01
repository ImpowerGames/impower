// Sparkdown and Luau's parser must agree on which Luau inputs have syntax
// errors (#1284, the first check of #1283).
//
// For every Luau fixture, the document is compiled with `SparkdownCompiler`
// and its syntax errors are collected, and the fixture's Luau is parsed with
// the TypeScript port of Luau's parser (`parseLuau`). Where Sparkdown reports
// no syntax error the parser must report none, and where Sparkdown reports one
// the parser must report at least one.
//
// The inputs are found, not listed (`luauFixtures.ts`), so a fixture added
// under either directory is checked without editing this file. The
// conformance files are Luau as written, so the parser reads the patched file
// itself in the function the harness wraps it in, not text taken from
// Sparkdown's tree: a token the tree loses would otherwise vanish from both
// readings and hide the disagreement.
//
// `KNOWN_DISAGREEMENTS` names the inputs on which the two disagree, each with
// the open issue that explains it. An input on the list must still disagree,
// so the fix for an issue fails this test until its entry is removed, in the
// fix's own pull request.

import "../../inkjs/engine/Container";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { parseLuau } from "../../compiler/typecheck/DefinitionParser";
import { sparkdownUnits } from "../../compiler/typecheck/LuauDocumentChecker";
import { DiagnosticSeverity, type SparkDiagnostic } from "../../compiler/types/SparkDiagnostic";
import { KNOWN_DISAGREEMENTS, luauInputs, type LuauInput } from "./luauFixtures";

const URI = "inmemory:///main.sd";

// Sparkdown's errors that are not about syntax: names that do not resolve or
// collide, where a statement may stand, what a value or a name may be, and the
// `end` of a scene or branch, which is Sparkdown's own structure and lies
// outside the Luau a unit holds. Every other error Sparkdown reports counts as
// a syntax error. A new kind of error that is not about syntax belongs here.
const NOT_SYNTAX: RegExp[] = [
  /^Cannot find /,
  /^Duplicate identifier /,
  /^Return statements can only be used in /,
  /shouldn't be preceded by '->' here\.$/,
  /cannot be used for the name of a function because it's a built in function$/,
  /^A variable must be initialized to /,
  /^(?:Scene|Branch) is missing its closing `end` keyword\./,
];

function messageOf(d: SparkDiagnostic): string {
  return typeof d.message === "string" ? d.message : d.message.value;
}

/**
 * Sparkdown's syntax errors, as `line:character message` in 0-based document
 * lines, and the parser's errors over the input's Luau, as `fixture line N`
 * for a conformance file or `line (unit) message` in document lines for a
 * unit.
 */
function readings({ text, luau: source }: LuauInput): { sparkdown: string[]; luau: string[] } {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  const program = compiler.compile({ textDocument: { uri: URI } } as never).program;
  const sparkdown = (program.diagnostics?.[URI] ?? [])
    .filter((d) => d.severity === DiagnosticSeverity.Error && !NOT_SYNTAX.some((pattern) => pattern.test(messageOf(d))))
    .map((d) => `${d.range.start.line}:${d.range.start.character} ${messageOf(d)}`);
  if (source !== undefined) {
    const luau = parseLuau(source).errors.map((error) => `fixture line ${error.location.begin.line}:${error.location.begin.column} ${error.message}`);
    return { sparkdown, luau };
  }
  const tree = compiler.documents.tree(URI);
  if (!tree) throw new Error("The compiler kept no syntax tree for the document");
  const units = sparkdownUnits(tree, text);
  const luau: string[] = [];
  for (const unit of [units.prelude, ...units.flows]) {
    for (const error of parseLuau(unit.text).errors) {
      const line = unit.lines[error.location.begin.line] ?? "?";
      luau.push(`${line} (${unit.kind}) ${error.message}`);
    }
  }
  return { sparkdown, luau };
}

const ALL_INPUTS = luauInputs();
const known = new Map(KNOWN_DISAGREEMENTS.map((entry) => [entry.fixture, entry]));

describe("Sparkdown and Luau's parser agree on which Luau inputs have syntax errors", () => {
  test("finds the inputs and lists each known disagreement once, for an input that exists", () => {
    expect(ALL_INPUTS.some((input) => input.name.startsWith("grammar/"))).toBe(true);
    expect(ALL_INPUTS.some((input) => input.name.startsWith("conformance/"))).toBe(true);
    const names = new Set(ALL_INPUTS.map((input) => input.name));
    expect(KNOWN_DISAGREEMENTS.filter((entry) => !names.has(entry.fixture)).map((entry) => entry.fixture)).toEqual([]);
    expect(known.size).toBe(KNOWN_DISAGREEMENTS.length);
  });

  for (const input of ALL_INPUTS) {
    test(input.name, () => {
      const { sparkdown, luau } = readings(input);
      const report = [
        `Sparkdown's syntax errors: ${sparkdown.length ? `\n  ${sparkdown.join("\n  ")}` : "none"}`,
        `Luau's parse errors: ${luau.length ? `\n  ${luau.join("\n  ")}` : "none"}`,
      ].join("\n");
      const agree = sparkdown.length > 0 === luau.length > 0;
      const entry = known.get(input.name);
      if (entry) {
        expect(
          agree,
          `${input.name} no longer disagrees. Remove its entry (#${entry.issue}) from KNOWN_DISAGREEMENTS in the pull request that fixed it.\n${report}`,
        ).toBe(false);
      } else {
        expect(
          agree,
          `${input.name}: Sparkdown and Luau's parser disagree on whether it has a syntax error. Fix the disagreement, or add an entry naming the open issue that explains it to KNOWN_DISAGREEMENTS.\n${report}`,
        ).toBe(true);
      }
    }, 120_000);
  }
});
