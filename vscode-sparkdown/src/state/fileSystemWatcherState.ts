import * as vscode from "vscode";

export const fileSystemWatcherState: {
  [documentUri: string]: {
    scriptFilesWatcher?: vscode.FileSystemWatcher;
    outputFilesWatcher?: vscode.FileSystemWatcher;
  };
} = {};
