/* eslint-disable @typescript-eslint/no-unused-vars */
import * as vscode from "vscode";
import { editorState } from "./state/editorState";
import { typingState } from "./state/typingState";
import { activateCheatSheetView } from "./utils/activateCheatSheetView";
import { activateCommandView } from "./utils/activateCommandView";
import { activateDurationStatus } from "./utils/activateDurationStatus";
import { activateLanguageAssistance } from "./utils/activateLanguageAssistance";
import { activateOutlineView } from "./utils/activateOutlineView";
import { getActiveSparkdownDocument } from "./utils/getActiveSparkdownDocument";
import { getSparkdownConfig } from "./utils/getSparkdownConfig";
import { parseDocument } from "./utils/parseDocument";
import { activateUIPersistence } from "./utils/persistence";
import { registerTyping } from "./utils/registerTyping";

export function activate(context: vscode.ExtensionContext) {
  console.log("Sparkdown Activated");
  activateUIPersistence(context);
  activateOutlineView(context);
  activateCommandView(context);
  activateCheatSheetView(context);
  // activatePreviewPanel(context);
  // activateStatisticsPanel(context);
  activateDurationStatus(context);
  activateLanguageAssistance();
  registerTyping();
  if (vscode.window.activeTextEditor?.document?.languageId === "sparkdown") {
    parseDocument(vscode.window.activeTextEditor.document);
  }
}

vscode.workspace.onDidChangeTextDocument((change) => {
  if (change?.document?.languageId === "sparkdown") {
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
    if (config.parenthetical_newline_helper) {
      registerTyping();
    }
  }
});

vscode.window.onDidChangeActiveTextEditor((editor) => {
  if (editor?.document?.languageId === "sparkdown") {
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
  delete editorState.parsedDocuments[doc.uri.toString()];
});
