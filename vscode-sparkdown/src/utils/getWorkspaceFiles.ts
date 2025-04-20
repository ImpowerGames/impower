import * as vscode from "vscode";
import { getWorkspaceAudioFile } from "./getWorkspaceAudioFile";
import { getWorkspaceFilePatterns } from "./getWorkspaceFilePatterns";
import { getWorkspaceFontFile } from "./getWorkspaceFontFile";
import { getWorkspaceImageFile } from "./getWorkspaceImageFile";
import { getWorkspaceScriptFile } from "./getWorkspaceScriptFile";
import { getWorkspaceWorldFile } from "./getWorkspaceWorldFile";

export const getWorkspaceFiles = async (): Promise<
  {
    type: string;
    uri: string;
    name: string;
    ext: string;
    text?: string;
  }[]
> => {
  const workspaceFilePatterns = getWorkspaceFilePatterns();
  const [
    scriptFileUris,
    imageFileUris,
    audioFileUris,
    fontFileUrls,
    worldFileUrls,
  ] = await Promise.all(
    workspaceFilePatterns.map((pattern) => vscode.workspace.findFiles(pattern))
  );
  return Promise.all([
    ...(scriptFileUris || []).map(getWorkspaceScriptFile),
    ...(imageFileUris || []).map(getWorkspaceImageFile),
    ...(audioFileUris || []).map(getWorkspaceAudioFile),
    ...(fontFileUrls || []).map(getWorkspaceFontFile),
    ...(worldFileUrls || []).map(getWorkspaceWorldFile),
  ]);
};
