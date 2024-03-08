import * as vscode from "vscode";

export const readFile = async (
  filepath: string | vscode.Uri
): Promise<ArrayBuffer | undefined> => {
  try {
    const uri =
      typeof filepath === "string" ? vscode.Uri.file(filepath) : filepath;
    return vscode.workspace.fs.readFile(uri);
  } catch {
    return undefined;
  }
};
