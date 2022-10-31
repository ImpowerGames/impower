import * as vscode from "vscode";

export const fileExists = async (filepath: string): Promise<boolean> => {
  try {
    const uri = vscode.Uri.file(filepath);
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
};
