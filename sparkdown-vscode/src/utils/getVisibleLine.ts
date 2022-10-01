import * as vscode from "vscode";

/**
 * Get the top-most visible range of `editor`.
 *
 * Returns a fractional line number based the visible character within the line.
 * Floor to get real line number
 */
export function getVisibleLine(editor: vscode.TextEditor): number | undefined {
  if (!editor?.visibleRanges?.length) {
    return undefined;
  }

  const firstVisiblePosition = editor.visibleRanges[0].start;
  const lineNumber = firstVisiblePosition.line;
  const line = editor.document.lineAt(lineNumber);
  const progress =
    firstVisiblePosition.character / ((line?.text?.length || 0) + 2);
  return lineNumber + progress;
}
