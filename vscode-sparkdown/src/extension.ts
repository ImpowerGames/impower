/* eslint-disable @typescript-eslint/no-unused-vars */
import * as vscode from "vscode";
import { activateContextService } from "./context/activateContextService";
import { activateDebugger } from "./debugger/activateDebugger";
import { fileSystemWatcherState } from "./state/fileSystemWatcherState";
import { activateAutoFormatting } from "./utils/activateAutoFormatting";
import { activateCheatSheetView } from "./utils/activateCheatSheetView";
import { activateCommandView } from "./utils/activateCommandView";
import { activateCompilationView } from "./utils/activateCompilationView";
import { activateDocumentManager } from "./utils/activateDocumentManager";
import { activateDurationStatus } from "./utils/activateDurationStatus";
import { activateExecutionLineDecorator } from "./utils/activateExecutionLineDecorator";
import { activateFileDecorations } from "./utils/activateFileDecorations";
import { activateFileWatcher } from "./utils/activateFileWatcher";
import { activateInspector } from "./utils/activateInspector";
import { activateLanguageClient } from "./utils/activateLanguageClient";
import { activateNewlineHelper } from "./utils/activateNewlineHelper";
import { activateOutlineView } from "./utils/activateOutlineView";
import { activatePreviewGamePanel } from "./utils/activatePreviewGamePanel";
import { activatePreviewScreenplayPanel } from "./utils/activatePreviewScreenplayPanel";
import { activateScreenPreview } from "./utils/activateScreenPreview";
import { activateVirtualDeclarations } from "./utils/activateVirtualDeclarations";

// Called when extension is activated
export function activate(context: vscode.ExtensionContext) {
  console.log("Sparkdown Activated");
  activateDocumentManager(context);
  activateScreenPreview(context);
  activateAutoFormatting(context);
  activateContextService(context);
  activateFileDecorations(context);
  activateOutlineView(context);
  activateCommandView(context);
  activateCheatSheetView(context);
  activateDurationStatus(context);
  activatePreviewScreenplayPanel(context);
  activatePreviewGamePanel(context);
  activateExecutionLineDecorator(context);
  activateCompilationView(context);
  // TODO:
  // activateStatisticsPanel(context);
  activateFileWatcher(context);
  activateLanguageClient(context);
  activateNewlineHelper(context);
  activateDebugger(context);
  activateVirtualDeclarations(context);
  activateInspector(context);
}

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
