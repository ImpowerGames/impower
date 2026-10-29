// The two readings of a Luau input that the syntax-agreement oracle (#1284)
// and the Luau corpus gate (#1908) compare: Sparkdown's syntax errors from a
// compile of the document, and the official parser's errors over its Luau.

import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { officialSyntaxErrors } from "./officialSyntax";
import { checkerTextUnits, rawIslandSyntaxErrors } from "./luauCheckerText";
import { DiagnosticSeverity, type SparkDiagnostic } from "../../compiler/types/SparkDiagnostic";
import type { LuauInput } from "./luauFixtures";

const URI = "inmemory:///main.sd";

// Sparkdown's errors that are not about syntax: names that do not resolve or
// collide, where a statement may stand, what a value or a name may be, and the
// `end` of a scene or branch, which is Sparkdown's own structure and lies
// outside the Luau a unit holds. Every other error Sparkdown reports counts as
// a syntax error. A new kind of error that is not about syntax belongs here.
export const NOT_SYNTAX: RegExp[] = [
  /^Cannot find /,
  /^Duplicate identifier /,
  /^Return statements can only be used (?:in |inside a function body)/,
  /shouldn't be preceded by '->' here\.$/,
  /cannot be used for the name of a function because it's a built in function$/,
  /^A variable must be initialized to /,
  /^(?:Scene|Branch) is missing its closing `end` keyword\./,
  // What a script's top level holds, and the scene the story starts in.
  /^statement must be inside a scene or branch; /,
  /^no scene named start; /,
  /^scene start cannot take parameters; /,
  // A construct the program cannot compile (`unsupportedConstructMessage`).
  /^`external` functions are not supported: /,
  /^A function can't be diverted to: /,
  /^This statement cannot be compiled: /,
  // A compile that stopped, such as at a `store` whose value raises an error
  // when the declarations run (`reportCompileThrow`).
  /^The compile stopped /,
  // A sequential alternator's head, which takes no value (I-1446).
  /takes no value before its first `\|`/,
];

export function messageOf(d: SparkDiagnostic): string {
  return typeof d.message === "string" ? d.message : d.message.value;
}

/**
 * Sparkdown's syntax errors, as `line:character message` in 0-based document
 * lines, and the parser's errors over the input's Luau, as `fixture line N`
 * for a conformance file or `line (unit) message` in document lines for a
 * unit.
 */
export function readings({ text, luau: source }: LuauInput): { sparkdown: string[]; luau: string[] } {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  const program = compiler.compile({ textDocument: { uri: URI } } as never).program;
  const sparkdown = (program.diagnostics?.[URI] ?? [])
    .filter((d) => d.severity === DiagnosticSeverity.Error && !NOT_SYNTAX.some((pattern) => pattern.test(messageOf(d))))
    .map((d) => `${d.range.start.line}:${d.range.start.character} ${messageOf(d)}`);
  if (source !== undefined) {
    const luau = officialSyntaxErrors(source).map((error) => `fixture line ${error.location.begin.line}:${error.location.begin.column} ${error.message}`);
    return { sparkdown, luau };
  }
  const tree = compiler.documents.tree(URI);
  if (!tree) throw new Error("The compiler kept no syntax tree for the document");
  const units = checkerTextUnits(tree, text);
  const luau: string[] = [];
  for (const unit of [units.prelude, ...units.flows]) {
    for (const error of rawIslandSyntaxErrors(unit)) {
      luau.push(`${error.range.start.line}:${error.range.start.character} (${unit.kind} written island) ${error.message}`);
    }
    for (const error of officialSyntaxErrors(unit.text)) {
      const line = unit.lines[error.location.begin.line] ?? "?";
      luau.push(`${line} (${unit.kind}) ${error.message}`);
    }
  }
  return { sparkdown, luau };
}
