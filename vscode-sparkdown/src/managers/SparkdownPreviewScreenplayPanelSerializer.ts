import * as vscode from "vscode";
import { getEditor } from "../utils/getEditor";
import { SparkdownPreviewScreenplayPanelManager } from "./SparkdownPreviewScreenplayPanelManager";

export class SparkdownPreviewScreenplayPanelSerializer
  implements vscode.WebviewPanelSerializer
{
  constructor(private readonly _context: vscode.ExtensionContext) {}

  async deserializeWebviewPanel(
    panel: vscode.WebviewPanel,
    state: { textDocument: { uri: string } }
  ) {
    if (state) {
      const documentUri = vscode.Uri.parse(state.textDocument.uri);
      const editor = getEditor(documentUri);
      if (editor) {
        await SparkdownPreviewScreenplayPanelManager.instance.initializePanel(
          this._context.extensionUri,
          editor.document,
          panel
        );
      }
    }
  }
}
