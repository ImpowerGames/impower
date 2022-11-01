/* eslint-disable @typescript-eslint/no-unused-vars */
import * as vscode from "vscode";
import { fileState } from "./state/fileState";
import { parseState } from "./state/parseState";
import { typingState } from "./state/typingState";
import { activateCheatSheetView } from "./utils/activateCheatSheetView";
import { activateCommandView } from "./utils/activateCommandView";
import { activateDurationStatus } from "./utils/activateDurationStatus";
import { activateLanguageAssistance } from "./utils/activateLanguageAssistance";
import { activateOutlineView } from "./utils/activateOutlineView";
import { activatePreviewPanel } from "./utils/activatePreviewPanel";
import { getActiveSparkdownDocument } from "./utils/getActiveSparkdownDocument";
import { getEditor } from "./utils/getEditor";
import { getSparkdownConfig } from "./utils/getSparkdownConfig";
import { parseDocument } from "./utils/parseDocument";
import { activateUIPersistence } from "./utils/persistence";
import { registerTyping } from "./utils/registerTyping";
import { updateAssets } from "./utils/updateAssets";
import { watchFiles } from "./utils/watchFiles";

export function activate(context: vscode.ExtensionContext) {
  console.log("Sparkdown Activated");
  activateUIPersistence(context);
  activateOutlineView(context);
  activateCommandView(context);
  activateCheatSheetView(context);
  activatePreviewPanel(context, "game");
  activatePreviewPanel(context, "screenplay");
  // activateStatisticsPanel(context);
  activateDurationStatus(context);
  activateLanguageAssistance();
  registerTyping();
  const uri = getActiveSparkdownDocument();
  if (!uri) {
    return;
  }
  const editor = getEditor(uri);
  if (!editor) {
    return;
  }
  watchFiles(editor.document);
  updateAssets(editor.document);
  parseDocument(editor.document);
}

vscode.workspace.onDidChangeTextDocument((change) => {
  if (
    change?.document?.languageId === "sparkdown" &&
    change?.contentChanges?.length > 0
  ) {
    parseDocument(change.document);
    // updateStatisticsDocumentVersion(change.document.uri, change.document.version);
  }
});

vscode.workspace.onDidChangeConfiguration((change) => {
  if (
    change.affectsConfiguration("sparkdown.general.parentheticalNewLineHelper")
  ) {
    const uri = getActiveSparkdownDocument();
    if (!uri) {
      return;
    }
    const config = getSparkdownConfig(uri);
    if (typingState.disposeTyping) {
      typingState.disposeTyping.dispose();
    }
    if (config.editor_parenthetical_newline_helper) {
      registerTyping();
    }
  }
});

vscode.window.onDidChangeActiveTextEditor((editor) => {
  if (editor?.document?.languageId === "sparkdown") {
    watchFiles(editor.document);
    updateAssets(editor.document);
    parseDocument(editor.document);
  }
});

vscode.workspace.onDidSaveTextDocument((_doc) => {
  // if (doc?.languageId === "sparkdown") {
  //   const config = getSparkdownConfig(doc.uri);
  //   if (config.refresh_stats_on_save) {
  //     const statsPanel = getStatisticsPanels(doc.uri);
  //     for (const sp of statsPanel) {
  //       refreshPanel(sp.panel, doc, config);
  //     }
  //   }
  // }
});

vscode.workspace.onDidCloseTextDocument((doc) => {
  delete parseState.parsedDocuments[doc.uri.toString()];
  if (fileState[doc.uri.toString()]?.assetsWatcher) {
    fileState[doc.uri.toString()]?.assetsWatcher?.dispose();
  }
  delete fileState[doc.uri.toString()];
});

// this method is called when your extension is deactivated
export function deactivate() {
  Object.values(fileState).forEach((v) => {
    if (v.assetsWatcher) {
      v.assetsWatcher.dispose();
    }
  });
}
