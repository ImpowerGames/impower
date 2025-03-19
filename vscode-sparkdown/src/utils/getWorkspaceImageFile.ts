import path from "path";
import * as vscode from "vscode";

export const getWorkspaceImageFile = async (fileUri: vscode.Uri) => {
  const uri = fileUri.toString();
  const name = path.parse(uri).name;
  const ext = path.extname(uri).slice(1);
  if (ext === "svg") {
    const buffer = await vscode.workspace.fs.readFile(fileUri);
    const text = Buffer.from(buffer).toString("utf8");
    return { type: "image", uri, name, ext, text };
  }
  return { type: "image", uri, name, ext };
};
