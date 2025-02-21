import { ChangeSet, Text } from "@codemirror/state";
import { TextDocumentContentChangeEvent } from "../../../../spark-editor-protocol/src/types";
import { offsetToPosition } from "./offsetToPosition";

export const getServerChanges = (
  beforeDoc: Text,
  afterDoc: Text,
  changes: ChangeSet
): TextDocumentContentChangeEvent[] => {
  let minFromA = Number.MAX_SAFE_INTEGER;
  let maxToA = 0;
  let minFromB = Number.MAX_SAFE_INTEGER;
  let maxToB = 0;
  changes.iterChanges((fromA, toA, fromB, toB) => {
    if (fromA < minFromA) {
      minFromA = fromA;
    }
    if (toA > maxToA) {
      maxToA = toA;
    }
    if (fromB < minFromB) {
      minFromB = fromB;
    }
    if (toB > maxToB) {
      maxToB = toB;
    }
  });
  return [
    {
      range: {
        start: offsetToPosition(beforeDoc, minFromA),
        end: offsetToPosition(beforeDoc, maxToA),
      },
      text: afterDoc.sliceString(minFromB, maxToB),
    },
  ];
};
