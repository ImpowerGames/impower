import { type Position } from "vscode-languageserver";
import { type TextDocument } from "vscode-languageserver-textdocument";

export const getLineTextAfter = (
  document: TextDocument,
  position: Position
) => {
  const docText = document.getText({
    start: {
      line: position.line,
      character: position.character,
    },
    end: {
      line: position.line + 1,
      character: 0,
    },
  });
  return docText;
};
