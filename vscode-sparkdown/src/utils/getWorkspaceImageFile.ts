import path from "path";
import * as vscode from "vscode";
import { imageFileRevisions } from "./imageFileRevisions";

export const getWorkspaceImageFile = async (fileUri: vscode.Uri) => {
  const uri = fileUri.toString();
  const name = path.parse(uri).name;
  const ext = path.extname(uri).slice(1);
  if (ext.toLowerCase() === "svg") {
    const buffer = await vscode.workspace.fs.readFile(fileUri);
    const text = Buffer.from(buffer).toString("utf8");
    return {
      type: "image",
      uri,
      name,
      ext,
      text,
      version: null,
      languageId: null,
    };
  }
  return {
    type: "image", uri, name, ext,
    version: vscode.env.uiKind === vscode.UIKind.Desktop
      ? imageFileRevisions.register(uri)
      : null,
    languageId: null,
  };
};
