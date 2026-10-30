import { Text } from "@codemirror/state";
import GRAMMAR_DEFINITION from "@impower/sparkdown/language/sparkdown.language-grammar.json";
import { SparkdownCombinedAnnotator } from "@impower/sparkdown/src/compiler/classes/SparkdownCombinedAnnotator";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { TextEdit } from "vscode-languageserver";
import { getDocumentFormattingEdits } from "../../utils/providers/getDocumentFormattingEdits";

let cachedParser: TextmateGrammarParser | undefined;

function getParser(): TextmateGrammarParser {
  if (!cachedParser) {
    cachedParser = new TextmateGrammarParser(GRAMMAR_DEFINITION as any);
  }
  return cachedParser;
}

function applyEdits(doc: SparkdownDocument, edits: TextEdit[]): string {
  const reverse = [...edits].sort(
    (a, b) => doc.offsetAt(b.range.start) - doc.offsetAt(a.range.start),
  );
  let result = doc.getText();
  for (const edit of reverse) {
    const from = doc.offsetAt(edit.range.start);
    const to = doc.offsetAt(edit.range.end);
    result = result.slice(0, from) + edit.newText + result.slice(to);
  }
  return result;
}

export interface FormatOptions {
  tabSize?: number;
  insertSpaces?: boolean;
  trimTrailingWhitespace?: boolean;
  insertFinalNewline?: boolean;
  trimFinalNewlines?: boolean;
}

export function formatSource(
  source: string,
  options: FormatOptions = {},
): string {
  const normalized = source.replace(/\r\n|\r/g, "\n");
  const tree = getParser().parse(normalized);
  const doc = new SparkdownDocument(
    "test://format.sd",
    "sparkdown",
    1,
    normalized,
  );
  const annotators = new SparkdownCombinedAnnotator();
  annotators.create(tree, Text.of(normalized.split("\n")));
  const annotations = annotators.get();

  const edits = getDocumentFormattingEdits(doc, tree, annotations, {
    tabSize: options.tabSize ?? 2,
    insertSpaces: options.insertSpaces ?? true,
    trimTrailingWhitespace: options.trimTrailingWhitespace ?? true,
    insertFinalNewline: options.insertFinalNewline ?? true,
    trimFinalNewlines: options.trimFinalNewlines ?? true,
  });

  if (!edits || edits.length === 0) return source;
  return applyEdits(doc, edits);
}
