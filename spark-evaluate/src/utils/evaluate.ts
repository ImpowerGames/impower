import { Compiler } from "../classes/Compiler";
import { tokenize } from "./tokenize";

export const evaluate = (
  expr: string,
  context: Record<string, unknown> = {}
): unknown => {
  const [tokenList] = tokenize(expr);
  const compiler = new Compiler(tokenList);
  const astTree = compiler.parse();
  if (astTree == null) {
    throw new Error(`Parse Error: ${expr}`);
  }
  const result = compiler.calc(astTree, context);
  return result;
};
