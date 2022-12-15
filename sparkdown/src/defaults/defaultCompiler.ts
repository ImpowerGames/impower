import { sparkRegexes } from "../constants/sparkRegexes";
import { CompilerDiagnostic } from "../types/CompilerDiagnostic";
import { CompilerReference } from "../types/CompilerReference";

export const defaultCompiler = (
  expr: string,
  context?: Record<string, unknown>
): [unknown, CompilerDiagnostic[], CompilerReference[]] => {
  let diagnostics: CompilerDiagnostic[] = [];
  let references: CompilerReference[] = [];
  if (!expr) {
    return [undefined, diagnostics, references];
  }
  const trimmedExpr = expr.trim();
  if (!trimmedExpr) {
    return [undefined, diagnostics, references];
  }
  const content = expr;
  const from = expr.length - expr.trimStart().length;
  const to = from + trimmedExpr.length;
  if (trimmedExpr.match(sparkRegexes.string)) {
    return [trimmedExpr.slice(1, -1), diagnostics, references];
  }
  if (trimmedExpr.match(sparkRegexes.number)) {
    return [Number(trimmedExpr), diagnostics, references];
  }
  if (trimmedExpr.match(sparkRegexes.boolean)) {
    return [trimmedExpr === "true" ? true : false, diagnostics, references];
  }
  if (trimmedExpr.match(sparkRegexes.variableAccess)) {
    const result = context?.[trimmedExpr];
    if (result === undefined) {
      diagnostics.push({
        content,
        from,
        to,
        severity: "error",
        message: `Cannot find variable named '${trimmedExpr}'`,
      });
    }
    return [result, diagnostics, references];
  }
  diagnostics.push({
    content,
    from,
    to,
    severity: "error",
    message: `unknown token from input string ${trimmedExpr}`,
  });
  return [undefined, diagnostics, references];
};
