import { Position, Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

const getLineText = (document: TextDocument, position: Position) =>
  document.getText(Range.create(position.line, 0, position.line + 1, 0));

export default getLineText;
