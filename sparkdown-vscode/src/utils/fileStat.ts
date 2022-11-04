import * as vscode from "vscode";

export const fileStat = async (
  filepath: string | vscode.Uri
): Promise<vscode.FileStat | undefined> => {
  try {
    const uri =
      typeof filepath === "string" ? vscode.Uri.file(filepath) : filepath;
    const stat = await vscode.workspace.fs.stat(uri);
    return stat;
  } catch {
    return undefined;
  }
};
