import * as vscode from "vscode";
import {
  ASSET_FILE_EXTENSIONS,
  EXPORTABLE_FILE_EXTENSIONS,
} from "../constants/FILE_EXTENSIONS";
import { fileSystemWatcherState } from "../state/fileSystemWatcherState";
import { getWorkspaceRelativePath } from "./getWorkspaceRelativePath";
import { updateAssets } from "./updateAssets";
import { updateCommands } from "./updateCommands";
import { updateGamePreviews } from "./updateGamePreviews";

export const watchFiles = (
  context: vscode.ExtensionContext,
  doc: vscode.TextDocument
) => {
  const uri = doc.uri;
  const state = fileSystemWatcherState[uri.toString()] || {
    assetFilesWatcher: undefined,
    outputFilesWatcher: undefined,
  };
  fileSystemWatcherState[uri.toString()] = state;
  if (!state.assetFilesWatcher) {
    const relativePath = getWorkspaceRelativePath(uri, ASSET_FILE_EXTENSIONS);
    if (relativePath) {
      state.assetFilesWatcher =
        vscode.workspace.createFileSystemWatcher(relativePath);
      state.assetFilesWatcher.onDidChange(async () => {
        await updateAssets(doc);
        // TODO: Notify Language Server of asset URL change
        updateGamePreviews(doc);
      });
      state.assetFilesWatcher.onDidCreate(async () => {
        await updateAssets(doc);
        // TODO: Notify Language Server of asset URL change
        updateGamePreviews(doc);
      });
      state.assetFilesWatcher.onDidDelete(async () => {
        await updateAssets(doc);
        // TODO: Notify Language Server of asset URL change
        updateGamePreviews(doc);
      });
    }
  }
  if (!state.outputFilesWatcher) {
    const relativePath = getWorkspaceRelativePath(
      uri,
      EXPORTABLE_FILE_EXTENSIONS
    );
    if (relativePath) {
      state.outputFilesWatcher =
        vscode.workspace.createFileSystemWatcher(relativePath);
      state.outputFilesWatcher.onDidChange(() => {
        updateCommands(doc.uri);
      });
      state.outputFilesWatcher.onDidCreate(() => {
        updateCommands(doc.uri);
      });
      state.outputFilesWatcher.onDidDelete(() => {
        updateCommands(doc.uri);
      });
    }
  }
};
