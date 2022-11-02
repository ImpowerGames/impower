import * as vscode from "vscode";

export const readFile = async (
  filepath: string | vscode.Uri,
  encoding?: BufferEncoding | undefined
): Promise<string | undefined> => {
  try {
    const uri =
      typeof filepath === "string" ? vscode.Uri.file(filepath) : filepath;
    const data = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(data).toString(encoding);
  } catch {
    return undefined;
  }
};
