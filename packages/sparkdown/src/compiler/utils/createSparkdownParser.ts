import { TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import GRAMMAR_DEFINITION from "../../../language/sparkdown.language-grammar.json";
import { lookaheadContextStart } from "./lookaheadContextStart";

/**
 * A parser for the Sparkdown grammar whose incremental parses reparse the
 * tokens a lookahead into the edit can have come from.
 */
export function createSparkdownParser(): TextmateGrammarParser {
  const parser = new TextmateGrammarParser(GRAMMAR_DEFINITION);
  parser.lookaheadStart = (input, pos) =>
    lookaheadContextStart(input.read(0, pos), pos);
  return parser;
}
