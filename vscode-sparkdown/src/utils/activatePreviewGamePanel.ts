import * as vscode from "vscode";
import { SparkdownPreviewGamePanelManager } from "../managers/SparkdownPreviewGamePanelManager";
import { SparkdownPreviewGamePanelSerializer } from "../managers/SparkdownPreviewGamePanelSerializer";
import { SparkdownRoutePinsManager } from "../managers/SparkdownRoutePinsManager";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { getEditor } from "./getEditor";
import { getSparkdownPreviewConfig } from "./getSparkdownPreviewConfig";

export const activatePreviewGamePanel = async (
  context: vscode.ExtensionContext,
) => {
  context.subscriptions.push(
    vscode.commands.registerCommand("sparkdown.previewGame", () => {
      const uri = getActiveSparkdownDocument();
      const editor = uri ? getEditor(uri) : undefined;
      SparkdownPreviewGamePanelManager.instance.showPanel(
        context,
        editor?.document,
      );
    }),
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((change) => {
      if (change.affectsConfiguration("sparkdown")) {
        SparkdownPreviewGamePanelManager.instance.notifyConfiguredWorkspace();
      }
    }),
  );
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor?.document.languageId === "sparkdown") {
        setTimeout(() => {
          SparkdownPreviewGamePanelManager.instance.notifyChangedActiveEditor(
            editor,
          );
        }, 10);
      }
    }),
  );
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => {
      SparkdownPreviewGamePanelManager.instance.notifyOpenedTextDocument(
        document,
      );
    }),
  );
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((document) => {
      SparkdownPreviewGamePanelManager.instance.notifyClosedTextDocument(
        document,
      );
    }),
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((change) => {
      SparkdownPreviewGamePanelManager.instance.notifyChangedTextDocument(
        change.document,
        change.contentChanges,
      );
      SparkdownRoutePinsManager.instance.moveThroughEdit(change);
    }),
  );
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((change) => {
      const editor = change.textEditor;
      const document = editor.document;
      if (document.languageId === "sparkdown") {
        const config = getSparkdownPreviewConfig(document.uri);
        if (config.game_preview_synchronized_with_cursor) {
          const range = change.selections[0];
          if (range) {
            SparkdownPreviewGamePanelManager.instance.notifySelectedEditor(
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
          if (!SparkdownPreviewGamePanelManager.instance.hovering) {
            SparkdownPreviewGamePanelManager.instance.notifyScrolledEditor(
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
      `sparkdown-preview-game`,
      new SparkdownPreviewGamePanelSerializer(context),
    ),
  );
};
