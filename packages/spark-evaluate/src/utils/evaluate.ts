import SparkExpressionCompiler from "../classes/SparkExpressionCompiler";
import DEFAULT_COMPILER_CONFIG from "../constants/DEFAULT_COMPILER_CONFIG";
import DEFAULT_PARSER from "../constants/DEFAULT_PARSER";

const evaluate = (
  expr: string,
  context: Record<string, unknown> = {},
  config = DEFAULT_COMPILER_CONFIG
): unknown => {
  if (!expr) {
    return undefined;
  }
  try {
    const [node] = DEFAULT_PARSER.parse(expr);
    const compiler = new SparkExpressionCompiler(config);
    const result = compiler.evaluate(node, context);
    return result;
  } catch {}
  return undefined;
};

export default evaluate;
