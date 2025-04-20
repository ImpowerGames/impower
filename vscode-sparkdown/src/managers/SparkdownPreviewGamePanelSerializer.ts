import * as vscode from "vscode";
import { getOpenTextDocument } from "../utils/getOpenTextDocument";
import { SparkdownPreviewGamePanelManager } from "./SparkdownPreviewGamePanelManager";

export class SparkdownPreviewGamePanelSerializer
  implements vscode.WebviewPanelSerializer
{
  constructor(private readonly _context: vscode.ExtensionContext) {}

  async deserializeWebviewPanel(
    panel: vscode.WebviewPanel,
    state: { textDocument: { uri: string } }
  ) {
    if (state) {
      const documentUri = vscode.Uri.parse(state.textDocument.uri);
      const document = await getOpenTextDocument(documentUri);
      if (document) {
        await SparkdownPreviewGamePanelManager.instance.initializePanel(
          this._context,
          document,
          panel
        );
      } else {
        panel.dispose();
      }
    }
  }
}
