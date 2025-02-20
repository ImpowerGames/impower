import { type Position } from "vscode-languageserver";
import { type TextDocument } from "vscode-languageserver-textdocument";

export const getCharText = (
  document: TextDocument,
  position: Position,
  charOffset: number = 0
) => {
  return document.getText({
    start: {
      line: position.line,
      character: Math.max(0, position.character + charOffset - 1),
    },
    end: {
      line: position.line,
      character: Math.max(0, position.character + charOffset),
    },
  });
};
