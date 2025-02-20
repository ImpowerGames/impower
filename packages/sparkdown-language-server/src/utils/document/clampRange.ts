import { type Range } from "vscode-languageserver";
import { type TextDocument } from "vscode-languageserver-textdocument";

export const clampRange = (document: TextDocument, range: Range) => {
  const lastLineIndex = document.lineCount - 1;
  const lastCharacterInLineIndex = document.positionAt(
    Number.MAX_SAFE_INTEGER
  ).character;
  if (lastLineIndex < range.end.line) {
    range.end.line = lastLineIndex;
    range.end.character = lastCharacterInLineIndex;
  }
};
