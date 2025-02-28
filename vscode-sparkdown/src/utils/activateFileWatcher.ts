import * as vscode from "vscode";
import { fileSystemWatcherState } from "../state/fileSystemWatcherState";
import { getActiveSparkdownDocument } from "./getActiveSparkdownDocument";
import { getEditor } from "./getEditor";
import { watchFiles } from "./watchFiles";

export const activateFileWatcher = async (
  context: vscode.ExtensionContext
): Promise<void> => {
  const uri = getActiveSparkdownDocument();
  const editor = getEditor(uri);
  if (editor) {
    watchFiles(context, editor.document);
  }
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((change) => {
      if (
        change?.document?.languageId === "sparkdown" &&
        change?.contentChanges?.length > 0
      ) {
        watchFiles(context, change.document);
        // updateStatisticsDocumentVersion(change.document.uri, change.document.version);
      }
    })
  );
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (editor?.document?.languageId === "sparkdown") {
        watchFiles(context, editor.document);
      }
    })
  );
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((doc) => {
      delete fileSystemWatcherState[doc.uri.toString()];
    })
  );
};
