import { assetNameOf } from "@impower/sparkdown/src/attributes/imageFileName";
import path from "path";
import * as vscode from "vscode";

export const getWorkspaceVideoFile = async (fileUri: vscode.Uri) => {
  const uri = fileUri.toString();
  const name = assetNameOf(uri, "video");
  const ext = path.extname(uri).slice(1);
  return { type: "video", name, uri, ext, version: null, languageId: null };
};
