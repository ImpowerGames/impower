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
    // The manager drives one Game Preview. A workspace can hold two, saved
    // while a black restored tab sat beside one opened with `Sparkdown:
    // Preview Game`; the later one is closed rather than take the manager
    // over from the first (#1886).
    if (SparkdownPreviewGamePanelManager.instance.panel) {
      panel.dispose();
      return;
    }
    // Otherwise always initialize the panel VS Code restored: a restored
    // panel is given its content and connected only here, so one left alone
    // stays black for good (#1886). The webview may have saved no state (it
    // saves its script once the player is initialized, and builds before
    // this one never did), or a script that can no longer be opened; the
    // preview then starts with the script `Sparkdown: Preview Game` would
    // use, or with none.
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
