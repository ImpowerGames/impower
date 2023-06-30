import { Position, Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

const getLineText = (
  document: TextDocument,
  position: Position,
  lineOffset: number = 0
) =>
  document.getText(
    Range.create(
      position.line + lineOffset,
      0,
      position.line + lineOffset + 1,
      0
    )
  );

export default getLineText;
