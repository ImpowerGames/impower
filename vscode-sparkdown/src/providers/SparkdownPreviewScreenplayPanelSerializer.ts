import * as vscode from "vscode";
import { getVisibleEditor } from "../utils/getVisibleEditor";
import { SparkdownPreviewScreenplayPanelManager } from "./SparkdownPreviewScreenplayPanelManager";

export class SparkdownPreviewScreenplayPanelSerializer
  implements vscode.WebviewPanelSerializer
{
  constructor(private readonly _context: vscode.ExtensionContext) {}

  async deserializeWebviewPanel(
    panel: vscode.WebviewPanel,
    state: { textDocument: { uri: string } }
  ) {
    console.log(state);
    if (state) {
      const documentUri = vscode.Uri.parse(state.textDocument.uri);
      const editor = getVisibleEditor(documentUri);
      if (editor) {
        await SparkdownPreviewScreenplayPanelManager.instance.loadPanel(
          this._context.extensionUri,
          editor.document,
          panel
        );
      }
    }
  }
}
