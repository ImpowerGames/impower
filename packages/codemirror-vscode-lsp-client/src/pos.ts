import { ChangeSet, ChangeSpec, EditorState, Text } from "@codemirror/state";
import type * as lsp from "vscode-languageserver-protocol";

export function convertToPosition(doc: Text, pos: number): lsp.Position {
  let line = doc.lineAt(pos);
  return { line: line.number - 1, character: pos - line.from };
}

export function convertFromPosition(doc: Text, pos: lsp.Position): number {
  // Clamp to the document's bounds. LSP positions can legitimately arrive
  // stale — e.g. a range computed against a previous, longer version of
  // the document, or a cross-file coordinate — and `doc.line()` throws a
  // RangeError on an out-of-range line. That must not propagate and break
  // the consumer (the screenplay preview's selectRange crashed the whole
  // preview render this way). Map an out-of-bounds position to the nearest
  // valid offset instead.
  const lineNumber = Math.min(Math.max(pos.line + 1, 1), doc.lines);
  const line = doc.line(lineNumber);
  const character = Math.min(Math.max(pos.character, 0), line.length);
  return line.from + character;
}

export function convertToChangeEvents(
  startDoc: Text,
  changes: ChangeSet,
): lsp.TextDocumentContentChangeEvent[] {
  const result: lsp.TextDocumentContentChangeEvent[] = [];
  let changeDoc = startDoc;
  changes.iterChanges((fromA, toA, fromB, _toB, inserted) => {
    const from = fromB;
    const to = fromB + (toA - fromA);
    result.push({
      range: {
        start: convertToPosition(changeDoc, from),
        end: convertToPosition(changeDoc, to),
      },
      text: inserted.toString(),
    });
    changeDoc = changeDoc.replace(from, to, inserted);
  });
  return result;
}

const NEWLINE_REGEX = /\r\n|\r\n/g;

export const convertFromServerChangeEvents = (
  state: EditorState,
  contentChanges: {
    range?: lsp.Range;
    text: string;
  }[],
): ChangeSpec[] => {
  const changes: ChangeSpec[] = [];
  let changeDoc = state.doc;
  contentChanges.forEach(({ range, text }) => {
    const from = range ? convertFromPosition(changeDoc, range.start) : 0;
    const to = range
      ? convertFromPosition(changeDoc, range.end)
      : changeDoc.length;
    const lines = text.replace(NEWLINE_REGEX, "\n").split("\n");
    const textObj = Text.of(lines);
    changes.push({
      from,
      to,
      insert: textObj,
    });
    changeDoc = changeDoc.replace(from, to, textObj);
  });
  return changes;
};
