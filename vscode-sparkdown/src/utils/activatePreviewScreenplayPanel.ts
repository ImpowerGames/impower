import * as vscode from "vscode";
import { SparkdownPreviewScreenplayPanelManager } from "../providers/SparkdownPreviewScreenplayPanelManager";
import { SparkdownPreviewScreenplayPanelSerializer } from "../providers/SparkdownPreviewScreenplayPanelSerializer";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { getEditor } from "./getEditor";
import { getSparkdownPreviewConfig } from "./getSparkdownPreviewConfig";

export const activatePreviewScreenplayPanel = (
  context: vscode.ExtensionContext
): void => {
  // Register screenplay preview command
  context.subscriptions.push(
    vscode.commands.registerCommand("sparkdown.previewscreenplay", () => {
      const uri = getActiveSparkdownDocument();
      if (!uri) {
        return;
      }
      const editor = getEditor(uri);
      if (!editor) {
        return;
      }
      SparkdownPreviewScreenplayPanelManager.instance.showPanel(
        context.extensionUri,
        editor.document
      );
    })
  );
  // Notify screenplay preview whenever screenplay configuration is changed
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((change) => {
      if (change.affectsConfiguration("sparkdown")) {
        SparkdownPreviewScreenplayPanelManager.instance.notifyConfiguredWorkspace();
      }
    })
  );
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        SparkdownPreviewScreenplayPanelManager.instance.notifyFocusedTextDocument(
          editor.document
        );
      }
    })
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((change) => {
      SparkdownPreviewScreenplayPanelManager.instance.notifyChangedTextDocument(
        change.document,
        change.contentChanges
      );
    })
  );
  // Notify screenplay preview whenever text editor selection (or cursor position) changed
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((change) => {
      const document = change.textEditor.document;
      if (document.languageId === "sparkdown") {
        const config = getSparkdownPreviewConfig(document.uri);
        if (config.screenplay_preview_synchronized_with_cursor) {
          const range = change.selections[0];
          if (range) {
            SparkdownPreviewScreenplayPanelManager.instance.notifySelectedEditor(
              document,
              range
            );
          }
        }
      }
    })
  );
  // Notify screenplay preview whenever text editor is scrolled
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorVisibleRanges((change) => {
      const document = change.textEditor.document;
      if (document.languageId === "sparkdown") {
        const range = change.visibleRanges[0];
        if (range) {
          if (!SparkdownPreviewScreenplayPanelManager.instance.hovering) {
            SparkdownPreviewScreenplayPanelManager.instance.notifyScrolledEditor(
              document,
              range
            );
          }
        }
      }
    })
  );
  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer(
      `sparkdown-preview-screenplay`,
      new SparkdownPreviewScreenplayPanelSerializer(context)
    )
  );
};
