import PRIMITIVE_TYPE_REGEX from "../constants/PRIMITIVE_TYPE_REGEX";
import { CompilerDiagnostic } from "../types/CompilerDiagnostic";

const defaultCompiler = (
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
  let match: RegExpMatchArray | null = null;
  if ((match = trimmedExpr.match(PRIMITIVE_TYPE_REGEX.string))) {
    return [match[2], diagnostics, references];
  }
  if ((match = trimmedExpr.match(PRIMITIVE_TYPE_REGEX.number))) {
    return [Number(trimmedExpr), diagnostics, references];
  }
  if ((match = trimmedExpr.match(PRIMITIVE_TYPE_REGEX.boolean))) {
    return [trimmedExpr === "true" ? true : false, diagnostics, references];
  }
  if ((match = trimmedExpr.match(PRIMITIVE_TYPE_REGEX.variableAccess))) {
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

export default defaultCompiler;
