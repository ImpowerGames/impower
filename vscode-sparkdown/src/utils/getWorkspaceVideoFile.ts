import path from "path";
import * as vscode from "vscode";

export const getWorkspaceVideoFile = async (fileUri: vscode.Uri) => {
  const uri = fileUri.toString();
  const name = path.parse(uri).name;
  const ext = path.extname(uri).slice(1);
  return { type: "video", name, uri, ext, version: null, languageId: null };
};
