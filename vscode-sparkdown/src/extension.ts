/* eslint-disable @typescript-eslint/no-unused-vars */
import * as vscode from "vscode";
import { activateContextService } from "./context/activateContextService";
import { activateDebugger } from "./debugger/activateDebugger";
import { SparkdownPreviewSavesManager } from "./managers/SparkdownPreviewSavesManager";
import { SparkdownRoutePinsManager } from "./managers/SparkdownRoutePinsManager";
import { SparkdownStartingValuesManager } from "./managers/SparkdownStartingValuesManager";
import { fileSystemWatcherState } from "./state/fileSystemWatcherState";
import { activateAutoFormatting } from "./utils/activateAutoFormatting";
import { activateCheatSheetView } from "./utils/activateCheatSheetView";
import { activateCommandView } from "./utils/activateCommandView";
import { activateCompletionPreview } from "./utils/activateCompletionPreview";
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
import { activateRuntimeDiagnostics } from "./utils/activateRuntimeDiagnostics";
import { activateScreenPreview } from "./utils/activateScreenPreview";
import { activateVirtualDeclarations } from "./utils/activateVirtualDeclarations";
import { activatePortraitNormalization } from "./utils/activatePortraitNormalization";

declare const __SPARKDOWN_DRIVER_PROTOCOL__: boolean;

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
  SparkdownRoutePinsManager.instance.activate(context);
  SparkdownStartingValuesManager.instance.activate(context);
  SparkdownPreviewSavesManager.instance.activate(context);
  activatePreviewGamePanel(context);
  activateCompletionPreview(context);
  activateExecutionLineDecorator(context);
  activateFileWatcher(context);
  const clientReady = activateLanguageClient(context);
  if (typeof __SPARKDOWN_DRIVER_PROTOCOL__ !== "undefined" && __SPARKDOWN_DRIVER_PROTOCOL__ &&
    context.extensionMode === vscode.ExtensionMode.Development) {
    void import("./utils/driveEditorProtocol").then(({ attachDriveEditorProtocol }) =>
      attachDriveEditorProtocol(context, clientReady),
    );
  }
  activateRuntimeDiagnostics(context);
  activateNewlineHelper(context);
  activateDebugger(context);
  activateVirtualDeclarations(context);
  activateInspector(context);
  activatePortraitNormalization(context);
}

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
