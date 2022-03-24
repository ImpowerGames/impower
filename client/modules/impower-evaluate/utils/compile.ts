import { Compiler } from "../classes/compiler";
import { CompilerDiagnostic } from "../types/compilerDiagnostic";
import { CompilerReference } from "../types/compilerReference";
import { tokenize } from "./tokenize";

export const compile = (
  expr: string,
  context: Record<string, unknown> = {}
): {
  result: unknown;
  diagnostics: CompilerDiagnostic[];
  references: CompilerReference[];
} => {
  if (!expr) {
    return { result: undefined, diagnostics: [], references: [] };
  }
  let diagnostics: CompilerDiagnostic[] = [];
  let references: CompilerReference[] = [];
  try {
    const [tokenList, tokenDiagnostics] = tokenize(expr);
    const compiler = new Compiler(tokenList);
    const astTree = compiler.parse();
    diagnostics = compiler.diagnostics;
    references = compiler.references;
    tokenDiagnostics?.forEach((d) => {
      diagnostics.push(d);
    });
    if (!astTree) {
      if (diagnostics.length === 0) {
        diagnostics.push({
          content: "",
          from: 0,
          to: expr.length,
          severity: "error",
          type: "parse-error",
          message: `Unable to parse: ${expr}`,
        });
      }
      return { result: undefined, diagnostics, references };
    }
    const result = compiler.calc(astTree, context);
    return {
      result,
      diagnostics: compiler.diagnostics,
      references: compiler.references,
    };
  } catch {
    if (diagnostics.length === 0) {
      diagnostics.push({
        content: "",
        from: 0,
        to: expr.length,
        severity: "error",
        type: "parse-error",
        message: `Invalid expression: ${expr}`,
      });
    }
    return { result: undefined, diagnostics, references };
  }
};
