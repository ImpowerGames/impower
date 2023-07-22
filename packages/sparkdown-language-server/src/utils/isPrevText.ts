import { Position } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

const isPrevText = (
  document: TextDocument,
  position: Position,
  text: string
) => {
  return (
    document.getText({
      start: {
        line: position.line,
        character: Math.max(0, position.character - text.length - 1),
      },
      end: {
        line: position.line,
        character: Math.max(0, position.character - 1),
      },
    }) === text
  );
};

export default isPrevText;
