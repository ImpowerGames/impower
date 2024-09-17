import { Text } from "@codemirror/state";

export const positionToOffset = (
  doc: Text,
  pos: { line: number; character: number }
) => {
  const validLineNumber = Math.min(doc.lines, pos.line + 1);
  return Math.min(
    doc.length,
    Math.max(0, doc.line(validLineNumber).from + pos.character)
  );
};
