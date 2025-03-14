/* eslint-disable @typescript-eslint/no-unused-vars */
import * as vscode from "vscode";
import { activateContextService } from "./context/activateContextService";
import { activateDebugger } from "./debugger/activateDebugger";
import { fileSystemWatcherState } from "./state/fileSystemWatcherState";
import { activateAutoFormatting } from "./utils/activateAutoFormatting";
import { activateCheatSheetView } from "./utils/activateCheatSheetView";
import { activateCommandView } from "./utils/activateCommandView";
import { activateDurationStatus } from "./utils/activateDurationStatus";
import { activateExecutionGutterDecorator } from "./utils/activateExecutionGutterDecorator";
import { activateFileDecorations } from "./utils/activateFileDecorations";
import { activateFileWatcher } from "./utils/activateFileWatcher";
import { activateLanguageClient } from "./utils/activateLanguageClient";
import { activateNewlineHelper } from "./utils/activateNewlineHelper";
import { activateOutlineView } from "./utils/activateOutlineView";
import { activatePreviewGamePanel } from "./utils/activatePreviewGamePanel";
import { activatePreviewScreenplayPanel } from "./utils/activatePreviewScreenplayPanel";

// Called when extension is activated
export const activate = async (
  context: vscode.ExtensionContext
): Promise<void> => {
  console.log("Sparkdown Activated");
  activateContextService(context);
  activateFileDecorations(context);
  activateOutlineView(context);
  activateCommandView(context);
  activateCheatSheetView(context);
  activateDurationStatus(context);
  activatePreviewScreenplayPanel(context);
  activatePreviewGamePanel(context);
  activateAutoFormatting(context);
  activateExecutionGutterDecorator(context);
  // TODO:
  // activateStatisticsPanel(context);
  activateFileWatcher(context);
  activateLanguageClient(context);
  activateNewlineHelper(context);
  activateDebugger(context);
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
