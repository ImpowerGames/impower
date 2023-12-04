import { SparkExpressionCompiler } from "../classes/SparkExpressionCompiler";
import { DEFAULT_COMPILER_CONFIG } from "../constants/DEFAULT_COMPILER_CONFIG";
import { DEFAULT_PARSER } from "../constants/DEFAULT_PARSER";
import { Diagnostic } from "../types/Diagnostic";

export const compile = (
  expr: string,
  context: Record<string, unknown> = {},
  config = DEFAULT_COMPILER_CONFIG
): [unknown, Diagnostic[], Diagnostic[]] => {
  let diagnostics: Diagnostic[] = [];
  let references: Diagnostic[] = [];
  if (!expr) {
    return [undefined, diagnostics, references];
  }
  try {
    const [node] = DEFAULT_PARSER.parse(expr);
    const compiler = new SparkExpressionCompiler(config);
    const result = compiler.evaluate(node, context);
    return [result, compiler.diagnostics, compiler.references];
  } catch (e) {
    const error = e as {
      message: string;
      position?: number;
      node?: { from: number; to: number };
    };
    const from = error.position || error.node?.from || 0;
    const to = error.position || error.node?.to || 0;
    diagnostics.push({
      content: "",
      from,
      to,
      severity: "error",
      message: error.message,
    });
  }
  return [undefined, diagnostics, references];
};
