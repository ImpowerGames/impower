// Shared helper for the ports of Luau's parser/compiler DIAGNOSTIC tests
// (`luau/tests/Parser.test.cpp`, `luau/tests/Compiler.test.cpp`) and its
// linter tests (`luau/tests/Linter.test.cpp`). Where the runtime conformance
// harness runs well-formed fixtures to completion, these only compile and
// collect what the diagnostics pipeline says about the source.
//
// Every upstream snippet is a Luau chunk, and sparkdown is a Luau superset
// only inside function bodies (top-level text is narrative), so
// `diagnoseInFunction` wraps the snippet in `function run() ... end` the same
// way the runtime harness does. `diagnose` compiles the source verbatim for
// the few cases that need the top level.
//
// Luau's parser and compiler tests never run its linter, and their snippets
// declare locals and functions only to hold the literal or annotation under
// test, so `diagnose` and `diagnoseInFunction` leave out unused-local,
// unused-function, global-as-local and statement layout lints: valid parser
// controls can intentionally use unread locals, uncalled functions, globals
// one function holds or adjacent statements. Other lints remain to catch
// false warnings in malformed snippets. The linter ports use
// `diagnoseWithLints`, `diagnoseWithLintsInFunction` or `lintInFunction`. The
// wrapper `run` is the harness's, not the snippet's, and nothing calls it, so
// every helper leaves out the FunctionUnused warning on its name, in a
// snippet that writes the wrapper itself too. The helpers that write the
// wrapper themselves (`diagnoseWithLintsInFunction`, `lintInFunction`) also
// leave out the GlobalUsedAsLocal warning for a global only the wrapper
// holds, in the chunk the snippet is upstream no function holds it, unless
// the snippet names a function `run` of its own.
//
// None of those upstream tests runs Luau's type checker either, so no helper
// here reports its warnings; the ports of Luau's type-checker tests in
// `typecheck/` cover them. The syntax errors the checker reports, for a type
// Luau's parser cannot read, are kept: they are parse errors.

import {
  collectLuauLints,
  LUAU_LINT_CODES,
  type LuauLintCode,
} from "../../compiler/lint/collectLuauLints";
import { TYPE_ERROR_KINDS } from "../../compiler/typecheck/Error";
import type { SparkDiagnostic } from "../../compiler/types/SparkDiagnostic";
import { NO_START_SCENE_MESSAGE } from "../../compiler/utils/startScene";
import { testCompiler } from "../engineUnderTest";
import { namesRun, onlyRunIsWrapper } from "./wrapperRun";

/** A diagnostic's message as text, whether the compiler gave it as text or as markup. */
export function diagnosticMessage(d: SparkDiagnostic): string {
  return typeof d.message === "string" ? d.message : d.message.value;
}

