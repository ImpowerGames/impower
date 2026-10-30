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

function isWrapperWarning(d: SparkDiagnostic) {
  return d.code === "FunctionUnused" && d.range?.start.line === 0 && d.range.start.character === "function ".length && diagnosticMessage(d).startsWith("Function 'run' ");
}

export function diagnoseDetailed(source: string): DetailedDiagnostic[] {
  return diagnoseFilesDetailed({ "main.sd": source });
}

export function diagnoseFilesDetailed(
  sources: Record<string, string>,
): (DetailedDiagnostic & { file: string })[] {
  return diagnoseScripts(sources, false);
}

function diagnoseWrapped(source: string): DetailedDiagnostic[] {
  return diagnoseScripts({ "main.sd": source }, true);
}

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

const PARSER_EXCLUDED_LINTS = new Set<LuauLintCode>([
  "LocalUnused", "FunctionUnused", "GlobalUsedAsLocal", "SameLineStatement", "MultiLineStatement",
]);

export function diagnose(source: string): string[] {
  return diagnoseDetailed(source)
    .filter((d) => !PARSER_EXCLUDED_LINTS.has(d.code as LuauLintCode))
    .map((d) => d.message);
}

export function diagnoseInFunction(body: string): string[] {
  return diagnose(`function run()\n${body}\nend\n`);
}

export function diagnoseWithLints(source: string): string[] {
  return diagnoseDetailed(source).map((d) => d.message);
}

export function diagnoseWithLintsInFunction(body: string): string[] {
  return diagnoseWrapped(`function run()\n${body}\nend\n`).map((d) => d.message);
}

export interface Lint {
  line: number;
  message: string;
}

export function lintInFunction(body: string, code?: LuauLintCode): Lint[] {
  return diagnoseWrapped(`function run()${body}\nend\n`)
    .filter((d) => isLint(d) && (code === undefined || d.code === code))
    .map((d) => ({ line: d.range!.start.line, message: d.message }));
}

export function lintMessagesInFunction(body: string, code?: LuauLintCode): string[] {
  return lintInFunction(body, code).map((l) => l.message);
}

export function lintMessages(source: string, code?: LuauLintCode): string[] {
  return diagnoseDetailed(source)
    .filter((d) => isLint(d) && (code === undefined || d.code === code))
    .map((d) => d.message);
}
