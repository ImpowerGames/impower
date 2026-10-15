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
    // black for good (#1886). The webview saves the script it last showed,
    // but may have saved none (builds before this one never did), or one
    // that can no longer be opened; the preview then starts with the script
    // `Sparkdown: Preview Game` would use, or with none.
    const savedUri = state?.textDocument?.uri;
    const saved = savedUri
      ? await getOpenTextDocument(vscode.Uri.parse(savedUri))
      : undefined;
    const activeUri = getActiveSparkdownDocument();
    const document =
      saved ?? (activeUri ? getEditor(activeUri)?.document : undefined);
    // The manager drives one Game Preview. A workspace can hold two, saved
    // while a black restored tab sat beside one opened with `Sparkdown:
    // Preview Game`, and the command or another restore can open one while
    // the script above is looked up. A panel arriving second is closed rather
    // than take the manager over from the first (#1886). Nothing is awaited
    // between this check and `initializePanel` taking the panel.
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
