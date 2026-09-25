// Shared helper for the ports of Luau's parser/compiler DIAGNOSTIC tests
// (`luau/tests/Parser.test.cpp`, `luau/tests/Compiler.test.cpp`). Where the
// runtime conformance harness runs well-formed fixtures to completion, these
// only compile and collect what the diagnostics pipeline says about malformed
// source.
//
// Every upstream snippet is a Luau chunk, and sparkdown is a Luau superset
// only inside function bodies (top-level text is narrative), so
// `diagnoseInFunction` wraps the snippet in `function run() ... end` the same
// way the runtime harness does. `diagnose` compiles the source verbatim for
// the few cases that need the top level.

import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

export interface DetailedDiagnostic {
  message: string;
  code?: string | number;
  severity?: number;
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

export function diagnoseDetailed(source: string): DetailedDiagnostic[] {
  const compiler = new SparkdownCompiler();
  const uri = "inmemory:///main.sd";
  compiler.configure({
    files: [
      {
        uri,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const result = compiler.compile({ textDocument: { uri } });
  const out: DetailedDiagnostic[] = [];
  for (const ds of Object.values(result.program.diagnostics ?? {})) {
    for (const d of ds as any[]) {
      out.push({
        message:
          typeof d?.message === "string" ? d.message : (d?.message?.value ?? ""),
        code: d?.code,
        severity: d?.severity,
        range: d?.range,
      });
    }
  }
  return out;
}

export function diagnose(source: string): string[] {
  return diagnoseDetailed(source).map((d) => d.message);
}

export function diagnoseInFunction(body: string): string[] {
  return diagnose(`function run()\n${body}\nend\n`);
}

// The rules `collectLuauLints` implements, which it stamps as the code.
const LINT_CODES = new Set([
  "LocalUnused",
  "UnreachableCode",
  "DuplicateCondition",
  "ForRange",
]);

export interface Lint {
  /** 0-based line within `body`, the numbering Luau's linter tests check. */
  line: number;
  message: string;
}

/** The lint warnings for `body` placed in a function, in source order.
 *  Upstream snippets begin with a newline, so a line number here is the
 *  0-based line the upstream test checks. */
export function lintInFunction(body: string): Lint[] {
  return diagnoseDetailed(`function run()${body}\nend\n`)
    .filter((d) => LINT_CODES.has(String(d.code)))
    .map((d) => ({ line: d.range!.start.line, message: d.message }));
}

export function lintMessagesInFunction(body: string): string[] {
  return lintInFunction(body).map((l) => l.message);
}
