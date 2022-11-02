import * as path from "path";
import * as vscode from "vscode";
import { SparkVariable } from "../../../sparkdown";
import { assetExts, audioExts, imageExts } from "../constants/extensions";
import { fileState } from "../state/fileState";
import { getWorkspaceRelativePath } from "./getWorkspaceRelativePath";

export const updateAssets = async (doc: vscode.TextDocument): Promise<void> => {
  const uri = doc.uri;
  const relativePath = getWorkspaceRelativePath(uri, assetExts);
  if (!relativePath) {
    return undefined;
  }
  const assetUris = await vscode.workspace.findFiles(relativePath);
  const assets: Record<string, SparkVariable> = {};
  assetUris.forEach((u) => {
    const parsedPath = path.parse(u.path);
    const name = parsedPath.name;
    const ext = parsedPath.ext.replace(".", "");
    const type = imageExts.includes(ext)
      ? "image"
      : audioExts.includes(ext)
      ? "audio"
      : "";
    if (type) {
      const id = `.${name}`;
      const sparkAsset: SparkVariable = {
        from: -1,
        to: -1,
        line: -1,
        type,
        name,
        value: u.path,
      };
      assets[id] = sparkAsset;
    }
  });
  const s = fileState[uri.toString()];
  if (s) {
    s.assets = assets;
  }
};
