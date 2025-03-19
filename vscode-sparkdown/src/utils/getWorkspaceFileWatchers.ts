import * as vscode from "vscode";
import { getWorkspaceFilePatterns } from "./getWorkspaceFilePatterns";

export const getWorkspaceFileWatchers = (): [
  scriptWatcher: vscode.FileSystemWatcher,
  imageWatcher: vscode.FileSystemWatcher,
  audioWatcher: vscode.FileSystemWatcher,
  fontWatcher: vscode.FileSystemWatcher
] => {
  const workspaceFilePatterns = getWorkspaceFilePatterns();
  return workspaceFilePatterns.map((pattern) =>
    vscode.workspace.createFileSystemWatcher(pattern)
  ) as [
    scriptWatcher: vscode.FileSystemWatcher,
    imageWatcher: vscode.FileSystemWatcher,
    audioWatcher: vscode.FileSystemWatcher,
    fontWatcher: vscode.FileSystemWatcher
  ];
};