export interface DetailedDiagnostic {
  message: string;
  code?: string | number;
  severity?: number;
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

/** The FunctionUnused warning on the name of the wrapper the snippets are
 *  placed in, `function run()` on a script's first line, which nothing
 *  calls. */
function isWrapperWarning(d: SparkDiagnostic) {
  return d.code === "FunctionUnused" && d.range?.start.line === 0 && d.range.start.character === "function ".length && diagnosticMessage(d).startsWith("Function 'run' ");
}

/** Every diagnostic of the compile but the type checker's warnings, the
 *  wrapper's FunctionUnused warning (`isWrapperWarning`) and the error for the
 *  start scene a snippet does not declare, lint warnings included. */
export function diagnoseDetailed(source: string): DetailedDiagnostic[] {
  return diagnoseFilesDetailed({ "main.sd": source });
}

/** As `diagnoseDetailed`, for a project of several scripts keyed by path
 *  (`scripts/chapter.sd`). The first script is compiled; the others under its
 *  folder are part of its project. Each diagnostic names its script's path. */
export function diagnoseFilesDetailed(
  sources: Record<string, string>,
): (DetailedDiagnostic & { file: string })[] {
  return diagnoseScripts(sources, false);
}

/** As `diagnoseDetailed`, for a body this harness placed in the wrapper
 *  itself (`wrapped` below). */
function diagnoseWrapped(source: string): DetailedDiagnostic[] {
  return diagnoseScripts({ "main.sd": source }, true);
}

/** The diagnostics of `diagnoseFilesDetailed`. When the harness wrote the
 *  wrapper itself (`wrapped`) and the reading names no other function `run`
 *  (`onlyRunIsWrapper`), a GlobalUsedAsLocal warning naming `run` is the
 *  wrapper's and is left out too: an upstream snippet is a Luau chunk, whose
 *  globals no function holds when only the wrapper does. */
function diagnoseScripts(
  sources: Record<string, string>,
  wrapped: boolean,
): (DetailedDiagnostic & { file: string })[] {
  const compiler = testCompiler();
  const files = Object.entries(sources).map(([path, text]) => ({
    uri: `inmemory:///${path}`,
    type: "script" as const,
    name: path.replace(/^.*\//, "").replace(/\.sd$/, ""),
    ext: "sd",
    text,
    version: 1,
    languageId: "sparkdown",
  }));
  compiler.configure({ files });
  const result = compiler.compile({ textDocument: { uri: files[0]!.uri } });
  const out: (DetailedDiagnostic & { file: string })[] = [];
  for (const [uri, ds] of Object.entries(result.program.diagnostics ?? {})) {
    let wrapperOnly: boolean | undefined;
    const isWrappers = (d: SparkDiagnostic) => {
      if (!wrapped || d.code !== "GlobalUsedAsLocal" || !namesRun(diagnosticMessage(d))) return false;
      if (wrapperOnly === undefined) {
        const doc = compiler.documents.get(uri);
        const tree = compiler.documents.tree(uri);
        wrapperOnly = !!doc && !!tree && onlyRunIsWrapper(collectLuauLints(tree, (from, to) => doc.read(from, to)).names);
      }
      return wrapperOnly;
    };
    for (const d of ds) {
      if (d.code !== "SyntaxError" && TYPE_ERROR_KINDS.has(String(d.code))) continue;
      if (isWrapperWarning(d) || isWrappers(d)) continue;
      if (diagnosticMessage(d) === NO_START_SCENE_MESSAGE) continue;
      out.push({
        file: uri.replace("inmemory:///", ""),
        message: diagnosticMessage(d),
        code: d.code,
        severity: d.severity,
        range: d.range,
      });
    }
  }
  return out;
}

const LINT_CODES = new Set<string>(LUAU_LINT_CODES);

function isLint(d: DetailedDiagnostic) {
  return LINT_CODES.has(String(d.code));
}

// Exact rules unrelated to the parser/compiler assertions.
const PARSER_EXCLUDED_LINTS = new Set<LuauLintCode>([
  "LocalUnused", "FunctionUnused", "GlobalUsedAsLocal", "SameLineStatement", "MultiLineStatement",
]);

/** Diagnostic messages except unused-local, global-as-local and statement-layout lints. */
export function diagnose(source: string): string[] {
  return diagnoseDetailed(source)
    .filter((d) => !PARSER_EXCLUDED_LINTS.has(d.code as LuauLintCode))
    .map((d) => d.message);
}

export function diagnoseInFunction(body: string): string[] {
  return diagnose(`function run()\n${body}\nend\n`);
}

/** The messages of every diagnostic, lint warnings included. */
export function diagnoseWithLints(source: string): string[] {
  return diagnoseDetailed(source).map((d) => d.message);
}

export function diagnoseWithLintsInFunction(body: string): string[] {
  return diagnoseWrapped(`function run()\n${body}\nend\n`).map((d) => d.message);
}

export interface Lint {
  /** 0-based line within `body`, the numbering Luau's linter tests check. */
  line: number;
  message: string;
}

/** The lint warnings for `body` placed in a function, in source order.
 *  Upstream snippets begin with a newline, so a line number here is the
 *  0-based line the upstream test checks. */
export function lintInFunction(body: string, code?: LuauLintCode): Lint[] {
  return diagnoseWrapped(`function run()${body}\nend\n`)
    .filter((d) => isLint(d) && (code === undefined || d.code === code))
    .map((d) => ({ line: d.range!.start.line, message: d.message }));
}

export function lintMessagesInFunction(body: string, code?: LuauLintCode): string[] {
  return lintInFunction(body, code).map((l) => l.message);
}

/** The messages of the lint warnings for `source` as a whole script, in
 *  source order, for a snippet whose globals the wrapper would hold. */
export function lintMessages(source: string, code?: LuauLintCode): string[] {
  return diagnoseDetailed(source)
    .filter((d) => isLint(d) && (code === undefined || d.code === code))
    .map((d) => d.message);
}
