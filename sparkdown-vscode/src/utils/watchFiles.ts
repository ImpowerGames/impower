import * as vscode from "vscode";
import { assetExts, syncExts } from "../constants/extensions";
import { fileState } from "../state/fileState";
import { getWorkspaceRelativePath } from "./getWorkspaceRelativePath";
import { updateAssets } from "./updateAssets";
import { updateCommands } from "./updateCommands";
import { updateGamePreviews } from "./updateGamePreviews";

export const watchFiles = (doc: vscode.TextDocument) => {
  const uri = doc.uri;
  const state = fileState[uri.toString()] || {
    assets: {},
    assetsWatcher: undefined,
    syncWatcher: undefined,
  };
  if (assetExts) {
    const relativePath = getWorkspaceRelativePath(uri, assetExts);
    if (relativePath) {
      if (!state.assetsWatcher) {
        state.assetsWatcher =
          vscode.workspace.createFileSystemWatcher(relativePath);
        state.assetsWatcher.onDidChange(() => {
          updateAssets(doc);
          updateGamePreviews(doc);
        });
        state.assetsWatcher.onDidCreate(() => {
          updateAssets(doc);
          updateGamePreviews(doc);
        });
        state.assetsWatcher.onDidDelete(() => {
          updateAssets(doc);
          updateGamePreviews(doc);
        });
      }
    }
  }
  if (syncExts) {
    if (!state.syncWatcher) {
      const relativePath = getWorkspaceRelativePath(uri, syncExts);
      if (relativePath) {
        state.syncWatcher =
          vscode.workspace.createFileSystemWatcher(relativePath);
        state.syncWatcher.onDidCreate(() => {
          updateCommands(doc);
        });
        state.syncWatcher.onDidDelete(() => {
          updateCommands(doc);
        });
      }
    }
  }
  fileState[uri.toString()] = state;
};
