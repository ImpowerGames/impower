import { TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { printTree } from "@impower/textmate-grammar-tree/src/tree/utils/printTree";
import GRAMMAR_DEFINITION from "../../../language/sparkdown.language-grammar.json";

let cachedParser: TextmateGrammarParser | undefined;

export function getParser(): TextmateGrammarParser {
  if (!cachedParser) {
    cachedParser = new TextmateGrammarParser(GRAMMAR_DEFINITION as any);
  }
  return cachedParser;
}

export function parseSource(source: string) {
  return getParser().parse(source);
}

export function dumpTree(source: string): string {
  const tree = parseSource(source);
  return printTree(tree, source);
}

const ESC = String.fromCharCode(27);
const ANSI_ESCAPE = new RegExp(ESC + "\\[\\d+(?:;\\d+)*m", "g");

export function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE, "");
}
