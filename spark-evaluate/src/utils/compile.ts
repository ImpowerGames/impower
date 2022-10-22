import { Compiler } from "../classes/Compiler";
import { defaultCompilerConfig } from "../defaults/defaultCompilerConfig";
import { CompilerConfig } from "../types/compilerConfig";
import { CompilerDiagnostic } from "../types/compilerDiagnostic";
import { CompilerReference } from "../types/compilerReference";
import { tokenize } from "./tokenize";

export const compile = (
  expr: string,
  context: Record<string, unknown> = {},
  config: CompilerConfig = defaultCompilerConfig
): [unknown, CompilerDiagnostic[], CompilerReference[]] => {
  let diagnostics: CompilerDiagnostic[] = [];
  let references: CompilerReference[] = [];
  if (!expr) {
    return [undefined, diagnostics, references];
  }
  try {
    const [tokenList, tokenDiagnostics] = tokenize(expr);
    const compiler = new Compiler(tokenList, config);
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
      return [undefined, diagnostics, references];
    }
    const result = compiler.calc(astTree, context);
    return [result, compiler.diagnostics, compiler.references];
  } catch (e) {
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
  }
  return [undefined, diagnostics, references];
};
