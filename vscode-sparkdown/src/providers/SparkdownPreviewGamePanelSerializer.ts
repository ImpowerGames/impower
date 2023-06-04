import * as vscode from "vscode";
import { previewState } from "../state/previewState";
import { getSparkdownConfig } from "../utils/getSparkdownConfig";
import { loadWebView } from "../utils/loadWebview";
import { scrollPreviewToLine } from "../utils/scrollPreviewToLine";

vscode.workspace.onDidChangeConfiguration((change) => {
  previewState.game.forEach((p) => {
    const config = getSparkdownConfig(vscode.Uri.parse(p.uri));
    if (change.affectsConfiguration("sparkdown")) {
      p.panel.webview.postMessage({
        command: "sparkdown.updateconfig",
        content: config,
      });
    }
  });
});

vscode.window.onDidChangeTextEditorSelection((change) => {
  if (change.textEditor.document.languageId === "sparkdown") {
    const config = getSparkdownConfig(change.textEditor.document.uri);
    if (config.game_preview_synchronized_with_cursor) {
      const firstSelection = change.selections[0];
      if (firstSelection) {
        scrollPreviewToLine(
          "game",
          "click",
          firstSelection.active.line,
          change.textEditor
        );
      }
    }
  }
});

export class SparkdownPreviewGamePanelSerializer
  implements vscode.WebviewPanelSerializer
{
  constructor(private readonly _context: vscode.ExtensionContext) {}

  async deserializeWebviewPanel(
    webviewPanel: vscode.WebviewPanel,
    state: { docuri: string; dynamic: boolean }
  ) {
    if (state) {
      const docuri = vscode.Uri.parse(state.docuri);
      await loadWebView(
        "game",
        this._context,
        docuri,
        webviewPanel,
        state.dynamic
      );
    }
  }
}