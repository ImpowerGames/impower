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
    // Always initialize the panel VS Code restored: a restored panel is
    // given its content and connected only here, so one left alone stays
    // black for good (#1886). The webview may have saved no state (it saves
    // only once its game has started or resized), or a script that can no
    // longer be opened; the preview then starts with the script
    // `Sparkdown: Preview Game` would use, or with none.
    const savedUri = state?.textDocument?.uri;
    const saved = savedUri
      ? await getOpenTextDocument(vscode.Uri.parse(savedUri))
      : undefined;
    const activeUri = getActiveSparkdownDocument();
    const document =
      saved ?? (activeUri ? getEditor(activeUri)?.document : undefined);
    await SparkdownPreviewGamePanelManager.instance.initializePanel(
      panel,
      this._context,
      document,
      state?.canvasHeight,
    );
  }
}
