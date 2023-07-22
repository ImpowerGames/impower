/* eslint-disable @typescript-eslint/no-unused-vars */
import * as vscode from "vscode";
import { fileSystemWatcherState } from "./state/fileSystemWatcherState";
import { activateCheatSheetView } from "./utils/activateCheatSheetView";
import { activateCommandView } from "./utils/activateCommandView";
import { activateDurationStatus } from "./utils/activateDurationStatus";
import { activateFileWatcher } from "./utils/activateFileWatcher";
import { activateLanguageClient } from "./utils/activateLanguageClient";
import { activateOutlineView } from "./utils/activateOutlineView";
import { activateParentheticalNewlineHelper } from "./utils/activateParentheticalNewlineHelper";
import { activatePreviewScreenplayPanel } from "./utils/activatePreviewScreenplayPanel";

export const activate = async (
  context: vscode.ExtensionContext
): Promise<void> => {
  console.log("Sparkdown Activated");
  activateOutlineView(context);
  activateCommandView(context);
  activateCheatSheetView(context);
  activateDurationStatus(context);
  activatePreviewScreenplayPanel(context);
  // activateGamePreviewPanel(context);
  // activateStatisticsPanel(context);
  activateFileWatcher(context);
  activateLanguageClient(context);
  activateParentheticalNewlineHelper(context);
};

// this method is called when your extension is deactivated
export function deactivate() {
  Object.values(fileSystemWatcherState).forEach((v) => {
    if (v.assetsWatcher) {
      v.assetsWatcher.dispose();
    }
  });
}
