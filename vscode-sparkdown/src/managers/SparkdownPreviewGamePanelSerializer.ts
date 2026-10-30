import * as vscode from "vscode";
import { getActiveSparkdownDocument } from "../utils/getActiveSparkdownDocument";
import { getEditor } from "../utils/getEditor";
import { getOpenTextDocument } from "../utils/getOpenTextDocument";
import { SparkdownPreviewGamePanelManager } from "./SparkdownPreviewGamePanelManager";

export class SparkdownPreviewGamePanelSerializer
  implements vscode.WebviewPanelSerializer
{
  constructor(private readonly _context: vscode.ExtensionContext) {}

  async deserializeWebviewPanel(
    panel: vscode.WebviewPanel,
    state:
      | { textDocument?: { uri?: string }; canvasHeight?: number }
      | undefined,
  ) {
    const savedUri = state?.textDocument?.uri;
    const saved = savedUri
      ? await getOpenTextDocument(vscode.Uri.parse(savedUri))
      : undefined;
    const activeUri = getActiveSparkdownDocument();
    const document =
      saved ?? (activeUri ? getEditor(activeUri)?.document : undefined);
    if (SparkdownPreviewGamePanelManager.instance.panel) {
      panel.dispose();
      return;
    }
    await SparkdownPreviewGamePanelManager.instance.initializePanel(
      panel,
      this._context,
      document,
      state?.canvasHeight,
    );
  }
}
