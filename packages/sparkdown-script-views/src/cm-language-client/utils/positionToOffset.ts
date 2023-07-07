import { Text } from "@codemirror/state";

export const positionToOffset = (
  doc: Text,
  pos: { line: number; character: number }
) => {
  return doc.line(pos.line + 1).from + pos.character;
};
