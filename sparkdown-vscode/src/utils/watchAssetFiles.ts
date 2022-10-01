import * as vscode from "vscode";
import { fileState } from "../state/fileState";
import { getAssetsRelativePath } from "./getAssetsRelativePath";
import { updateAssets } from "./updateAssets";
import { updateGamePreviews } from "./updateGamePreviews";

export const watchAssetFiles = (doc: vscode.TextDocument) => {
  const uri = doc.uri;
  const relativePath = getAssetsRelativePath(uri);
  if (!relativePath) {
    return;
  }
  const state = fileState[uri.toString()] || { assets: {}, watcher: undefined };
  if (state.watcher) {
    // Already watching
    return;
  }
  state.watcher = vscode.workspace.createFileSystemWatcher(relativePath);
  state.watcher.onDidChange(() => {
    updateAssets(doc);
    updateGamePreviews(doc);
  });
  state.watcher.onDidCreate(() => {
    updateAssets(doc);
    updateGamePreviews(doc);
  });
  state.watcher.onDidDelete(() => {
    updateAssets(doc);
    updateGamePreviews(doc);
  });
  fileState[uri.toString()] = state;
};
