import { Text } from "@codemirror/state";

export const positionToOffset = (
  doc: Text,
  pos: { line: number; character: number }
) => {
  return Math.min(
    doc.length,
    Math.max(0, doc.line(pos.line + 1).from + pos.character)
  );
};
