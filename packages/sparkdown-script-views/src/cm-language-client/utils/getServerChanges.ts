import { ChangeSet, Text } from "@codemirror/state";
import {
  Range,
  TextDocumentContentChangeEvent,
} from "vscode-languageserver-protocol";
import { offsetToPosition } from "./offsetToPosition";

export const getServerChanges = (
  doc: Text,
  changes: ChangeSet
): TextDocumentContentChangeEvent[] => {
  const contentChanges: TextDocumentContentChangeEvent[] = [];
  changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    contentChanges.push({
      range: Range.create(
        offsetToPosition(doc, fromA),
        offsetToPosition(doc, toA)
      ),
      text: inserted.toString(),
    });
  });
  return contentChanges;
};
