import * as vscode from "vscode";

export const readFile = async (
  filepath: string | vscode.Uri
): Promise<ArrayBuffer | undefined> => {
  try {
    const uri =
      typeof filepath === "string" ? vscode.Uri.file(filepath) : filepath;
    const array = await vscode.workspace.fs.readFile(uri);
    return array.buffer.slice(
      array.byteOffset,
      array.byteLength + array.byteOffset
    ) as ArrayBuffer;
  } catch {
    return undefined;
  }
};
