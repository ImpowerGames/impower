import { ChangeSpec, Text } from "@codemirror/state";
import type { Range } from "@impower/spark-editor-protocol/src/types";
import { positionToOffset } from "./positionToOffset";

export const getClientChanges = (
  doc: Text,
  contentChanges: {
    range?: Range;
    text: string;
  }[]
): ChangeSpec[] => {
  const changes: ChangeSpec[] = [];
  contentChanges.forEach(({ range, text }) => {
    const from = range ? positionToOffset(doc, range.start) : 0;
    const to = range ? positionToOffset(doc, range.end) : doc.length;
    changes.push({
      from: from < 0 ? 0 : from,
      to: to < 0 ? undefined : to,
      insert: text,
    });
  });
  return changes;
};
