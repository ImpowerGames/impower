import { ChangeSet, Text } from "@codemirror/state";
import { TextDocumentContentChangeEvent } from "@impower/spark-editor-protocol/src/types";
import { offsetToPosition } from "./offsetToPosition";

export const getServerChanges = (
  doc: Text,
  changes: ChangeSet
): TextDocumentContentChangeEvent[] => {
  const contentChanges: TextDocumentContentChangeEvent[] = [];
  changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    contentChanges.push({
      range: {
        start: offsetToPosition(doc, fromA),
        end: offsetToPosition(doc, toA),
      },
      text: inserted.toString(),
    });
  });
  return contentChanges;
};
