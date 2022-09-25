import * as vscode from "vscode";
import {
  createPreviewPanel,
  SparkdownPreviewSerializer,
} from "../providers/Preview";

export const activatePreviewPanel = (
  context: vscode.ExtensionContext
): void => {
  // Register live preview
  context.subscriptions.push(
    vscode.commands.registerCommand("sparkdown.livepreview", () => {
      if (vscode.window.activeTextEditor) {
        // Create and show a new dynamic webview for the active text editor
        createPreviewPanel(vscode.window.activeTextEditor, true);
      }
    })
  );
  vscode.window.registerWebviewPanelSerializer(
    "sparkdown-preview",
    new SparkdownPreviewSerializer()
  );
};
