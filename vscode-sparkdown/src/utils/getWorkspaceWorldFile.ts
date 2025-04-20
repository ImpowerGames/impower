import path from "path";
import * as vscode from "vscode";

export const getWorkspaceWorldFile = async (fileUri: vscode.Uri) => {
  const uri = fileUri.toString();
  const name = path.parse(uri).name;
  const ext = path.extname(uri).slice(1);
  const buffer = await vscode.workspace.fs.readFile(fileUri);
  const text = Buffer.from(buffer).toString("utf8");
  return { type: "world", uri, name, ext, text };
};
