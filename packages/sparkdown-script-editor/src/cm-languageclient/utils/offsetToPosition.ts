import { Text } from "@codemirror/state";

export const offsetToPosition = (doc: Text, offset: number) => {
  const line = doc.lineAt(offset);
  return {
    line: line.number - 1,
    character: offset - line.from,
  };
};
