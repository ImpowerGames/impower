import * as path from "path";
import * as vscode from "vscode";

export const getWorkspaceRelativePath = (
  uri: vscode.Uri,
  extensions: string[] | string
): vscode.RelativePattern | undefined => {
  const workspaceFolder: vscode.WorkspaceFolder | undefined =
    vscode.workspace.getWorkspaceFolder(uri);
  if (!workspaceFolder) {
    return undefined;
  }
  const workspaceFolderPath: string = workspaceFolder.uri.path;
  const uriPath = uri.path;
  const currentFolder = path.resolve(uriPath, "../");
  const relativeSearchFolderPrefix = path.relative(
    workspaceFolderPath,
    currentFolder
  );
  const folder = relativeSearchFolderPrefix
    ? relativeSearchFolderPrefix + "/"
    : "";
  const filename =
    typeof extensions === "string" ? extensions : `*.{${extensions.join(",")}}`;
  return new vscode.RelativePattern(
    workspaceFolderPath,
    folder + `**/${filename}`
  );
};
