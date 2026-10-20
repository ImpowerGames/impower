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
    // A restored panel is given its content only here, so one left alone
    // stays empty for good (#1888). It shows the script it saved, opened
    // whether or not an editor shows it; a panel that saved none, or one
    // that can no longer be opened, is closed instead.
    const savedUri = state?.textDocument?.uri;
    const document = savedUri
      ? await getOpenTextDocument(vscode.Uri.parse(savedUri))
      : undefined;
    // The manager drives one Screenplay Preview; a panel arriving while it
    // already has one (a second restored tab, or one opened with the command
    // while the script above was opened) is closed rather than take it over.
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
