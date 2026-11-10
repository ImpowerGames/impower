import { onProtocolMessage } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { DidChangeDirectoriesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeDirectoriesMessage";
import { DidChangeWatchedFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeWatchedFilesMessage";
import { assetEndings, assetTypeOf, isLinkPath } from "../utils/assetTypes";
import { availableName, NameError, plural } from "../utils/fileListModel";
import { canMoveFolder } from "../utils/fileTree";
import {
  recordCreate,
  recordMove,
  recordReferenceRename,
  recordTrashDeletion,
} from "../utils/fileUndo";
import getUniqueFileName from "../utils/getUniqueFileName";
import getValidFileName from "../utils/getValidFileName";
import { importFiles } from "../utils/importDroppedFiles";
import { renameOrReport } from "../utils/renameOrReport";
import { isScriptPath, scriptFilesGlob } from "../utils/scriptFiles";
import { assetsHome, landingFolder, type AssetListing } from "./assetsListing";
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

export default class WorkspaceAssets {
  protected readonly _workspace: Deps;

  protected _generation = 0;

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
    const home = assetsHome({ files: Object.fromEntries(byPath), folders });
    const files: AssetListing["files"] = {};
    for (const [path, file] of byPath) {
      if (!isInside(path, home) || nameOf(path).startsWith(".") || isScriptPath(path)) {
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
    let references: unknown[] = [];
    try {
      references = await ls.getFileReferences(fs.getFileUri(projectId, path));
    } catch {
      references = [];
    }
    if (references.length > 0 && this._workspace.autoRenameFiles()) {
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
    const { fs, window } = this._workspace;
    const items = outermost(paths);
    const since = Date.now();
    const folders = items.filter((p) => this.kindOf(p) === "folder");
    const uris = items
      .filter((p) => this.kindOf(p) === "file")
      .map((p) => fs.getFileUri(projectId, p));
    if (uris.length) {
      await fs.deleteFiles({ files: uris.map((uri) => ({ uri })), mode: "trash" });
    }
    const deletedFolders: string[] = [];
    for (const folder of folders) {
      const deleted = await fs.deleteFolder(projectId, folder, "trash");
      uris.push(...deleted.files.map((d) => d.uri));
      deletedFolders.push(...deleted.folders);
    }
    await window.recordAssetChange();
    const label =
      items.length === 1
        ? nameOf(items[0]!)
        : plural(items.length, folders.length ? "item" : "file");
    await recordTrashDeletion(projectId, uris, label, since, deletedFolders);
    await this.load();
  }
}
