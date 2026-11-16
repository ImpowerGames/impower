import { assetNameOf } from "@impower/sparkdown/src/attributes/imageFileName";
import path from "path";
import * as vscode from "vscode";

export const getWorkspaceImageFile = async (fileUri: vscode.Uri) => {
  const uri = fileUri.toString();
  const name = assetNameOf(uri, "image");
  const ext = path.extname(uri).slice(1);
  if (ext === "svg") {
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
  return { type: "image", uri, name, ext, version: null, languageId: null };
};
