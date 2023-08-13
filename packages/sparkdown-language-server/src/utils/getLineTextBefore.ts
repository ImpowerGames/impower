import { Position } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

const getLineTextBefore = (document: TextDocument, position: Position) => {
  const docText = document.getText({
    start: {
      line: position.line,
      character: 0,
    },
    end: {
      line: position.line,
      character: position.character,
    },
  });
  return docText;
};

export default getLineTextBefore;
