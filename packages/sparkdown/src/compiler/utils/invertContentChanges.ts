import {
  TextDocument,
  type Position,
  type TextDocumentContentChangeEvent,
} from "vscode-languageserver-textdocument";

const NEWLINE_REGEX = /\r\n|\r|\n/g;

/** Where the end of `text` lands when it is inserted at `start`. */
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

/**
 * The changes that undo `changes` applied to `text`, in the order to apply
 * them.
 *
 * `changes` are sequential, as `textDocument/didChange` delivers them: each is
 * relative to the text the previous one left. Every inverse is a ranged change
 * covering only what its change inserted, so undoing an edit reparses as
 * little as making it did. Inserted text is measured the way
 * `SparkdownDocumentRegistry.update` stores it, with line breaks normalized.
 */
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
