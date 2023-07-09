import * as vscode from "vscode";
import { SparkdownPreviewScreenplayPanelManager } from "./SparkdownPreviewScreenplayPanelManager";

export class SparkdownPreviewScreenplayPanelSerializer
  implements vscode.WebviewPanelSerializer
{
  constructor(private readonly _context: vscode.ExtensionContext) {}

  async deserializeWebviewPanel(
    panel: vscode.WebviewPanel,
    state: { params: { textDocument: { uri: string } } }
  ) {
    if (state) {
      const documentUri = vscode.Uri.parse(state.params.textDocument.uri);
      await SparkdownPreviewScreenplayPanelManager.instance.loadPanel(
        this._context.extensionUri,
        documentUri,
        panel
      );
    }
  }
}
