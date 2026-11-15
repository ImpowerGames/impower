import {
  ADD_ASSET_COMMAND,
  missingAssetArgument,
  type FileAssetType,
  type MissingAsset,
} from "@impower/sparkdown/src/compiler/utils/missingAsset";
import { DEFAULT_MAIN_SCRIPT_FILENAME } from "@impower/sparkdown/src/compiler/utils/projectMembership";
import {
  ASSETS_HOME,
  FILE_TYPE_FOLDERS,
} from "@impower/spark-editor-protocol/src/utils/assetFolders";
import { endings } from "@impower/spark-editor-protocol/src/utils/fileEndings";
import * as vscode from "vscode";

const PATTERN_SETTINGS: Record<FileAssetType, string> = {
  image: "imageFiles",
  audio: "audioFiles",
  video: "videoFiles",
  font: "fontFiles",
};

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

const exists = (uri: vscode.Uri) =>
  Promise.resolve(vscode.workspace.fs.stat(uri)).then(
    () => true,
    () => false,
  );

const trimmed = (path: string) => path.replace(/\/+$/, "");

const projectRoot = async (): Promise<vscode.Uri | undefined> => {
  const active = vscode.window.activeTextEditor?.document.uri;
  const folder =
    (active && vscode.workspace.getWorkspaceFolder(active)?.uri) ??
    vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!active || !folder) {
    return folder;
  }
  const top = trimmed(folder.path);
  for (
    let dir = vscode.Uri.joinPath(active, "..");
    trimmed(dir.path) === top || trimmed(dir.path).startsWith(`${top}/`);
    dir = vscode.Uri.joinPath(dir, "..")
  ) {
    if (await exists(vscode.Uri.joinPath(dir, DEFAULT_MAIN_SCRIPT_FILENAME))) {
      return dir;
    }
    if (trimmed(dir.path) === top) {
      break;
    }
  }
  return folder;
};

const extensionOf = (uri: vscode.Uri) => {
  const leaf = uri.path.slice(uri.path.lastIndexOf("/") + 1);
  const dot = leaf.lastIndexOf(".");
  return dot > 0 ? leaf.slice(dot) : "";
};

export const addAsset = async ({ name, type }: MissingAsset) => {
  const root = await projectRoot();
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
      filters: { [FILE_TYPE_FOLDERS[type]]: endings(pattern) },
    })) ?? [];
  if (!picked) {
    return false;
  }
  const folder = await childFolder(
    await childFolder(root, ASSETS_HOME),
    FILE_TYPE_FOLDERS[type],
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
