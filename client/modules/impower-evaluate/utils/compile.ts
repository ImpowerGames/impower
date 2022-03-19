import { Compiler } from "../classes/compiler";
import { CompilerDiagnostic } from "../types/compilerDiagnostic";
import { CompilerReference } from "../types/compilerReference";
import { tokenize } from "./tokenize";

export const compile = (
  context: Record<string, string | number | boolean>,
  expr: string
): {
  result: string | number | boolean;
  diagnostics: CompilerDiagnostic[];
  references: CompilerReference[];
} => {
  let diagnostics: CompilerDiagnostic[] = [];
  let references: CompilerReference[] = [];
  try {
    const tokenList = tokenize(expr);
    const compiler = new Compiler(tokenList);
    const astTree = compiler.parse();
    diagnostics = compiler.diagnostics;
    references = compiler.references;
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
