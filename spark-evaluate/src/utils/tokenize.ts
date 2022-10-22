import { CompilerDiagnostic } from "../types/compilerDiagnostic";
import { CompilerToken } from "../types/compilerToken";

export const tokenize = (
  expression: string
): [CompilerToken[], CompilerDiagnostic[]] => {
  //  const lexer = new Lexer(expression);
  // return lexer.getTokens();
  return [[], []];
};
