import * as vscode from "vscode";
import { getOpenTextDocument } from "../utils/getOpenTextDocument";
import { SparkdownPreviewScreenplayPanelManager } from "./SparkdownPreviewScreenplayPanelManager";

export class SparkdownPreviewScreenplayPanelSerializer
  implements vscode.WebviewPanelSerializer
{
  constructor(private readonly _context: vscode.ExtensionContext) {}

  async deserializeWebviewPanel(
    panel: vscode.WebviewPanel,
    state: { textDocument?: { uri?: string } } | undefined,
  ) {
    const savedUri = state?.textDocument?.uri;
    const document = savedUri
      ? await getOpenTextDocument(vscode.Uri.parse(savedUri))
      : undefined;
    if (!document || SparkdownPreviewScreenplayPanelManager.instance.panel) {
      panel.dispose();
      return;
    }
    await SparkdownPreviewScreenplayPanelManager.instance.initializePanel(
      this._context,
      document,
      panel,
    );
  }
}
