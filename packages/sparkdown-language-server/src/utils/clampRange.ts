import type { Range } from "vscode-languageserver";

const clampRange = (
  range: Range,
  lastLineIndex: number,
  lastCharacterInLineIndex: number
) => {
  if (lastLineIndex < range.end.line) {
    range.end.line = lastLineIndex;
    range.end.character = lastCharacterInLineIndex;
  }
};

export default clampRange;
