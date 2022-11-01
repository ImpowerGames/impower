import * as vscode from "vscode";
import { editorState } from "../state/editorState";
import { previewState } from "../state/previewState";

export const scrollPreviewToLine = (
  type: "screenplay" | "game",
  source: "click" | "scroll",
  line: number,
  editor: vscode.TextEditor
): void => {
  if (editorState.isScrolling) {
    editorState.isScrolling = false;
    return;
  }
  previewState[type].forEach((p) => {
    if (p.uri === editor.document.uri.toString()) {
      p.panel.webview.postMessage({
        command: "sparkdown.showsourceline",
        content: line,
        linescount: editor.document.lineCount,
        source,
      });
    }
  });
};
