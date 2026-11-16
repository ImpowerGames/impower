import { assetNameOf } from "@impower/sparkdown/src/attributes/imageFileName";
import path from "path";
import * as vscode from "vscode";

export const getWorkspaceAudioFile = async (fileUri: vscode.Uri) => {
  const uri = fileUri.toString();
  const name = assetNameOf(uri, "audio");
  const ext = path.extname(uri).slice(1);
  return { type: "audio", name, uri, ext, version: null, languageId: null };
};
