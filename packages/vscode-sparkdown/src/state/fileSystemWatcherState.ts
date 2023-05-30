import * as vscode from "vscode";

export const fileSystemWatcherState: Record<
  string,
  {
    assetsWatcher?: vscode.FileSystemWatcher;
    syncWatcher?: vscode.FileSystemWatcher;
  }
> = {};
