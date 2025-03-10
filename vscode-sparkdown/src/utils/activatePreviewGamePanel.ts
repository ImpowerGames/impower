import * as vscode from "vscode";
import { SparkdownPreviewGamePanelManager } from "../managers/SparkdownPreviewGamePanelManager";
import { SparkdownPreviewGamePanelSerializer } from "../managers/SparkdownPreviewGamePanelSerializer";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { getEditor } from "./getEditor";
import { getSparkdownPreviewConfig } from "./getSparkdownPreviewConfig";

export const activatePreviewGamePanel = (
  context: vscode.ExtensionContext
): void => {
  // Register game preview command
  context.subscriptions.push(
    vscode.commands.registerCommand("sparkdown.previewgame", () => {
      const uri = getActiveSparkdownDocument();
      if (!uri) {
        return;
      }
      const editor = getEditor(uri);
      if (!editor) {
        return;
      }
      SparkdownPreviewGamePanelManager.instance.showPanel(
        context.extensionUri,
        editor.document
      );
    })
  );
  // Notify game preview whenever game configuration is changed
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((change) => {
      if (change.affectsConfiguration("sparkdown")) {
        SparkdownPreviewGamePanelManager.instance.notifyConfiguredWorkspace();
      }
    })
  );
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor?.document.languageId === "sparkdown") {
        // We have to delay this slightly so that visibleRanges has time to be correctly updated
        setTimeout(() => {
          SparkdownPreviewGamePanelManager.instance.notifyChangedActiveEditor(
            editor
          );
        }, 10);
      }
    })
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((change) => {
      if (change.document.languageId === "sparkdown") {
        SparkdownPreviewGamePanelManager.instance.notifyChangedTextDocument(
          change.document,
          change.contentChanges
        );
      }
    })
  );
  // Notify game preview whenever text editor selection (i.e. cursor position) changed
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((change) => {
      const document = change.textEditor.document;
      if (document.languageId === "sparkdown") {
        const config = getSparkdownPreviewConfig(document.uri);
        if (config.game_preview_synchronized_with_cursor) {
          const range = change.selections[0];
          if (range) {
            SparkdownPreviewGamePanelManager.instance.notifySelectedEditor(
              document,
              range,
              change.kind === vscode.TextEditorSelectionChangeKind.Mouse ||
                change.kind === vscode.TextEditorSelectionChangeKind.Keyboard
            );
          }
        }
      }
    })
  );
  // Notify game preview whenever text editor is scrolled
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorVisibleRanges((change) => {
      const document = change.textEditor.document;
      if (document.languageId === "sparkdown") {
        const range = change.visibleRanges[0];
        if (range) {
          if (!SparkdownPreviewGamePanelManager.instance.hovering) {
            SparkdownPreviewGamePanelManager.instance.notifyScrolledEditor(
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
      `sparkdown-preview-game`,
      new SparkdownPreviewGamePanelSerializer(context)
    )
  );
};
