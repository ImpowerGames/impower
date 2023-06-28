import { SPARK_REGEX } from "../constants/SPARK_REGEX";
import { CompilerDiagnostic } from "../types/CompilerDiagnostic";

export const defaultCompiler = (
  expr: string,
  context?: Record<string, unknown>
): [unknown, CompilerDiagnostic[], CompilerDiagnostic[]] => {
  let diagnostics: CompilerDiagnostic[] = [];
  let references: CompilerDiagnostic[] = [];
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
  if (trimmedExpr.match(SPARK_REGEX.string)) {
    return [trimmedExpr.slice(1, -1), diagnostics, references];
  }
  if (trimmedExpr.match(SPARK_REGEX.number)) {
    return [Number(trimmedExpr), diagnostics, references];
  }
  if (trimmedExpr.match(SPARK_REGEX.boolean)) {
    return [trimmedExpr === "true" ? true : false, diagnostics, references];
  }
  if (trimmedExpr.match(SPARK_REGEX.variableAccess)) {
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
