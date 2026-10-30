import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";

const REFERENCEABLE_ASSET_TYPES = new Set(["image", "audio", "video", "font"]);

export const getFileSymbol = (
  workspace: SparkdownLanguageServerWorkspace,
  uri: string,
): { name: string; type: string; symbolIds: string[] } | null => {
  const name = workspace.getFileName(uri);
  if (!name) {
    return null;
  }
  const type = workspace.getFileType(uri);
  if (REFERENCEABLE_ASSET_TYPES.has(type)) {
    return { name, type, symbolIds: [`${type}.${name}`] };
  }
  return null;
};
