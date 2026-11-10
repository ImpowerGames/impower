import { onProtocolMessage } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { DidChangeDirectoriesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeDirectoriesMessage";
import { DidChangeWatchedFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeWatchedFilesMessage";
import { assetEndings, assetTypeOf, isLinkPath } from "../utils/assetTypes";
import { availableName, NAME_MESSAGES, NameError, plural, validName } from "../utils/fileListModel";
import { IMAGE_HEADER_BYTES, imageSizeOf, type ImageSize } from "../utils/imageSize";
import { stemOf } from "../utils/imageStacks";
import { canMoveFolder } from "../utils/fileTree";
import { recordCreate, recordMove, recordReferenceRename } from "../utils/fileUndo";
import getUniqueFileName from "../utils/getUniqueFileName";
import getValidFileName from "../utils/getValidFileName";
import { importFiles } from "../utils/importDroppedFiles";
import { renameOrReport } from "../utils/renameOrReport";
import { isScriptPath, scriptFilesGlob } from "../utils/scriptFiles";
import { assetHomes, landingFolder, type AssetListing } from "./assetsListing";
import { moveToTrash } from "./moveToTrash";
import { isInside, joinPath, nameOf, outermost, parentOf } from "./scriptsListing";
import type WorkspaceFileSystem from "./WorkspaceFileSystem";
import type WorkspaceLanguageServer from "./WorkspaceLanguageServer";
import type WorkspaceWindow from "./WorkspaceWindow";
import workspace from "./WorkspaceStore";

type Deps = {
  fs: Pick<
    WorkspaceFileSystem,
    | "getFiles"
    | "getFolders"
    | "getFileUri"
    | "getFilename"
    | "getRelativePath"
    | "createFiles"
    | "createFolder"
    | "moveFile"
    | "moveFolder"
    | "renameFileWithReferences"
    | "deleteFiles"
    | "deleteFolder"
  >;
  ls: Pick<WorkspaceLanguageServer, "getFileReferences">;
  window: Pick<WorkspaceWindow, "recordScriptChange" | "recordAssetChange">;
  autoRenameFiles: () => boolean;
};

export interface DroppedFile {
  name: string;
  getBuffer: () => Promise<ArrayBuffer>;
}

const extensionOf = (path: string) => {
  const name = nameOf(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot) : "";
};

export const STACK_NAME_MESSAGE = "A stacked picture's name can't contain @ or ~.";

const MEASURE_BATCH = 8;

const readImageSize = async (src: string): Promise<ImageSize | null> => {
  try {
    const response = await fetch(src, { headers: { Range: `bytes=0-${IMAGE_HEADER_BYTES - 1}` } });
    if (!response.ok) {
      return null;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    return imageSizeOf(bytes.subarray(0, IMAGE_HEADER_BYTES)) ?? null;
  } catch {
    return null;
  }
};

export default class WorkspaceAssets {
  protected readonly _workspace: Deps;

  protected _generation = 0;

  protected readonly _measuring = new Set<string>();

  constructor(deps: Deps) {
    this._workspace = deps;
  }

  protected get projectId() {
    return workspace.signals.projectId.peek();
  }

  protected get listing(): AssetListing {
    return workspace.assetListing.peek() ?? { files: {}, folders: [] };
  }

  protected requireProject(): string {
    const projectId = this.projectId;
    if (!projectId) {
      throw new NameError("No project is open.");
    }
    return projectId;
  }

  async load(): Promise<AssetListing | null> {
    const projectId = this.projectId;
    if (!projectId) {
      return null;
    }
    const generation = ++this._generation;
    const { fs } = this._workspace;
    const all = await fs.getFiles(projectId);
    const folders = await fs.getFolders(projectId);
    const byPath = new Map(
      Object.entries(all).map(([uri, file]) => [fs.getRelativePath(projectId, uri), file]),
    );
    const homes = assetHomes({ files: Object.fromEntries(byPath), folders });
    const files: AssetListing["files"] = {};
    for (const [path, file] of byPath) {
      const inHome = homes.some((home) => isInside(path, home) && path !== home);
      if (!inHome || nameOf(path).startsWith(".") || isScriptPath(path)) {
        continue;
      }
      files[path] = {
        modified: file.modified ?? 0,
        size: file.size ?? 0,
        src: file.src,
        ...(isLinkPath(path) && file.src ? { address: file.src } : {}),
      };
    }
    if (generation !== this._generation || projectId !== this.projectId) {
      return null;
    }
    const listing = { projectId, files, folders };
    workspace.assetListing.value = listing;
    return listing;
  }

  watch(): () => void {
    const reload = () => void this.load();
    const detachEndings = scriptFilesGlob.subscribe(reload);
    const detachFiles = onProtocolMessage(DidChangeWatchedFilesMessage.type, reload);
    const detachFolders = onProtocolMessage(DidChangeDirectoriesMessage.type, reload);
    return () => {
      detachEndings();
      detachFiles();
      detachFolders();
    };
  }

  protected kindOf(path: string): "file" | "folder" {
    return Object.hasOwn(this.listing.files, path) ? "file" : "folder";
  }

  protected siblings(folder: string): string[] {
    const listing = this.listing;
    return [...Object.keys(listing.files), ...listing.folders]
      .filter((p) => parentOf(p) === folder)
      .map(nameOf);
  }

  async createFolder(parent: string, name: string): Promise<string> {
    const projectId = this.requireProject();
    const path = joinPath(parent, availableName(name, this.siblings(parent)));
    await this._workspace.fs.createFolder(projectId, path);
    await this._workspace.window.recordAssetChange();
    await this.load();
    return path;
  }

  async upload(files: readonly DroppedFile[], folder: string): Promise<string[]> {
    const projectId = this.requireProject();
    const listing = this.listing;
    const endings = assetEndings.peek();
    const written = await importFiles(
      projectId,
      files.map((file) => {
        const name = getValidFileName(file.name);
        return {
          rel: joinPath(landingFolder(listing, assetTypeOf(name, endings), folder), name),
          getBuffer: file.getBuffer,
        };
      }),
    );
    await this.load();
    return written;
  }

  async addLink(url: string, name: string, folder: string): Promise<string> {
    const projectId = this.requireProject();
    const { fs, window } = this._workspace;
    const filenames = Object.keys(await fs.getFiles(projectId)).map((uri) =>
      fs.getFilename(uri),
    );
    const filename = getUniqueFileName(filenames, `${getValidFileName(name) || "asset"}.url`);
    const type = assetTypeOf(filename, assetEndings.peek(), url);
    const path = joinPath(landingFolder(this.listing, type, folder), filename);
    const uri = fs.getFileUri(projectId, path);
    await fs.createFiles({ files: [{ uri, data: new TextEncoder().encode(url).buffer }] });
    await window.recordAssetChange();
    recordCreate(projectId, [uri], filename);
    await this.load();
    return path;
  }

  async rename(path: string, name: string): Promise<string> {
    const projectId = this.requireProject();
    const kind = this.kindOf(path);
    const folder = parentOf(path);
    const leaf = availableName(
      name,
      this.siblings(folder),
      kind === "file" ? extensionOf(path) : "",
      nameOf(path),
    );
    const to = joinPath(folder, leaf);
    if (to === path) {
      return path;
    }
    if (kind === "folder") {
      return this.moveFolder(projectId, path, to);
    }
    const { fs, ls, window } = this._workspace;
    let referenced = false;
    if (this._workspace.autoRenameFiles()) {
      try {
        referenced = (await ls.getFileReferences(fs.getFileUri(projectId, path))).length > 0;
      } catch {
        referenced = true;
      }
    }
    if (referenced) {
      const renamed = await renameOrReport(path, to, () =>
        fs.renameFileWithReferences(projectId, path, to),
      );
      if (!renamed.renamed) {
        return path;
      }
      await window.recordScriptChange();
      await window.recordAssetChange();
      recordReferenceRename(projectId, path, to);
    } else {
      const moved = await renameOrReport(path, to, () => fs.moveFile(projectId, path, to));
      if (!moved.renamed) {
        return path;
      }
      await window.recordAssetChange();
      recordMove(projectId, path, to, false);
    }
    await this.load();
    return to;
  }

  async measureImages(paths: readonly string[]): Promise<void> {
    const files = this.listing.files;
    const known = workspace.assetSizes.peek();
    const wanted = [
      ...new Set(
        paths
          .filter((path) => !isLinkPath(path))
          .map((path) => files[path]?.src)
          .filter((src): src is string => !!src && !Object.hasOwn(known, src) && !this._measuring.has(src)),
      ),
    ];
    if (!wanted.length) {
      return;
    }
    for (const src of wanted) this._measuring.add(src);
    const measured: Record<string, ImageSize | null> = {};
    for (let at = 0; at < wanted.length; at += MEASURE_BATCH) {
      await Promise.all(
        wanted.slice(at, at + MEASURE_BATCH).map(async (src) => {
          measured[src] = await readImageSize(src);
        }),
      );
    }
    for (const src of wanted) this._measuring.delete(src);
    workspace.assetSizes.value = { ...workspace.assetSizes.peek(), ...measured };
  }

  async renameStack(paths: readonly string[], base: string, name: string): Promise<string[]> {
    const stackName = validName(name);
    if (/[@~]/.test(stackName)) {
      throw new NameError(STACK_NAME_MESSAGE);
    }
    const renames = paths.map((path) => {
      const stem = stemOf(path);
      const next = stackName + stem.slice(base.length);
      return {
        path,
        name: next,
        leaf: availableName(next, this.siblings(parentOf(path)), extensionOf(path), nameOf(path)),
      };
    });
    const leaves = renames.map((rename) => `${parentOf(rename.path)}/${rename.leaf.toLowerCase()}`);
    if (new Set(leaves).size !== leaves.length) {
      throw new NameError(NAME_MESSAGES.taken);
    }
    const moved: string[] = [];
    for (const rename of renames) {
      moved.push(await this.rename(rename.path, rename.name));
    }
    return moved;
  }

  protected async moveFolder(projectId: string, from: string, to: string): Promise<string> {
    if (!canMoveFolder(from, to)) {
      return from;
    }
    const moved = await renameOrReport(from, to, () =>
      this._workspace.fs.moveFolder(projectId, from, to),
    );
    if (!moved.renamed) {
      return from;
    }
    await this._workspace.window.recordAssetChange();
    recordMove(projectId, from, to, true);
    await this.load();
    return to;
  }

  async remove(paths: readonly string[]): Promise<void> {
    const projectId = this.requireProject();
    const items = outermost(paths);
    const trashed = items.map((path) => ({ path, folder: this.kindOf(path) === "folder" }));
    const label =
      items.length === 1
        ? nameOf(items[0]!)
        : plural(items.length, trashed.some((item) => item.folder) ? "item" : "file");
    await moveToTrash(this._workspace.fs, projectId, trashed, label);
    await this._workspace.window.recordAssetChange();
    await this.load();
  }
}
