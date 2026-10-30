import { TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { lookaheadContextStart } from "./lookaheadContextStart";
import { sparkdownGrammarFor } from "./sparkdownGrammarFor";

export function createSparkdownParser(uri?: string): TextmateGrammarParser {
  const parser = new TextmateGrammarParser(sparkdownGrammarFor(uri));
  parser.lookaheadStart = (input, pos) =>
    lookaheadContextStart(input.read(0, pos), pos);
  return parser;
}
