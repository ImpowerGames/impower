import { Lexer } from "../classes/lexer";
import { CompilerToken } from "../types/compilerToken";

export const tokenize = (expression: string): CompilerToken[] => {
  const lexer = new Lexer(expression);
  return lexer.getTokens();
};
