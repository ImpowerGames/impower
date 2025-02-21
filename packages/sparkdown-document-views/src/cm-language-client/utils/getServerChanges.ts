import { ChangeSet, Text } from "@codemirror/state";
import { TextDocumentContentChangeEvent } from "../../../../spark-editor-protocol/src/types";
import { offsetToPosition } from "./offsetToPosition";

export const getServerChanges = (
  beforeDoc: Text,
  changes: ChangeSet
): TextDocumentContentChangeEvent[] => {
  const result: TextDocumentContentChangeEvent[] = [];
  let changeDoc = beforeDoc;
  changes.iterChanges((fromA, toA, fromB, _toB, inserted) => {
    const from = fromB;
    const to = fromB + (toA - fromA);
    result.push({
      range: {
        start: offsetToPosition(changeDoc, from),
        end: offsetToPosition(changeDoc, to),
      },
      text: inserted.toString(),
    });
    changeDoc = changeDoc.replace(from, to, inserted);
  });
  return result;
};
