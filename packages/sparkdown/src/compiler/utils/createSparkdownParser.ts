import { TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { lookaheadContextStart } from "./lookaheadContextStart";
import { sparkdownGrammarFor } from "./sparkdownGrammarFor";

/**
 * A parser for the Sparkdown grammar whose incremental parses reparse the
 * tokens a lookahead into the edit can have come from. Given a document's
 * uri, it starts on the root that document is read from
 * (`sparkdownGrammarFor`); with none, on the `.sd` root.
 */
export function createSparkdownParser(uri?: string): TextmateGrammarParser {
  const parser = new TextmateGrammarParser(sparkdownGrammarFor(uri));
  parser.lookaheadStart = (input, pos) =>
    lookaheadContextStart(input.read(0, pos), pos);
  return parser;
}
