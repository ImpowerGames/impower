import {
  ADD_ASSET_COMMAND,
  missingAssetArgument,
  type FileAssetType,
  type MissingAsset,
} from "@impower/sparkdown/src/compiler/utils/missingAsset";
import * as vscode from "vscode";

const ASSETS_FOLDER = "assets";

const TYPE_FOLDERS: Record<FileAssetType, string> = {
  image: "Images",
  audio: "Audio",
  video: "Video",
  font: "Fonts",
};

const PATTERN_SETTINGS: Record<FileAssetType, string> = {
  image: "imageFiles",
  audio: "audioFiles",
  video: "videoFiles",
  font: "fontFiles",
};

export const patternEndings = (pattern: string): string[] => [
  ...new Set(
    pattern
      .toLowerCase()
      .split(/[\s,;{}]+/)
      .map((ending) => ending.replace(/^[*.]+/, ""))
      .filter((ending) => /^[a-z0-9]+$/.test(ending)),
  ),
];

const childFolder = async (parent: vscode.Uri, name: string) => {
  const entries = await Promise.resolve(
    vscode.workspace.fs.readDirectory(parent),
  ).catch(() => [] as [string, vscode.FileType][]);
  const found = entries.find(
    ([entry, kind]) =>
      kind === vscode.FileType.Directory &&
      entry.toLowerCase() === name.toLowerCase(),
  );
  return vscode.Uri.joinPath(parent, found?.[0] ?? name);
};

const projectRoot = (): vscode.Uri | undefined => {
  const active = vscode.window.activeTextEditor?.document.uri;
  return (
    (active && vscode.workspace.getWorkspaceFolder(active)?.uri) ??
    vscode.workspace.workspaceFolders?.[0]?.uri
  );
};

const extensionOf = (uri: vscode.Uri) => {
  const leaf = uri.path.slice(uri.path.lastIndexOf("/") + 1);
  const dot = leaf.lastIndexOf(".");
  return dot > 0 ? leaf.slice(dot) : "";
};

export const addAsset = async ({ name, type }: MissingAsset) => {
  const root = projectRoot();
  if (!root) {
    return false;
  }
  const pattern = vscode.workspace
    .getConfiguration("sparkdown")
    .get<string>(PATTERN_SETTINGS[type], "");
  const [picked] =
    (await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      openLabel: `Add as ${name}`,
      title: `Add ${name} to assets`,
      filters: { [TYPE_FOLDERS[type]]: patternEndings(pattern) },
    })) ?? [];
  if (!picked) {
    return false;
  }
  const folder = await childFolder(
    await childFolder(root, ASSETS_FOLDER),
    TYPE_FOLDERS[type],
  );
  const target = vscode.Uri.joinPath(folder, name + extensionOf(picked));
  try {
    await vscode.workspace.fs.createDirectory(folder);
    await vscode.workspace.fs.copy(picked, target, { overwrite: false });
  } catch (error) {
    void vscode.window.showErrorMessage(
      error instanceof vscode.FileSystemError && error.code === "FileExists"
        ? `${vscode.workspace.asRelativePath(target)} already exists.`
        : `Could not add ${name}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
  void vscode.window.showInformationMessage(
    `Added ${vscode.workspace.asRelativePath(target)}.`,
  );
  return true;
};

export const activateAddAsset = (context: vscode.ExtensionContext) => {
  context.subscriptions.push(
    vscode.commands.registerCommand(ADD_ASSET_COMMAND, (argument: unknown) => {
      const asset = missingAssetArgument(argument);
      return asset ? addAsset(asset) : false;
    }),
  );
};
