import { onProtocolMessage } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { DidChangeDirectoriesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeDirectoriesMessage";
import { DidChangeWatchedFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeWatchedFilesMessage";
import { downloadFile } from "../utils/downloadFile";
import { recordMove, recordTrashDeletion } from "../utils/fileUndo";
import { availableName, copyName, NameError } from "../utils/fileListModel";
import { isScriptPath } from "../utils/scriptFiles";
import {
  isInside,
  joinPath,
  MAIN_SCRIPT,
  nameOf,
  parentOf,
  realFolder,
  scriptsHome,
  type ScriptListing,
} from "./scriptsListing";
import type WorkspaceFileSystem from "./WorkspaceFileSystem";
import type WorkspaceLanguageServer from "./WorkspaceLanguageServer";
import type WorkspaceWindow from "./WorkspaceWindow";
import workspace from "./WorkspaceStore";

export const MAIN_STAYS = "Main stays at the root of your story.";
export const INTO_ITSELF = "A folder cannot be moved inside itself.";

type Deps = {
  fs: Pick<
    WorkspaceFileSystem,
    | "getFiles"
    | "getFolders"
    | "getFileUri"
    | "getRelativePath"
    | "createFiles"
    | "createFolder"
    | "moveFile"
    | "moveFolder"
    | "readFile"
    | "zipFiles"
    | "deleteFiles"
    | "deleteFolder"
  >;
  ls: Pick<WorkspaceLanguageServer, "getScriptReferences">;
  window: Pick<
    WorkspaceWindow,
    | "recordScriptChange"
    | "recordAssetChange"
    | "openFileEditor"
    | "getActiveEditorForFile"
  >;
};

const extensionOf = (path: string) => {
  const name = nameOf(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot) : "";
};

export default class WorkspaceScripts {
  protected readonly _workspace: Deps;

  protected _generation = 0;

  constructor(deps: Deps) {
    this._workspace = deps;
  }

  protected isCurrent(generation: number, projectId: string) {
    return generation === this._generation && projectId === this.projectId;
  }

  protected get projectId() {
    return workspace.signals.projectId.peek();
  }

  protected get listing(): ScriptListing {
    return workspace.scriptListing.peek() ?? { files: {}, folders: [] };
  }

  async load(): Promise<ScriptListing | null> {
    const projectId = this.projectId;
    if (!projectId) {
      return null;
    }
    const generation = ++this._generation;
    const { fs } = this._workspace;
    const all = await fs.getFiles(projectId);
    const files: ScriptListing["files"] = {};
    for (const [uri, file] of Object.entries(all)) {
      const path = fs.getRelativePath(projectId, uri);
      if (isScriptPath(path)) {
        files[path] = { modified: file.modified ?? 0, size: file.size ?? 0 };
      }
    }
    const listing = {
      projectId,
      files,
      folders: await fs.getFolders(projectId),
    };
    if (!this.isCurrent(generation, projectId)) {
      return null;
    }
    if (workspace.scriptListing.peek()?.projectId !== projectId) {
      workspace.scriptReferences.value = [];
    }
    workspace.scriptListing.value = listing;
    await this.loadReferences(generation, projectId);
    return listing;
  }

  protected async loadReferences(generation: number, projectId: string) {
    const { fs, ls } = this._workspace;
    try {
      const references = await ls.getScriptReferences(
        fs.getFileUri(projectId, MAIN_SCRIPT),
      );
      if (!this.isCurrent(generation, projectId)) {
        return;
      }
      workspace.scriptReferences.value = references.map((r) => ({
        from: fs.getRelativePath(projectId, r.from),
        to: fs.getRelativePath(projectId, r.to),
        divert: r.divert,
      }));
    } catch (error) {
      console.error("[WorkspaceScripts] sparkdown/scriptReferences failed; Uses and Story order keep the last references read:", error);
    }
  }

  watch(): () => void {
    void this.load();
    const reload = () => void this.load();
    const detachFiles = onProtocolMessage(DidChangeWatchedFilesMessage.type, reload);
    const detachFolders = onProtocolMessage(DidChangeDirectoriesMessage.type, reload);
    return () => {
      detachFiles();
      detachFolders();
    };
  }

  protected kindOf(path: string): "file" | "folder" {
    return Object.hasOwn(this.listing.files, path) ? "file" : "folder";
  }

  protected siblings(folder: string): string[] {
    const listing = this.listing;
    return [
      ...Object.keys(listing.files),
      ...listing.folders,
    ]
      .filter((p) => parentOf(p) === folder)
      .map(nameOf);
  }

  protected async changed(kind: "file" | "folder") {
    const { window } = this._workspace;
    await window.recordScriptChange();
    if (kind === "folder") {
      await window.recordAssetChange();
    }
    await this.load();
  }

  async create(kind: "script" | "folder", folder: string, name: string): Promise<string> {
    const projectId = this.projectId;
    if (!projectId) {
      throw new NameError("No project is open.");
    }
    const target = realFolder(folder, scriptsHome(this.listing));
    const leaf = availableName(name, this.siblings(target), kind === "script" ? ".sd" : "");
    const path = joinPath(target, leaf);
    const { fs } = this._workspace;
    if (kind === "script") {
      await fs.createFiles({
        files: [{ uri: fs.getFileUri(projectId, path), data: new ArrayBuffer(0) }],
      });
    } else {
      await fs.createFolder(projectId, path);
    }
    await this.changed(kind === "script" ? "file" : "folder");
    return path;
  }

  protected async relocate(from: string, to: string) {
    const projectId = this.projectId!;
    const kind = this.kindOf(from);
    const { fs, window } = this._workspace;
    const openEditors = Object.keys(this.listing.files).filter(
      (path) => isInside(path, from) && window.getActiveEditorForFile(path)?.open,
    );
    if (kind === "file") {
      await fs.moveFile(projectId, from, to);
    } else {
      await fs.moveFolder(projectId, from, to);
    }
    recordMove(projectId, from, to, kind === "folder");
    for (const path of openEditors) {
      window.openFileEditor(to + path.slice(from.length), path);
    }
    await this.changed(kind);
    return to;
  }

  async rename(path: string, name: string): Promise<string> {
    if (path === MAIN_SCRIPT) {
      throw new NameError(MAIN_STAYS);
    }
    const kind = this.kindOf(path);
    const folder = parentOf(path);
    const leaf = availableName(
      name,
      this.siblings(folder),
      kind === "file" ? extensionOf(path) : "",
      nameOf(path),
    );
    const to = joinPath(folder, leaf);
    return to === path ? path : this.relocate(path, to);
  }

  async move(path: string, folder: string): Promise<string> {
    if (path === MAIN_SCRIPT) {
      throw new NameError(MAIN_STAYS);
    }
    const home = scriptsHome(this.listing);
    const target = realFolder(folder, home);
    if (this.kindOf(path) === "folder" && isInside(target, path)) {
      throw new NameError(INTO_ITSELF);
    }
    if (parentOf(path) === target) {
      return path;
    }
    const leaf = availableName(nameOf(path), this.siblings(target));
    return this.relocate(path, joinPath(target, leaf));
  }

  async duplicate(path: string): Promise<string> {
    const projectId = this.projectId!;
    const { fs } = this._workspace;
    const kind = this.kindOf(path);
    const extension = kind === "file" ? extensionOf(path) : "";
    const stem = nameOf(path).slice(0, nameOf(path).length - extension.length);
    const folder = parentOf(path);
    const to = joinPath(folder, copyName(stem, this.siblings(folder), extension));
    const listing = this.listing;
    const sources =
      kind === "file"
        ? [path]
        : Object.keys(listing.files).filter((p) => isInside(p, path));
    if (kind === "folder") {
      const folders = listing.folders
        .filter((f) => isInside(f, path))
        .map((f) => to + f.slice(path.length));
      for (const created of folders.includes(to) ? folders : [to, ...folders]) {
        await fs.createFolder(projectId, created);
      }
    }
    const files = await Promise.all(
      sources.map(async (source) => ({
        uri: fs.getFileUri(projectId, to + source.slice(path.length)),
        data: await fs.readFile({ file: { uri: fs.getFileUri(projectId, source) } }),
      })),
    );
    if (files.length) {
      await fs.createFiles({ files });
    }
    await this.changed(kind);
    return to;
  }

  async download(path: string): Promise<void> {
    const projectId = this.projectId!;
    const { fs } = this._workspace;
    if (this.kindOf(path) === "file") {
      const data = await fs.readFile({ file: { uri: fs.getFileUri(projectId, path) } });
      downloadFile(nameOf(path), "text/plain", data);
      return;
    }
    const files = Object.keys(this.listing.files)
      .filter((p) => isInside(p, path))
      .map((p) => ({ uri: fs.getFileUri(projectId, p), path: p.slice(path.length + 1) }));
    const zip = await fs.zipFiles({ files });
    downloadFile(`${nameOf(path)}.zip`, "application/zip", zip);
  }

  async remove(path: string): Promise<void> {
    if (path === MAIN_SCRIPT) {
      throw new NameError(MAIN_STAYS);
    }
    const projectId = this.projectId!;
    const { fs } = this._workspace;
    const since = Date.now();
    if (this.kindOf(path) === "folder") {
      const deleted = await fs.deleteFolder(projectId, path, "trash");
      await recordTrashDeletion(
        projectId,
        deleted.files.map((d) => d.uri),
        nameOf(path),
        since,
        deleted.folders,
      );
      await this.changed("folder");
      return;
    }
    const uri = fs.getFileUri(projectId, path);
    await fs.deleteFiles({ files: [{ uri }], mode: "trash" });
    await recordTrashDeletion(projectId, [uri], nameOf(path), since);
    await this.changed("file");
  }
}
