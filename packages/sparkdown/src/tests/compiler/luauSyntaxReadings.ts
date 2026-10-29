import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { officialSyntaxErrors } from "./officialSyntax";
import { checkerTextUnits, rawIslandSyntaxErrors } from "./luauCheckerText";
import { DiagnosticSeverity, type SparkDiagnostic } from "../../compiler/types/SparkDiagnostic";
import type { LuauInput } from "./luauFixtures";

const URI = "inmemory:///main.sd";

export const NOT_SYNTAX: RegExp[] = [
  /^Cannot find /,
  /^Duplicate identifier /,
  /^Return statements can only be used (?:in |inside a function body)/,
  /shouldn't be preceded by '->' here\.$/,
  /cannot be used for the name of a function because it's a built in function$/,
  /^A variable must be initialized to /,
  /^(?:Scene|Branch) is missing its closing `end` keyword\./,
  /^`external` functions are not supported: /,
  /^A function can't be diverted to: /,
  /^This statement cannot be compiled: /,
  /^The compile stopped /,
  /takes no value before its first `\|`/,
];

export function messageOf(d: SparkDiagnostic): string {
  return typeof d.message === "string" ? d.message : d.message.value;
}

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
