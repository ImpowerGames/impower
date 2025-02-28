import * as vscode from "vscode";
import { EXPORTABLE_FILE_EXTENSIONS } from "../constants/FILE_EXTENSIONS";
import { fileSystemWatcherState } from "../state/fileSystemWatcherState";
import { getWorkspaceRelativePath } from "./getWorkspaceRelativePath";
import { updateCommands } from "./updateCommands";

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
