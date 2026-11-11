import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { type EditorState } from "@codemirror/state";
import { type Tree } from "@lezer/common";
import { type LanguageReader } from "@impower/textmate-grammar-tree/src/tree/utils/createLanguageReader";

const PARSE_TIMEOUT_MS = 100;

export const treeReachingLine = (state: EditorState, pos: number): Tree =>
  ensureSyntaxTree(state, state.doc.lineAt(pos).to, PARSE_TIMEOUT_MS) ??
  syntaxTree(state);

export const languageAt = (
  reader: LanguageReader,
  state: EditorState,
  pos: number,
  documentLanguage: string,
): string =>
  reader.cursor(treeReachingLine(state, pos), state.doc, pos, documentLanguage);

export const configOf = <T>(
  configs: Readonly<Record<string, T>>,
  language: string,
  documentLanguage: string,
): T | undefined => configs[language] ?? configs[documentLanguage];

export interface LanguageRun {
  language: string;
  from: number;
  to: number;
  startsLine: boolean;
  differsFromLineStart: boolean;
}

export const languageRunAt = (
  reader: LanguageReader,
  state: EditorState,
  pos: number,
  documentLanguage: string,
): LanguageRun => {
  const tree = treeReachingLine(state, pos);
  const line = state.doc.lineAt(pos);
  const language = reader.cursor(tree, state.doc, pos, documentLanguage);
  if (line.from === line.to) {
    return {
      language,
      from: line.from,
      to: line.to,
      startsLine: true,
      differsFromLineStart: false,
    };
  }
  const at = (offset: number) =>
    reader.character(tree, offset, documentLanguage);
  const start = Math.min(Math.max(pos, line.from), line.to - 1);
  let from = start;
  while (from > line.from && at(from - 1) === language) {
    from--;
  }
  let to = start + 1;
  while (to < line.to && at(to) === language) {
    to++;
  }
  const startsLine = from === line.from;
  return {
    language,
    from,
    to,
    startsLine,
    differsFromLineStart: !startsLine && at(line.from) !== language,
  };
};
