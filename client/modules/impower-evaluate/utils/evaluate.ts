import { Compiler } from "../classes/compiler";
import { tokenize } from "./tokenize";

export const evaluate = (
  context: Record<string, string | number | boolean>,
  expr: string
): string | number | boolean => {
  const tokenList = tokenize(expr);
  const compiler = new Compiler(tokenList);
  const astTree = compiler.parse();
  if (astTree == null) {
    throw new Error(`Parse Error: ${expr}`);
  }
  const result = compiler.calc(astTree, context);
  return result;
};
