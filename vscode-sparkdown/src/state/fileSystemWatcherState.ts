import * as vscode from "vscode";

export const fileSystemWatcherState: Record<
  string,
  {
    assetFilesWatcher?: vscode.FileSystemWatcher;
    scriptFilesWatcher?: vscode.FileSystemWatcher;
    outputFilesWatcher?: vscode.FileSystemWatcher;
  }
> = {};
