import { ChangeSpec, EditorState, Text } from "@codemirror/state";
import type { Range } from "@impower/spark-editor-protocol/src/types";
import { positionToOffset } from "./positionToOffset";

const NEWLINE_REGEX = /\r\n|\r\n/g;

export const getClientChanges = (
  state: EditorState,
  contentChanges: {
    range?: Range;
    text: string;
  }[]
): ChangeSpec[] => {
  const changes: ChangeSpec[] = [];
  let changeDoc = state.doc;
  contentChanges.forEach(({ range, text }) => {
    const from = range ? positionToOffset(changeDoc, range.start) : 0;
    const to = range
      ? positionToOffset(changeDoc, range.end)
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
