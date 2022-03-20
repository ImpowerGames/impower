import { CompilerDiagnostic } from "..";
import { Lexer } from "../classes/lexer";
import { CompilerToken } from "../types/compilerToken";

export const tokenize = (
  expression: string
): [CompilerToken[], CompilerDiagnostic[]] => {
  const lexer = new Lexer(expression);
  return lexer.getTokens();
};
