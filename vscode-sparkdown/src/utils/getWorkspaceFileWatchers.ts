import * as vscode from "vscode";
import { getWorkspaceFilePatterns } from "./getWorkspaceFilePatterns";
import { isWorkspaceProjectFile } from "./isWorkspaceProjectFile";

const projectEvent = (event: vscode.Event<vscode.Uri>): vscode.Event<vscode.Uri> =>
  (listener, thisArgs, disposables) => event(uri => {
    if (isWorkspaceProjectFile(uri)) listener.call(thisArgs, uri);
  }, undefined, disposables);

export const getWorkspaceFileWatchers = (): [
  scriptWatcher: vscode.FileSystemWatcher,
  imageWatcher: vscode.FileSystemWatcher,
  audioWatcher: vscode.FileSystemWatcher,
  fontWatcher: vscode.FileSystemWatcher,
  worldWatcher: vscode.FileSystemWatcher,
] => {
  const workspaceFilePatterns = getWorkspaceFilePatterns();
  return workspaceFilePatterns.map((pattern) => {
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    return {
      ignoreCreateEvents: watcher.ignoreCreateEvents,
      ignoreChangeEvents: watcher.ignoreChangeEvents,
      ignoreDeleteEvents: watcher.ignoreDeleteEvents,
      onDidCreate: projectEvent(watcher.onDidCreate),
      onDidChange: projectEvent(watcher.onDidChange),
      onDidDelete: projectEvent(watcher.onDidDelete),
      dispose: () => watcher.dispose(),
    };
  }) as [
    scriptWatcher: vscode.FileSystemWatcher,
    imageWatcher: vscode.FileSystemWatcher,
    audioWatcher: vscode.FileSystemWatcher,
    fontWatcher: vscode.FileSystemWatcher,
    worldWatcher: vscode.FileSystemWatcher,
  ];
};
