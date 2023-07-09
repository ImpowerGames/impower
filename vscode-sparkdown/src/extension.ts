/* eslint-disable @typescript-eslint/no-unused-vars */
import * as vscode from "vscode";
import { fileSystemWatcherState } from "./state/fileSystemWatcherState";
import { parseState } from "./state/parseState";
import { typingState } from "./state/typingState";
import { activateCheatSheetView } from "./utils/activateCheatSheetView";
import { activateCommandView } from "./utils/activateCommandView";
import { activateDurationStatus } from "./utils/activateDurationStatus";
import { activateLanguageClient } from "./utils/activateLanguageClient";
import { activateOutlineView } from "./utils/activateOutlineView";
import { activatePreviewScreenplayPanel } from "./utils/activatePreviewScreenplayPanel";
import { getActiveSparkdownDocument } from "./utils/getActiveSparkdownDocument";
import { getSparkdownPreviewConfig } from "./utils/getSparkdownPreviewConfig";
import { getVisibleEditor } from "./utils/getVisibleEditor";
import { parseSparkDocument } from "./utils/parseSparkDocument";
import { activateUIPersistence } from "./utils/persistence";
import { registerTyping } from "./utils/registerTyping";
import { updateAssets } from "./utils/updateAssets";
import { updateCommands } from "./utils/updateCommands";
import { watchFiles } from "./utils/watchFiles";

export const activate = async (
  context: vscode.ExtensionContext
): Promise<void> => {
  console.log("Sparkdown Activated");
  activateUIPersistence(context);
  activateOutlineView(context);
  activateCommandView(context);
  activateCheatSheetView(context);
  activatePreviewScreenplayPanel(context);
  // activateGamePreviewPanel(context);
  // activateStatisticsPanel(context);
  activateDurationStatus(context);
  activateLanguageClient(context);
  registerTyping();
  const uri = getActiveSparkdownDocument();
  if (!uri) {
    return;
  }
  const editor = getVisibleEditor(uri);
  if (!editor) {
    return;
  }
  watchFiles(context, editor.document);
  await updateAssets(editor.document);
  parseSparkDocument(context, editor.document);

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((change) => {
      if (
        change?.document?.languageId === "sparkdown" &&
        change?.contentChanges?.length > 0
      ) {
        watchFiles(context, change.document);
        parseSparkDocument(context, change.document);
        // updateStatisticsDocumentVersion(change.document.uri, change.document.version);
      }
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (editor?.document?.languageId === "sparkdown") {
        watchFiles(context, editor.document);
        await updateAssets(editor.document);
        parseSparkDocument(context, editor.document);
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((change) => {
      if (
        change.affectsConfiguration(
          "sparkdown.general.parentheticalNewLineHelper"
        )
      ) {
        const uri = getActiveSparkdownDocument();
        if (!uri) {
          return;
        }
        const config = getSparkdownPreviewConfig(uri);
        if (typingState.disposeTyping) {
          typingState.disposeTyping.dispose();
        }
        if (config.editor_parenthetical_newline_helper) {
          registerTyping();
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc?.languageId === "sparkdown") {
        updateCommands(doc.uri);
        //   const config = getSparkdownConfig(doc.uri);
        //   if (config.refresh_stats_on_save) {
        //     const statsPanel = getStatisticsPanels(doc.uri);
        //     for (const sp of statsPanel) {
        //       refreshPanel(sp.panel, doc, config);
        //     }
        //   }
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((doc) => {
      delete parseState.parsedPrograms[doc.uri.toString()];
      if (fileSystemWatcherState[doc.uri.toString()]?.assetsWatcher) {
        fileSystemWatcherState[doc.uri.toString()]?.assetsWatcher?.dispose();
      }
      delete fileSystemWatcherState[doc.uri.toString()];
    })
  );
};

// this method is called when your extension is deactivated
export function deactivate() {
  Object.values(fileSystemWatcherState).forEach((v) => {
    if (v.assetsWatcher) {
      v.assetsWatcher.dispose();
    }
  });
}
