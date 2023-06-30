import { Text } from "@codemirror/state";

export const positionToOffset = (
  doc: Text,
  pos: { line: number; character: number }
) => {
  if (pos.line >= doc.lines) {
    return doc.length - 1;
  }
  const offset = doc.line(pos.line + 1).from + pos.character;
  if (offset >= doc.length) {
    return doc.length - 1;
  }
  return offset;
};
