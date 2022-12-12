import { Lexer } from "../classes/Lexer";
import { CompilerDiagnostic } from "../types/compilerDiagnostic";
import { CompilerToken } from "../types/compilerToken";

export const tokenize = (
  expression: string
): [CompilerToken[], CompilerDiagnostic[]] => {
  const lexer = new Lexer(expression);
  const tokens = lexer.getTokens();
  return tokens;
};
