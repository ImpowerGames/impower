import * as vscode from "vscode";
import { previewState } from "../state/previewState";
import { getSparkdownConfig } from "../utils/getSparkdownConfig";
import { loadWebView } from "../utils/loadWebview";
import { scrollPreviewToLine } from "../utils/scrollPreviewToLine";

vscode.workspace.onDidChangeConfiguration((change) => {
  previewState.screenplay.forEach((p) => {
    const config = getSparkdownConfig(vscode.Uri.parse(p.uri));
    if (change.affectsConfiguration("sparkdown")) {
      p.panel.webview.postMessage({ command: "updateconfig", content: config });
    }
  });
});

vscode.window.onDidChangeTextEditorSelection((change) => {
  if (change.textEditor.document.languageId === "sparkdown") {
    const config = getSparkdownConfig(change.textEditor.document.uri);
    if (config.screenplay_preview_synchronized_with_cursor) {
      const firstSelection = change.selections[0];
      if (firstSelection) {
        scrollPreviewToLine(
          "screenplay",
          "click",
          firstSelection.active.line,
          change.textEditor
        );
      }
    }
  }
});

export class SparkdownPreviewScreenplayPanelSerializer
  implements vscode.WebviewPanelSerializer
{
  constructor(private readonly _extension: vscode.Extension<unknown>) {}

  async deserializeWebviewPanel(
    webviewPanel: vscode.WebviewPanel,
    state: { docuri: string; dynamic: boolean }
  ) {
    if (state) {
      const docuri = vscode.Uri.parse(state.docuri);
      loadWebView(
        "screenplay",
        this._extension,
        docuri,
        webviewPanel,
        state.dynamic
      );
    }
  }
}
