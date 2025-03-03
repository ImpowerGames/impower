/* eslint-disable @typescript-eslint/no-unused-vars */
import * as vscode from "vscode";
import { fileSystemWatcherState } from "./state/fileSystemWatcherState";
import { activateCheatSheetView } from "./utils/activateCheatSheetView";
import { activateCommandView } from "./utils/activateCommandView";
import { activateDurationStatus } from "./utils/activateDurationStatus";
import { activateFileWatcher } from "./utils/activateFileWatcher";
import { activateLanguageClient } from "./utils/activateLanguageClient";
import { activateNewlineHelper } from "./utils/activateNewlineHelper";
import { activatePreviewScreenplayPanel } from "./utils/activatePreviewScreenplayPanel";
import { activatePreviewGamePanel } from "./utils/activatePreviewGamePanel";
import { activateOutlineView } from "./utils/activateOutlineView";
import { activateFileDecorations } from "./utils/activateFileDecorations";

// Called when extension is activated
export const activate = async (
  context: vscode.ExtensionContext
): Promise<void> => {
  console.log("Sparkdown Activated");
  activateFileDecorations(context);
  activateOutlineView(context);
  activateCommandView(context);
  activateCheatSheetView(context);
  activateDurationStatus(context);
  activatePreviewScreenplayPanel(context);
  activatePreviewGamePanel(context);
  // TODO:
  // activateStatisticsPanel(context);
  activateFileWatcher(context);
  activateLanguageClient(context);
  activateNewlineHelper(context);
};

// Called when extension is deactivated
export function deactivate() {
  console.log("Sparkdown Deactivated");
  Object.values(fileSystemWatcherState).forEach((v) => {
    if (v.scriptFilesWatcher) {
      v.scriptFilesWatcher.dispose();
    }
    if (v.outputFilesWatcher) {
      v.outputFilesWatcher.dispose();
    }
  });
}
