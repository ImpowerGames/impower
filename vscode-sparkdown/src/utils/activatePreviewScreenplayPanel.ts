import * as vscode from "vscode";
import { SparkdownPreviewScreenplayPanelManager } from "../managers/SparkdownPreviewScreenplayPanelManager";
import { SparkdownPreviewScreenplayPanelSerializer } from "../managers/SparkdownPreviewScreenplayPanelSerializer";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { getEditor } from "./getEditor";
import { getSparkdownPreviewConfig } from "./getSparkdownPreviewConfig";

export const activatePreviewScreenplayPanel = (
  context: vscode.ExtensionContext,
): void => {
  context.subscriptions.push(
    vscode.commands.registerCommand("sparkdown.previewScreenplay", () => {
      const uri = getActiveSparkdownDocument();
      if (!uri) {
        return;
      }
      const editor = getEditor(uri);
      if (!editor) {
        return;
      }
      SparkdownPreviewScreenplayPanelManager.instance.showPanel(
        context,
        editor.document,
      );
    }),
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((change) => {
      if (change.affectsConfiguration("sparkdown")) {
        SparkdownPreviewScreenplayPanelManager.instance.notifyConfiguredWorkspace();
      }
    }),
  );
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor?.document.languageId === "sparkdown") {
        setTimeout(() => {
          SparkdownPreviewScreenplayPanelManager.instance.notifyChangedActiveEditor(
            editor,
          );
        }, 10);
      }
    }),
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((change) => {
      if (change.document.languageId === "sparkdown") {
        SparkdownPreviewScreenplayPanelManager.instance.notifyChangedTextDocument(
          change.document,
          change.contentChanges,
        );
      }
    }),
  );
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
              range,
              change.kind === vscode.TextEditorSelectionChangeKind.Mouse ||
                change.kind === vscode.TextEditorSelectionChangeKind.Keyboard,
            );
          }
        }
      }
    }),
  );
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorVisibleRanges((change) => {
      const document = change.textEditor.document;
      if (document.languageId === "sparkdown") {
        const range = change.visibleRanges[0];
        if (range) {
          if (!SparkdownPreviewScreenplayPanelManager.instance.hovering) {
            SparkdownPreviewScreenplayPanelManager.instance.notifyScrolledEditor(
              document,
              range,
            );
          }
        }
      }
    }),
  );
  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer(
      `sparkdown-preview-screenplay`,
      new SparkdownPreviewScreenplayPanelSerializer(context),
    ),
  );
};
