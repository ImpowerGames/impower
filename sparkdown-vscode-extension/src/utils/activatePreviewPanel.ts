import * as vscode from "vscode";
import { SparkdownPreviewGamePanelSerializer } from "../providers/SparkdownPreviewGamePanelSerializer";
import { SparkdownPreviewScreenplayPanelSerializer } from "../providers/SparkdownPreviewScreenplayPanelSerializer";
import { createPreviewPanel } from "./createPreviewPanel";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { getEditor } from "./getEditor";

export const activatePreviewPanel = (
  context: vscode.ExtensionContext,
  type: "screenplay" | "game"
): void => {
  // Register screenplay preview
  context.subscriptions.push(
    vscode.commands.registerCommand(`sparkdown.preview${type}`, () => {
      const uri = getActiveSparkdownDocument();
      if (!uri) {
        return;
      }
      const editor = getEditor(uri);
      if (!editor) {
        return;
      }
      // Create and show a new dynamic webview for the active text editor
      createPreviewPanel(type, context.extension, editor, true);
    })
  );
  if (type === "screenplay") {
    vscode.window.registerWebviewPanelSerializer(
      `sparkdown-preview-screenplay`,
      new SparkdownPreviewScreenplayPanelSerializer(context.extension)
    );
  }
  if (type === "game") {
    vscode.window.registerWebviewPanelSerializer(
      `sparkdown-preview-game`,
      new SparkdownPreviewGamePanelSerializer(context.extension)
    );
  }
};
