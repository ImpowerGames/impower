import * as vscode from "vscode";
import { getWorkspaceFilePatterns } from "./getWorkspaceFilePatterns";
import { imageFileRevisions } from "./imageFileRevisions";

export const getWorkspaceFileWatchers = (): [
  scriptWatcher: vscode.FileSystemWatcher,
  imageWatcher: vscode.FileSystemWatcher,
  audioWatcher: vscode.FileSystemWatcher,
  fontWatcher: vscode.FileSystemWatcher,
  worldWatcher: vscode.FileSystemWatcher,
] => {
  const workspaceFilePatterns = getWorkspaceFilePatterns();
  const watchers = workspaceFilePatterns.map((pattern) =>
    vscode.workspace.createFileSystemWatcher(pattern),
  );
  // External disk events were verified in a desktop extension host. Served
  // web workbenches can lack their file observer, so retain fresh reads there.
  if (vscode.env.uiKind === vscode.UIKind.Desktop) {
    imageFileRevisions.watch(watchers[1]!);
  }
  return watchers as [
    scriptWatcher: vscode.FileSystemWatcher,
    imageWatcher: vscode.FileSystemWatcher,
    audioWatcher: vscode.FileSystemWatcher,
    fontWatcher: vscode.FileSystemWatcher,
    worldWatcher: vscode.FileSystemWatcher,
  ];
};
