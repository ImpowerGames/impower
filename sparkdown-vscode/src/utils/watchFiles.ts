import * as vscode from "vscode";
import { assetExts, syncExts } from "../constants/extensions";
import { fileSystemWatcherState } from "../state/fileSystemWatcherState";
import { getWorkspaceRelativePath } from "./getWorkspaceRelativePath";
import { parseSparkDocument } from "./parseSparkDocument";
import { updateAssets } from "./updateAssets";
import { updateCommands } from "./updateCommands";
import { updateGamePreviews } from "./updateGamePreviews";

export const watchFiles = (doc: vscode.TextDocument) => {
  const uri = doc.uri;
  const state = fileSystemWatcherState[uri.toString()] || {
    assetsWatcher: undefined,
    syncWatcher: undefined,
  };
  fileSystemWatcherState[uri.toString()] = state;
  if (!state.assetsWatcher) {
    const relativePath = getWorkspaceRelativePath(uri, assetExts);
    if (relativePath) {
      state.assetsWatcher =
        vscode.workspace.createFileSystemWatcher(relativePath);
      state.assetsWatcher.onDidChange(async () => {
        await updateAssets(doc);
        parseSparkDocument(doc);
        updateGamePreviews(doc);
      });
      state.assetsWatcher.onDidCreate(async () => {
        await updateAssets(doc);
        parseSparkDocument(doc);
        updateGamePreviews(doc);
      });
      state.assetsWatcher.onDidDelete(async () => {
        await updateAssets(doc);
        parseSparkDocument(doc);
        updateGamePreviews(doc);
      });
    }
  }
  if (!state.syncWatcher) {
    const relativePath = getWorkspaceRelativePath(uri, syncExts);
    if (relativePath) {
      state.syncWatcher =
        vscode.workspace.createFileSystemWatcher(relativePath);
      state.syncWatcher.onDidChange(() => {
        updateCommands(doc.uri);
      });
      state.syncWatcher.onDidCreate(() => {
        updateCommands(doc.uri);
      });
      state.syncWatcher.onDidDelete(() => {
        updateCommands(doc.uri);
      });
    }
  }
};
