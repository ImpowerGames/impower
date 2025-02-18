import * as path from "path";
import * as vscode from "vscode";
import {
  ASSET_FILE_EXTENSIONS,
  AUDIO_FILE_EXTENSIONS,
  IMAGE_FILE_EXTENSIONS,
} from "../constants/FILE_EXTENSIONS";
import { fileState } from "../state/fileState";
import { getWorkspaceRelativePath } from "./getWorkspaceRelativePath";

export const updateAssets = async (doc: vscode.TextDocument): Promise<void> => {
  const uri = doc.uri;
  const relativePath = getWorkspaceRelativePath(uri, ASSET_FILE_EXTENSIONS);
  if (!relativePath) {
    return undefined;
  }
  const assetUris = await vscode.workspace.findFiles(relativePath);
  const assets: Record<string, any> = {};
  assetUris.forEach((u) => {
    const parsedPath = path.parse(u.path);
    const name = parsedPath.name;
    const ext = parsedPath.ext.replace(".", "");
    const type = IMAGE_FILE_EXTENSIONS.includes(ext)
      ? "image"
      : AUDIO_FILE_EXTENSIONS.includes(ext)
      ? "audio"
      : "";
    if (type) {
      const fileUrl = u.path;
      const structName = name || "";
      const sparkAsset = {
        from: -1,
        to: -1,
        line: -1,
        base: "",
        type,
        name: structName,
        fields: {
          [".src"]: {
            from: -1,
            to: -1,
            line: -1,
            name: "src",
            type: "string",
            value: fileUrl,
            valueText: `"${fileUrl}"`,
          },
        },
      };
      assets[structName] = sparkAsset;
    }
  });
  const s = fileState[uri.toString()] || {};
  s.assets = assets;
  fileState[uri.toString()] = s;
};
