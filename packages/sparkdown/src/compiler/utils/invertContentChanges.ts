import {
  TextDocument,
  type Position,
  type TextDocumentContentChangeEvent,
} from "vscode-languageserver-textdocument";

const NEWLINE_REGEX = /\r\n|\r|\n/g;

const endOfInsertion = (start: Position, text: string): Position => {
  const lines = text.split("\n");
  if (lines.length === 1) {
    return { line: start.line, character: start.character + text.length };
  }
  return {
    line: start.line + lines.length - 1,
    character: lines[lines.length - 1]!.length,
  };
};

export const invertContentChanges = (
  text: string,
  changes: readonly TextDocumentContentChangeEvent[],
): TextDocumentContentChangeEvent[] => {
  const scratch = TextDocument.create("", "", 0, text);
  const inverse: TextDocumentContentChangeEvent[] = [];
  let version = 0;
  for (const change of changes) {
    const inserted = change.text.replace(NEWLINE_REGEX, "\n");
    const current = scratch.getText();
    if (!("range" in change)) {
      inverse.unshift({ text: current });
    } else {
      const from = scratch.offsetAt(change.range.start);
      const to = scratch.offsetAt(change.range.end);
      const start = scratch.positionAt(from);
      inverse.unshift({
        range: { start, end: endOfInsertion(start, inserted) },
        text: current.slice(from, to),
      });
    }
    TextDocument.update(
      scratch,
      ["range" in change ? { range: change.range, text: inserted } : { text: inserted }],
      ++version,
    );
  }
  return inverse;
};
