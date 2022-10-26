import path from "path";
import * as vscode from "vscode";

export const getWorkspaceRelativePath = (
  uri: vscode.Uri,
  extensions: string[]
): vscode.RelativePattern | undefined => {
  const workspaceFolder: vscode.WorkspaceFolder | undefined =
    vscode.workspace.getWorkspaceFolder(uri);
  if (!workspaceFolder) {
    return undefined;
  }
  const workspaceFolderPath: string = workspaceFolder.uri.path;
  const currentFolder = path.resolve(uri.path, "../");
  const relativeSearchFolderPrefix = path.relative(
    workspaceFolderPath,
    currentFolder
  );
  return new vscode.RelativePattern(
    workspaceFolderPath,
    relativeSearchFolderPrefix + `/**/*.{${extensions.join(",")}}`
  );
};
