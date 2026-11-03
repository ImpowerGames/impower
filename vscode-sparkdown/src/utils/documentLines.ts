import type * as vscode from "vscode";
import type { DocumentLines } from "./routePins";

export const documentLines = (document: vscode.TextDocument): DocumentLines => ({
  lineCount: document.lineCount,
  lineSpan: (line) => {
    const range = document.lineAt(line).range;
    return {
      lineStart: document.offsetAt(range.start),
      lineEnd: document.offsetAt(range.end),
    };
  },
  lineAt: (offset) => document.positionAt(offset).line,
});
