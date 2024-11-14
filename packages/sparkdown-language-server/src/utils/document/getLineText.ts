import { Position, Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

const END_NEWLINE_REGEX = /[\r\n]+$/;

export const getLineText = (
  document: TextDocument,
  position: Position,
  lineOffset: number = 0
) => {
  const startLine = position.line + lineOffset;
  if (startLine === -1) {
    return "";
  }
  return document
    .getText(Range.create(startLine, 0, startLine + 1, 0))
    .replace(END_NEWLINE_REGEX, "");
};
