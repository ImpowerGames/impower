import { Compiler } from "../classes/Compiler";
import { defaultCompilerConfig } from "../defaults/defaultCompilerConfig";
import { CompilerConfig } from "../types/compilerConfig";
import { tokenize } from "./tokenize";

export const evaluate = (
  expr: string,
  context: Record<string, unknown> = {},
  config: CompilerConfig = defaultCompilerConfig
): unknown => {
  if (!expr) {
    return undefined;
  }
  const [tokenList] = tokenize(expr);
  const compiler = new Compiler(tokenList, config);
  const astTree = compiler.parse();
  if (astTree == null) {
    throw new Error(`Parse Error: ${expr}`);
  }
  const result = compiler.calc(astTree, context);
  return result;
};
