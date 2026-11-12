import type * as LSP from "@impower/spark-editor-protocol/src/types";
import { sendProtocolMessage } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { MessageProtocolRequestType } from "@impower/spark-editor-protocol/src/protocols/MessageProtocolRequestType";
import {
  ApplyWorkspaceEditMessage,
  ApplyWorkspaceEditResult,
  WorkspaceEdit,
  WorkspaceEditMetadata,
  WorkspaceEditRollback,
} from "@impower/spark-editor-protocol/src/protocols/workspace/ApplyWorkspaceEditMessage";
import { ConfigurationMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ConfigurationMessage";
import { SETTINGS_JSON_PATH } from "./settings/settingsJson";
import { DidChangeConfigurationMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeConfigurationMessage";
import { DidChangeDirectoriesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeDirectoriesMessage";
import { DidChangeWatchedFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeWatchedFilesMessage";
import { DidCreateFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidCreateFilesMessage";
import { DidDeleteFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidDeleteFilesMessage";
import { DidRenameFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidRenameFilesMessage";
import { DidWriteFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidWriteFilesMessage";
import { DirectoriesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DirectoriesMessage";
import {
  ExecuteCommandMessage,
  ExecuteCommandParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/ExecuteCommandMessage";
import {
  ReadDirectoryFilesMessage,
  ReadDirectoryFilesParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/ReadDirectoryFilesMessage";
import {
  ReadFileMessage,
  ReadFileParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/ReadFileMessage";
import { UnzipFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/UnzipFilesMessage";
import {
  WillCreateFilesMessage,
  WillCreateFilesParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/WillCreateFilesMessage";
import {
  WillDeleteFilesMessage,
  WillDeleteFilesParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/WillDeleteFilesMessage";
import {
  WillRenameFilesMessage,
  WillRenameFilesParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/WillRenameFilesMessage";
import { TrashFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/TrashFilesMessage";
import { TrashBatch } from "@impower/spark-editor-protocol/src/types/workspace/TrashBatch";
import { WillWriteFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/WillWriteFilesMessage";
import {
  ZipFilesMessage,
  ZipFilesParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/ZipFilesMessage";
import {
  FileCommit,
  FileCommits,
  FileData,
  ProjectMetadataField,
} from "@impower/spark-editor-protocol/src/types";
import { isSupersededCommit } from "@impower/spark-editor-protocol/src/utils/fileCommits";
import { withParams } from "@impower/spark-editor-protocol/src/utils/withParams";
import { assetEndings, assetTypeOf } from "../utils/assetTypes";
import {
  planClash,
  reasonOf,
  settleFailedMoves,
  snapshotPaths,
  type FileMove,
  type RenameOutcome,
} from "../utils/fileMoves";
import { imageStacks } from "../utils/imageStacks";
import SingletonPromise from "./SingletonPromise";
import type WorkspaceConfiguration from "./WorkspaceConfiguration";
import { WorkspaceConstants } from "./WorkspaceConstants";
import type WorkspaceLanguageServer from "./WorkspaceLanguageServer";
import workspace from "./WorkspaceStore";
import {
  findProjectRoot,
  isArchiveDropping,
  ProjectImportError,
} from "./projectImport";
import getTextBuffer from "./utils/getTextBuffer";
import { bundleScripts, splitScriptBundle } from "./utils/scriptBundle";
import {
  canMoveFolder,
  computeFolderMoves,
  computeLayoutMigrationBatches,
  foldersWithoutFiles,
  canWriteLayoutMarker,
  isProjectMetadata,
  LAYOUT_MARKER,
  layoutSubtreeFor,
  needsFolderMigration,
  planFolderMigration,
} from "../utils/fileTree";

const cmp = (a: any, b: any) => {
  if (a > b) return +1;
  if (a < b) return -1;
  return 0;
};

const SETTINGS_JSON_FOLDER = SETTINGS_JSON_PATH.slice(
  0,
  SETTINGS_JSON_PATH.lastIndexOf("/") + 1,
);

const withoutSettingsJson = <T extends { filename: string }>(
  entries: T[],
): T[] => {
  const rest = entries.filter(
    ({ filename }) => filename !== SETTINGS_JSON_PATH,
  );
  const folderHoldsMore = rest.some(
    ({ filename }) =>
      filename.startsWith(SETTINGS_JSON_FOLDER) &&
      filename !== SETTINGS_JSON_FOLDER,
  );
  return folderHoldsMore
    ? rest
    : rest.filter(({ filename }) => filename !== SETTINGS_JSON_FOLDER);
};

const REFERENCE_ATTEMPTS = 3;

const LINE_BREAK = String.fromCharCode(10);

const CARRIAGE_RETURN = String.fromCharCode(13);

interface ReferenceEdits {
  texts: LSP.TextDocumentEdit[];
  siblings: FileMove[];
  scripts: Map<string, string>;
}

const leafOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

const symbolOf = (path: string) => leafOf(path).split(".")[0]!;

const normalized = (text: string) =>
  text.split(CARRIAGE_RETURN + LINE_BREAK).join(LINE_BREAK).split(CARRIAGE_RETURN).join(LINE_BREAK);

const offsetAt = (lines: readonly string[], position: LSP.Position) => {
  let offset = 0;
  for (let line = 0; line < position.line && line < lines.length; line += 1) {
    offset += lines[line]!.length + 1;
  }
  return offset + position.character;
};

const withEdits = (text: string, edits: readonly (LSP.TextEdit | LSP.AnnotatedTextEdit | LSP.SnippetTextEdit)[]) => {
  const lines = text.split(LINE_BREAK);
  return edits
    .filter((edit): edit is LSP.TextEdit => "newText" in edit)
    .map((edit) => ({ from: offsetAt(lines, edit.range.start), to: offsetAt(lines, edit.range.end), newText: edit.newText }))
    .sort((a, b) => b.from - a.from)
    .reduce((result, edit) => result.slice(0, edit.from) + edit.newText + result.slice(edit.to), text);
};

const sameReferenceEdits = (a: ReferenceEdits, b: ReferenceEdits) =>
  JSON.stringify([a.texts.map((change) => [change.textDocument.uri, change.edits]), a.siblings, [...a.scripts]]) ===
  JSON.stringify([b.texts.map((change) => [change.textDocument.uri, change.edits]), b.siblings, [...b.scripts]]);

const textAt = (text: string, range: LSP.Range) => {
  const lines = text.split(LINE_BREAK);
  return text.slice(offsetAt(lines, range.start), offsetAt(lines, range.end));
};

export default class WorkspaceFileSystem {
  protected _worker: Worker;

  protected _initialFilesRef = new SingletonPromise(
    this.loadInitialFiles.bind(this),
  );

  protected _scheme = "file://";
  get scheme() {
    return this._scheme;
  }

  protected _loadedProjectId?: string;

  protected _files?: Record<string, FileData>;

  protected _unstoredUris = new Set<string>();

  protected _folders = new Set<string>();

  protected _ls: WorkspaceLanguageServer;

  protected _configuration: WorkspaceConfiguration;

  constructor(
    ls: WorkspaceLanguageServer,
    configuration: WorkspaceConfiguration,
  ) {
    this._ls = ls;
    this._configuration = configuration;
    const projectId = this.getLoadedProjectId();
    this._loadedProjectId = projectId;
    this._worker = new Worker("/opfs-workspace.js");
    this._worker.onerror = (e) => {
      console.error(e);
    };
    this._worker.addEventListener("message", this.handleWorkerMessage);
    configuration.onDidChange((params) => {
      this._worker.postMessage(
        DidChangeConfigurationMessage.type.notification(params),
      );
    });
    void this._initialFilesRef.get(projectId).catch((e) => {
      console.error("[workspace] initial file load failed:", e);
    });
  }

  getLoadedProjectId() {
    return workspace.current.project.id || WorkspaceConstants.LOCAL_PROJECT_ID;
  }

  protected async loadInitialFiles(projectId: string) {
    const { files, folders } = await this.withProjectLock(projectId, () =>
      this.openProjectStore(projectId),
    );
    this._folders = new Set(folders.map((p) => this.getFileUri(projectId, p)));
    this._files ??= {};
    const changedDuringLoad = this._changedDuringLoad ?? new Set<string>();
    this._changedDuringLoad = undefined;
    const result: Record<string, FileData> = {};
    files.forEach((file) => {
      this._files ??= {};
      if (!changedDuringLoad.has(file.uri)) {
        this._files[file.uri] = { ...file };
      }
      result[file.uri] = file;
    });
    const mainScriptUri = this.getFileUri(projectId, "main.sd");
    if (
      !files.some((f) => f.uri === mainScriptUri) &&
      !this._files[mainScriptUri]
    ) {
      this._files ??= {};
      const text = ["scene start", "  ", "end", ""].join("\n");
      const encoder = new TextEncoder();
      const encodedText = encoder.encode(text);
      this._unstoredUris.add(mainScriptUri);
      this._files[mainScriptUri] = {
        name: "main",
        ext: "sd",
        type: "script",
        uri: mainScriptUri,
        version: 0,
        languageId: "sparkdown",
        text,
        src: URL.createObjectURL(
          new Blob([encodedText], { type: "text/plain" }),
        ),
      };
    }
    this._ls.connection.onRequest(
      ExecuteCommandMessage.method,
      async (params: ExecuteCommandParams) => {
        return this.executeCommand(params);
      },
    );
    void this._ls
      .start(this.getDirectoryUri(projectId), Object.values(this._files))
      .catch((e) => {
        console.error("[workspace] language server failed to start:", e);
      });
    void this.purgeExpiredTrash(projectId);
    return result;
  }

  protected async withProjectLock<T>(
    projectId: string,
    task: () => Promise<T>,
  ): Promise<T> {
    const locks = globalThis.navigator?.locks;
    return locks
      ? locks.request(`impower-workspace-open:${projectId}`, task)
      : task();
  }

  protected async openProjectStore(projectId: string) {
    const directoryUri = this.getDirectoryUri(projectId);
    const readFiles = () => {
      this._changedDuringLoad = new Set();
      return this.readDirectoryFiles({
        directory: { uri: directoryUri },
      });
    };
    const pathsOf = (list: FileData[]) =>
      list.map((f) => this.getRelativePath(projectId, f.uri));
    let files = await readFiles();
    let folders = await this.listFolders(projectId);
    const relativePaths = pathsOf(files);
    const migrateFolders = needsFolderMigration(relativePaths);
    const writeLayoutMarker = canWriteLayoutMarker(relativePaths);
    let paths = relativePaths;
    let foldersMigrated = migrateFolders;
    if (migrateFolders) {
      const plan = planFolderMigration(
        files.map((f) => ({
          path: this.getRelativePath(projectId, f.uri),
          size: f.size,
        })),
        folders,
      );
      if (plan.legacyFiles.length > 0) {
        await this.deleteFiles({
          files: plan.legacyFiles.map((p) => ({
            uri: this.getFileUri(projectId, p),
          })),
        }).catch((e) => {
          console.warn("[workspace] legacy .folder files not all removed:", e);
        });
        files = await readFiles();
        paths = pathsOf(files);
        foldersMigrated = !plan.legacyFiles.some((p) => paths.includes(p));
      }
      await this.deleteFolders(projectId, plan.staleFolders);
      folders = await this.listFolders(projectId);
    }
    const emptyFolders = foldersWithoutFiles(paths, folders);
    const batches = computeLayoutMigrationBatches(
      paths,
      layoutSubtreeFor,
      emptyFolders,
    );
    for (const batch of batches) {
      try {
        await this.renameFiles({
          files: batch.map((m) => ({
            oldUri: this.getFileUri(projectId, m.from),
            newUri: this.getFileUri(projectId, m.to),
          })),
        });
      } catch (err) {
        console.error("Layout migration stopped at a refused move", err);
        throw err;
      }
    }
    if (batches.length > 0) {
      await this.deleteFolders(
        projectId,
        foldersWithoutFiles(
          pathsOf(await readFiles()),
          await this.listFolders(projectId),
          emptyFolders,
        ),
      );
    }
    if (writeLayoutMarker) {
      await this.writeProjectMetadata(projectId, "layout", "1");
    }
    if (foldersMigrated) {
      await this.writeProjectMetadata(projectId, "folders", "1");
    }
    if (batches.length > 0 || writeLayoutMarker || migrateFolders) {
      files = await readFiles();
      folders = await this.listFolders(projectId);
    }
    return { files, folders };
  }

  async executeCommand(params: ExecuteCommandParams) {
    if (params.command === "sparkdown.getFileText") {
      const [uri] = params.arguments || [];
      const result = await this.getFileText(uri);
      return result;
    }
    if (params.command === "sparkdown.getFileSrc") {
      const [uri] = params.arguments || [];
      const result = await this.getFileSrc(uri);
      return result;
    }
    if (params.command === "sparkdown.getFileVersion") {
      const [uri] = params.arguments || [];
      const result = await this.getFileVersion(uri);
      return result;
    }
    if (params.command === "sparkdown.getFileLanguageId") {
      const [uri] = params.arguments || [];
      const result = await this.getFileLanguageId(uri);
      return result;
    }
    if (params.command === "sparkdown.inspect") {
      return null;
    }
    return undefined;
  }

  async getFileText(uri: string) {
    const buffer = await this.readFile({ file: { uri } });
    const text = new TextDecoder("utf-8").decode(buffer);
    return text;
  }

  async getFileSrc(uri: string) {
    return this._files?.[uri]?.src;
  }

  async getFileVersion(uri: string) {
    return this._files?.[uri]?.version;
  }

  async getFileLanguageId(uri: string) {
    return this._files?.[uri]?.languageId;
  }

  protected _commits = new Map<string, FileCommit>();

  protected _changedDuringLoad?: Set<string>;

  protected noteChanged(uris: string[]) {
    uris.forEach((uri) => this._changedDuringLoad?.add(uri));
  }

  protected acceptCommit(uri: string, commits: FileCommits | undefined) {
    const commit = commits?.[uri];
    if (!commit) {
      return true;
    }
    if (isSupersededCommit(commit, this._commits.get(uri))) {
      return false;
    }
    this._commits.set(uri, commit);
    return true;
  }

  protected _messageQueue: Record<
    string,
    { resolve: (result: any) => void; reject: (err: any) => void }
  > = {};

  protected handleWorkerMessage = async (event: MessageEvent) => {
    const message = event.data;
    if (ConfigurationMessage.type.isRequest(message)) {
      const params = message.params;
      const result = params.items.map((item) => {
        if (item.section === "sparkdown") {
          return this._configuration.settings;
        }
        return {};
      });
      this._worker.postMessage(
        ConfigurationMessage.type.response(message.id, result),
      );
    } else if (DidWriteFilesMessage.type.isNotification(message)) {
      const { files, commits } = message.params;
      const fresh = files.filter((f) => this.acceptCommit(f.uri, commits));
      if (files.length > 0 && fresh.length === 0) {
        return;
      }
      fresh.forEach((file) => {
        this._files ??= {};
        this._files[file.uri] = { ...file };
        this._unstoredUris.delete(file.uri);
      });
      this.noteChanged(fresh.map((f) => f.uri));
      this.addFolderUris(
        fresh.flatMap((file) => this.parentFolderUris(file.uri)),
      );
      sendProtocolMessage(withParams(message, { files: fresh }));
    } else if (DidChangeDirectoriesMessage.type.isNotification(message)) {
      const { created, deleted, commits } = message.params;
      const freshCreated = created.filter((uri) =>
        this.acceptCommit(uri, commits),
      );
      const freshDeleted = deleted.filter((uri) =>
        this.acceptCommit(uri, commits),
      );
      if (
        created.length + deleted.length > 0 &&
        freshCreated.length + freshDeleted.length === 0
      ) {
        return;
      }
      this.removeFolderUris(freshDeleted);
      this.addFolderUris(freshCreated);
      sendProtocolMessage(
        withParams(message, { created: freshCreated, deleted: freshDeleted }),
      );
    } else if (DidCreateFilesMessage.type.isNotification(message)) {
      const { files, commits } = message.params;
      const fresh = files.filter((f) => this.acceptCommit(f.uri, commits));
      if (files.length > 0 && fresh.length === 0) {
        return;
      }
      const forwarded = withParams(message, { files: fresh });
      this._ls.connection.sendNotification(forwarded.method, forwarded.params);
      sendProtocolMessage(forwarded);
    } else if (DidDeleteFilesMessage.type.isNotification(message)) {
      const { files, commits } = message.params;
      const fresh = files.filter((f) => this.acceptCommit(f.uri, commits));
      if (files.length > 0 && fresh.length === 0) {
        return;
      }
      fresh.forEach((file) => {
        delete this._files?.[file.uri];
      });
      this.noteChanged(fresh.map((f) => f.uri));
      const forwarded = withParams(message, { files: fresh });
      this._ls.connection.sendNotification(forwarded.method, forwarded.params);
      sendProtocolMessage(forwarded);
    } else if (DidRenameFilesMessage.type.isNotification(message)) {
      const { files, commits } = message.params;
      const fresh = files.filter((f) => this.acceptCommit(f.oldUri, commits));
      if (files.length > 0 && fresh.length === 0) {
        return;
      }
      fresh.forEach((file) => {
        delete this._files?.[file.oldUri];
      });
      this.noteChanged(fresh.map((f) => f.oldUri));
      const forwarded = withParams(message, { files: fresh });
      this._ls.connection.sendNotification(forwarded.method, forwarded.params);
      sendProtocolMessage(forwarded);
    } else if (DidChangeWatchedFilesMessage.type.isNotification(message)) {
      const { changes, commits } = message.params;
      const fresh = changes.filter((c) => this.acceptCommit(c.uri, commits));
      if (changes.length > 0 && fresh.length === 0) {
        return;
      }
      const forwarded = withParams(message, { changes: fresh });
      this._ls.connection.sendNotification(forwarded.method, forwarded.params);
      sendProtocolMessage(forwarded);
    } else if (message.error) {
      const handler = this._messageQueue[message.id];
      if (handler) {
        handler.reject(message.error);
        delete this._messageQueue[message.id];
      }
    } else if (message.result !== undefined) {
      const handler = this._messageQueue[message.id];
      if (handler) {
        handler.resolve(message.result);
        delete this._messageQueue[message.id];
      }
    } else {
      console.error("Unrecognized message: ", message);
    }
  };

  protected async sendRequest<M extends string, P, R>(
    type: MessageProtocolRequestType<M, P, R>,
    params: P,
    transfer: Transferable[] = [],
  ): Promise<R> {
    return new Promise((resolve, reject) => {
      const request = type.request(params);
      this._messageQueue[request.id] = { resolve, reject };
      this._worker.postMessage(request, transfer);
    });
  }

  getUriFromPath(path: string) {
    const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
    return this._scheme + normalizedPath;
  }

  getDirectoryUri(projectId: string) {
    return `${this._scheme}${projectId}`;
  }

  getFileUri(projectId: string, filename: string) {
    return `${this.getDirectoryUri(projectId)}/${filename}`;
  }

  getFilename(uri: string) {
    return uri.split("/").slice(-1).join("");
  }

  getDisplayName(uri: string) {
    const fileName = this.getFilename(uri);
    const dot = fileName.lastIndexOf(".");
    if (dot <= 0) {
      return dot === 0 ? "" : fileName;
    }
    return fileName.slice(0, dot);
  }

  async getFiles(projectId: string) {
    if (this._loadedProjectId !== projectId) {
      throw new Error(`Project not loaded: ${projectId}`);
    }
    await this._initialFilesRef.get(projectId);
    if (!this._files) {
      throw new Error("Workspace File System not initialized.");
    }
    return this._files;
  }

  async readDirectoryFiles(
    params: ReadDirectoryFilesParams,
  ): Promise<FileData[]> {
    return this.sendRequest(ReadDirectoryFilesMessage.type, params);
  }

  async readProjectMetadata(projectId: string, field: ProjectMetadataField) {
    const uri = this.getFileUri(projectId, `.${field}`);
    const files = await this.getFiles(projectId);
    const file = files[uri];
    const name = file?.text || "";
    return name;
  }

  async writeProjectMetadata(
    projectId: string,
    field: ProjectMetadataField,
    value: string,
  ) {
    const uri = this.getFileUri(projectId, `.${field}`);
    await this.writeTextDocument({
      textDocument: { uri, version: 0, text: value },
    });
  }

  async readProjectZip(
    projectId: string,
    settingsJson?: string,
  ): Promise<ArrayBuffer> {
    const allFiles = await this.getFiles(projectId);
    const layoutMarkerUri = this.getFileUri(projectId, LAYOUT_MARKER);
    const files = Object.values(allFiles)
      .sort((a, b) => cmp(a.ext, b.ext) || cmp(a.name, b.name))
      .filter(
        (file) =>
          !isProjectMetadata(this.getRelativePath(projectId, file.uri)) ||
          file.uri === layoutMarkerUri,
      )
      .map(({ uri, text }) => ({
        uri,
        text,
        path: this.getRelativePath(projectId, uri),
      }))
      .filter(({ path }) => path !== SETTINGS_JSON_PATH);
    const encode = (text: string) =>
      new TextEncoder().encode(text).buffer as ArrayBuffer;
    const entries = files
      .filter(({ uri }) => !this.isStored(uri))
      .map(({ path, text }) => ({ path, data: encode(text ?? "") }));
    if (settingsJson !== undefined) {
      entries.push({ path: SETTINGS_JSON_PATH, data: encode(settingsJson) });
    }
    return this.zipFiles({
      files: files
        .filter(({ uri }) => this.isStored(uri))
        .map(({ uri, path }) => ({ uri, path })),
      directories: await this.foldersOutside(projectId, files),
      entries,
    });
  }

  protected isStored(uri: string) {
    return !this._unstoredUris.has(uri);
  }

  protected storedFiles(files: Record<string, FileData>) {
    return Object.entries(files).filter(([uri]) => this.isStored(uri));
  }

  protected async foldersOutside(
    projectId: string,
    files: { path: string }[],
  ): Promise<string[]> {
    return foldersWithoutFiles(
      files.map((f) => f.path),
      await this.getFolders(projectId),
    );
  }

  protected async replaceFolders(
    projectId: string,
    unzipped: { filename: string }[],
  ) {
    const listed = unzipped
      .filter(({ filename }) => filename.endsWith("/"))
      .map(({ filename }) => filename.replace(/\/+$/, ""));
    await this.deleteFolders(
      projectId,
      foldersWithoutFiles(
        unzipped.map(({ filename }) => filename),
        await this.listFolders(projectId),
        listed,
      ),
    );
    await this.createFolders(projectId, listed);
  }

  protected async clearFoldersAt(projectId: string, fileUris: string[]) {
    const incoming = new Set(
      fileUris.map((uri) => this.getRelativePath(projectId, uri)),
    );
    await this.deleteFolders(
      projectId,
      (await this.listFolders(projectId)).filter((p) => incoming.has(p)),
    );
  }

  async writeProjectZip(
    projectId: string,
    content: ArrayBuffer,
  ): Promise<{
    settingsJson?: string;
    leftOut: { count: number; folders: string[] };
  }> {
    const existingFiles = await this.getFiles(projectId);
    const unzippedArchive = await this.unzipFiles({ data: content }).catch(
      (cause) => {
        throw new ProjectImportError({ reason: "unreadable_zip" }, { cause });
      },
    );
    const found = findProjectRoot(unzippedArchive.map((e) => e.filename));
    if (found.kind === "refused") {
      throw new ProjectImportError(found);
    }
    const archive = unzippedArchive.flatMap((entry) =>
      entry.filename.startsWith(found.root) &&
      entry.filename !== found.root &&
      !isArchiveDropping(entry.filename)
        ? [{ ...entry, filename: entry.filename.slice(found.root.length) }]
        : [],
    );
    const settingsEntry = archive.find(
      ({ filename }) => filename === SETTINGS_JSON_PATH,
    );
    const unzipped = withoutSettingsJson(archive);
    const zipFilesToWrite = unzipped
      .filter(({ filename }) => filename && !filename.endsWith("/"))
      .map(({ filename, data }) => ({
        uri: this.getFileUri(projectId, filename),
        data,
      }));
    const layoutMarkerUri = this.getFileUri(projectId, LAYOUT_MARKER);
    const zipFilesToDelete = this.storedFiles(existingFiles)
      .filter(
        ([uri, fileData]) =>
          (!isProjectMetadata(this.getRelativePath(projectId, uri)) ||
            uri === layoutMarkerUri) &&
          !zipFilesToWrite.some((file) => file.uri === uri),
      )
      .map(([uri]) => ({ uri }));
    try {
      if (zipFilesToDelete.length > 0) {
        await this.deleteFiles({ files: zipFilesToDelete });
      }
      await this.replaceFolders(projectId, unzipped);
      await this.createFiles({ files: zipFilesToWrite });
      await this.writeProjectMetadata(projectId, "folders", "1");
    } catch (cause) {
      throw new ProjectImportError({ reason: "storage" }, { cause });
    }
    return {
      settingsJson: settingsEntry
        ? new TextDecoder().decode(settingsEntry.data)
        : undefined,
      leftOut: found.leftOut,
    };
  }

  async readProjectScriptBundle(projectId: string) {
    return this.bundleProjectText(projectId);
  }

  async bundleProjectText(projectId: string): Promise<string> {
    const files = await this.getFiles(projectId);
    return bundleScripts(Object.values(files), "main.sd", (uri) =>
      this.getRelativePath(projectId, uri),
    );
  }

  async readProjectAssetBundle(projectId: string): Promise<ArrayBuffer> {
    const allFiles = await this.getFiles(projectId);
    const files = Object.values(allFiles)
      .sort((a, b) => cmp(a.ext, b.ext) || cmp(a.name, b.name))
      .filter(
        (file) =>
          file.text == null &&
          !isProjectMetadata(this.getRelativePath(projectId, file.uri)),
      )
      .map(({ uri }) => ({ uri, path: this.getRelativePath(projectId, uri) }));
    return this.zipFiles({
      files,
      directories: await this.foldersOutside(projectId, files),
    });
  }

  async writeProjectScriptBundle(projectId: string, content: string) {
    const existingFiles = await this.getFiles(projectId);
    const remoteFiles = this.splitProjectTextContent(projectId, content);
    const textFilesToWrite = Object.entries(remoteFiles).map(([uri, text]) => {
      const array = getTextBuffer(text);
      const arrayBuffer = array.buffer.slice(
        array.byteOffset,
        array.byteLength + array.byteOffset,
      ) as ArrayBuffer;
      return {
        uri,
        data: arrayBuffer,
      };
    });
    const textFilesToDelete = this.storedFiles(existingFiles)
      .filter(
        ([uri, fileData]) =>
          !isProjectMetadata(this.getRelativePath(projectId, uri)) &&
          fileData.text != null &&
          !textFilesToWrite.some((file) => file.uri === uri),
      )
      .map(([uri]) => ({ uri }));
    if (textFilesToDelete.length > 0) {
      await this.deleteFiles({ files: textFilesToDelete });
    }
    await this.clearFoldersAt(
      projectId,
      textFilesToWrite.map((file) => file.uri),
    );
    await this.createFiles({ files: textFilesToWrite });
  }

  async writeProjectAssetBundle(projectId: string, content: ArrayBuffer) {
    const existingFiles = await this.getFiles(projectId);
    const unzipped = await this.unzipFiles({ data: content });
    const zipFilesToWrite = unzipped
      .filter(({ filename }) => filename && !filename.endsWith("/"))
      .map(({ filename, data }) => ({
        uri: this.getFileUri(projectId, filename),
        data,
      }));
    const zipFilesToDelete = this.storedFiles(existingFiles)
      .filter(
        ([uri, fileData]) =>
          !isProjectMetadata(this.getRelativePath(projectId, uri)) &&
          fileData.text == null &&
          !zipFilesToWrite.some((file) => file.uri === uri),
      )
      .map(([uri]) => ({ uri }));
    if (zipFilesToDelete.length > 0) {
      await this.deleteFiles({ files: zipFilesToDelete });
    }
    await this.replaceFolders(projectId, unzipped);
    await this.createFiles({ files: zipFilesToWrite });
  }

  splitProjectTextContent(
    projectId: string,
    text: string,
  ): Record<string, string> {
    const byRelativePath = splitScriptBundle(text, "main.sd");
    const chunks: Record<string, string> = {};
    for (const [relativePath, body] of Object.entries(byRelativePath)) {
      chunks[this.getFileUri(projectId, relativePath)] = body;
    }
    return chunks;
  }

  getRelativePath(projectId: string, uri: string): string {
    const prefix = `${this.getDirectoryUri(projectId)}/`;
    return uri.startsWith(prefix)
      ? uri.slice(prefix.length)
      : this.getFilename(uri);
  }

  async zipFiles(params: ZipFilesParams) {
    const result = await this.sendRequest(ZipFilesMessage.type, params);
    return result;
  }

  async unzipFiles(params: { data: ArrayBuffer }) {
    const { data } = params;
    const result = await this.sendRequest(UnzipFilesMessage.type, { data });
    return result;
  }

  async readFile(params: ReadFileParams) {
    const result = await this.sendRequest(ReadFileMessage.type, params);
    return result;
  }

  async createFiles(params: WillCreateFilesParams) {
    const result = await this.sendRequest(
      WillCreateFilesMessage.type,
      params,
      params.files.map((file) => file.data) as Transferable[],
    );
    return result;
  }

  async deleteFiles(params: WillDeleteFilesParams) {
    const result = await this.sendRequest(WillDeleteFilesMessage.type, params);
    return result;
  }

  async renameFiles(params: WillRenameFilesParams) {
    const result = await this.sendRequest(WillRenameFilesMessage.type, params);
    return result;
  }

  protected projectFolderUris(uri: string, includeSelf: boolean): string[] {
    const root = `${this.getDirectoryUri(this._loadedProjectId ?? "")}/`;
    if (!uri.startsWith(root)) {
      return [];
    }
    const parts = uri.slice(root.length).split("/").filter(Boolean);
    const count = includeSelf ? parts.length : parts.length - 1;
    return Array.from(
      { length: Math.max(0, count) },
      (_, i) => root + parts.slice(0, i + 1).join("/"),
    );
  }

  protected parentFolderUris(fileUri: string): string[] {
    return this.projectFolderUris(fileUri, false);
  }

  protected addFolderUris(uris: string[]) {
    for (const uri of uris) {
      for (const folderUri of this.projectFolderUris(uri, true)) {
        this._folders.add(folderUri);
      }
    }
  }

  protected removeFolderUris(uris: string[]) {
    for (const uri of uris) {
      for (const folderUri of [...this._folders]) {
        if (folderUri === uri || folderUri.startsWith(`${uri}/`)) {
          this._folders.delete(folderUri);
        }
      }
    }
  }

  async getFolders(projectId: string): Promise<string[]> {
    await this.getFiles(projectId);
    return [...this._folders]
      .map((uri) => this.getRelativePath(projectId, uri))
      .sort();
  }

  async listFolders(projectId: string): Promise<string[]> {
    const { uris } = await this.sendRequest(DirectoriesMessage.type, {
      action: "list",
      directory: { uri: this.getDirectoryUri(projectId) },
    });
    return uris.map((uri) => this.getRelativePath(projectId, uri));
  }

  async createFolders(projectId: string, folderPaths: string[]) {
    if (folderPaths.length === 0) {
      return [];
    }
    const { uris } = await this.sendRequest(DirectoriesMessage.type, {
      action: "create",
      uris: folderPaths.map((p) =>
        this.getFileUri(projectId, p.replace(/\/+$/, "")),
      ),
    });
    this.addFolderUris(uris);
    return uris.map((uri) => this.getRelativePath(projectId, uri));
  }

  async deleteFolders(projectId: string, folderPaths: string[]) {
    if (folderPaths.length === 0) {
      return [];
    }
    const { uris } = await this.sendRequest(DirectoriesMessage.type, {
      action: "delete",
      uris: folderPaths.map((p) =>
        this.getFileUri(projectId, p.replace(/\/+$/, "")),
      ),
    });
    this.removeFolderUris(uris);
    return uris.map((uri) => this.getRelativePath(projectId, uri));
  }

  async createFolder(projectId: string, folderPath: string) {
    return this.createFolders(projectId, [folderPath]);
  }

  async moveFile(projectId: string, fromPath: string, toPath: string) {
    return this.renameFiles({
      files: [
        {
          oldUri: this.getFileUri(projectId, fromPath),
          newUri: this.getFileUri(projectId, toPath),
        },
      ],
    });
  }

  async renameFileWithReferences(
    projectId: string,
    fromPath: string,
    toPath: string,
  ): Promise<RenameOutcome & { scriptsAffected: number }> {
    return this.renameFilesWithReferences(projectId, [{ from: fromPath, to: toPath }]);
  }

  protected async collectReferenceEdits(
    projectId: string,
    symbols: ReadonlyMap<string, { uri: string; to: string }>,
    refuse: (reason: string) => Error,
  ): Promise<ReferenceEdits | null> {
    const edits = new Map<string, LSP.TextDocumentEdit>();
    const placed = new Map<string, { document: string; newText: string; old: string; range: LSP.Range }>();
    const siblings: FileMove[] = [];
    for (const [from, { uri, to }] of symbols) {
      let edit: WorkspaceEdit | null;
      try {
        edit = await this._ls.getFileRenameEdits(uri, to);
      } catch (error) {
        throw refuse(
          `the lines that use ${from} could not be looked up (${reasonOf(error)}). Nothing was renamed.`,
        );
      }
      for (const change of edit?.documentChanges ?? []) {
        if ("edits" in change) {
          const document = change.textDocument.uri;
          const merged = edits.get(document) ?? { textDocument: change.textDocument, edits: [] };
          edits.set(document, merged);
          for (const text of change.edits) {
            if (!("newText" in text)) {
              throw refuse("the language server sent an edit this rename cannot apply. Nothing was renamed.");
            }
            const { start, end } = text.range;
            const at = `${document}:${start.line}:${start.character}:${end.line}:${end.character}`;
            const written = placed.get(at);
            if (written === undefined) {
              placed.set(at, { document, newText: text.newText, old: from, range: text.range });
              merged.edits.push(text);
            } else if (written.newText !== text.newText) {
              throw refuse(`two names would be written at the same place in ${leafOf(document)}. Nothing was renamed.`);
            }
          }
        } else if (change.kind === "rename") {
          siblings.push({
            from: this.getRelativePath(projectId, change.oldUri),
            to: this.getRelativePath(projectId, change.newUri),
          });
        }
      }
    }
    const scripts = new Map<string, string>();
    for (const document of edits.keys()) {
      scripts.set(document, normalized(await this.getFileText(document)));
    }
    for (const { document, old, range } of placed.values()) {
      if (textAt(scripts.get(document)!, range) !== old) {
        return null;
      }
    }
    return {
      texts: [...edits.values()].filter((change) => change.edits.length),
      siblings,
      scripts,
    };
  }

  protected async putBackScripts(
    collected: ReferenceEdits,
  ): Promise<{ notes: string[]; rollbacks: WorkspaceEditRollback[] }> {
    const notes: string[] = [];
    const rollbacks: WorkspaceEditRollback[] = [];
    for (const change of collected.texts) {
      const uri = change.textDocument.uri;
      const before = collected.scripts.get(uri)!;
      const written = withEdits(before, change.edits);
      try {
        const now = normalized(await this.getFileText(uri));
        if (now === before) {
          continue;
        }
        if (now !== written) {
          notes.push(`${leafOf(uri)} holds neither its old lines nor the renamed ones, so it was left as it is; check it.`);
          continue;
        }
        const lines = written.split(LINE_BREAK);
        const restored = await this.applyWorkspaceEdit(
          {
            documentChanges: [
              {
                textDocument: { uri, version: null },
                edits: [
                  {
                    range: {
                      start: { line: 0, character: 0 },
                      end: { line: lines.length - 1, character: lines[lines.length - 1]!.length },
                    },
                    newText: before,
                  },
                ],
              },
            ],
          },
          `Put back ${leafOf(uri)}`,
          { action: { kind: "put-back", targets: [uri] } },
          { [uri]: written },
        );
        if (restored.rollback) {
          rollbacks.push(restored.rollback);
        }
        if (!restored.applied) {
          notes.push(`${leafOf(uri)} changed before its lines could be put back, so it was left as it is (${restored.failureReason ?? "not saved"}); check it.`);
        } else if (normalized(await this.getFileText(uri)) !== before) {
          notes.push(`The lines in ${leafOf(uri)} could not be put back.`);
        }
      } catch (error) {
        notes.push(`The lines in ${leafOf(uri)} could not be put back (${reasonOf(error)}).`);
      }
    }
    return { notes, rollbacks };
  }

  async renameFilesWithReferences(
    projectId: string,
    moves: readonly FileMove[],
  ): Promise<RenameOutcome & { scriptsAffected: number }> {
    const name = symbolOf(moves[0]?.from ?? "").split(/[@~]/)[0]!;
    const refuse = (reason: string) =>
      new Error(`Couldn't rename ${name}: ${reason}`);
    const before = await snapshotPaths(this, projectId);
    const present = new Set([...before.files, ...before.folders]);
    const missing = moves.find((move) => !present.has(move.from));
    if (missing) {
      throw refuse(`${missing.from} is no longer there. Nothing was renamed.`);
    }
    const symbols = new Map<string, { uri: string; to: string }>();
    for (const move of moves) {
      const from = symbolOf(move.from);
      const to = symbolOf(move.to);
      const known = symbols.get(from);
      if (known && known.to !== to) {
        throw refuse(`${from} would get two names. Nothing was renamed.`);
      }
      if (from !== to && !known) {
        symbols.set(from, { uri: this.getFileUri(projectId, move.from), to });
      }
    }
    let collected: ReferenceEdits | null = null;
    for (let attempt = 0; attempt < REFERENCE_ATTEMPTS && !collected; attempt += 1) {
      const first = await this.collectReferenceEdits(projectId, symbols, refuse);
      const second = first && (await this.collectReferenceEdits(projectId, symbols, refuse));
      collected = first && second && sameReferenceEdits(first, second) ? second : null;
    }
    if (!collected) {
      throw refuse("the scripts that use it kept changing while the rename was prepared. Nothing was renamed; try again.");
    }
    const plan = new Map(moves.map((move) => [move.from, move.to]));
    const also: FileMove[] = [];
    for (const sibling of collected.siblings) {
      if (!plan.has(sibling.from)) {
        const folder = sibling.from.slice(0, sibling.from.lastIndexOf("/") + 1);
        const image = (path: string) => assetTypeOf(path, assetEndings.peek()) === "image";
        const stack = image(sibling.from)
          ? imageStacks(
              [...before.files].filter(
                (path) => path.startsWith(folder) && !path.slice(folder.length).includes("/") && image(path),
              ),
            ).find((candidate) => candidate.paths.includes(sibling.from))
          : undefined;
        const outside = stack?.paths.find((path) => !plan.has(path) && path !== sibling.from);
        if (outside) {
          throw refuse(`${sibling.from} shares its name but belongs to a picture with more files (${outside}); rename that picture from its own folder. Nothing was renamed.`);
        }
        plan.set(sibling.from, sibling.to);
        also.push(sibling);
      }
    }
    const clash = planClash(
      [...plan].map(([from, to]) => ({ from, to })),
      present,
    );
    if (clash) {
      throw refuse(`${clash}. Nothing was renamed.`);
    }
    const renames = [...plan]
      .filter(([from, to]) => from !== to)
      .map(([from, to]) => ({ from, to }));
    const result = await this.applyWorkspaceEdit(
      {
        documentChanges: [
          ...renames.map(({ from, to }) => ({
            kind: "rename" as const,
            oldUri: this.getFileUri(projectId, from),
            newUri: this.getFileUri(projectId, to),
          })),
          ...collected.texts,
        ],
      },
      `Rename ${name}`,
      {
        isRefactoring: true,
        action: {
          kind: "rename",
          targets: renames.map(({ from }) => this.getFileUri(projectId, from)),
        },
      },
      Object.fromEntries(collected.scripts),
    );
    if (!result.applied) {
      const reason = result.failureReason ?? "the change was not saved";
      const kept = new Set(result.rollback?.kept ?? []);
      const putBack = await this.putBackScripts({
        ...collected,
        texts: collected.texts.filter((change) => !kept.has(change.textDocument.uri)),
      });
      const keptPaths = [...kept].map((uri) => this.getRelativePath(projectId, uri));
      const touchesKept = (path: string) =>
        keptPaths.some((keptPath) => keptPath === path || keptPath.startsWith(`${path}/`));
      const files = await settleFailedMoves(
        this,
        projectId,
        renames.filter((move) => !touchesKept(move.from) && !touchesKept(move.to)),
        before,
        `Couldn't rename ${name}: ${reason}.`,
        result.rollback,
      );
      const rollbacks = [
        ...(result.rollback ? [result.rollback] : []),
        ...putBack.rollbacks,
      ];
      const relative = (pick: (rollback: WorkspaceEditRollback) => string[] | undefined) => [
        ...new Set(
          rollbacks.flatMap((rollback) =>
            (pick(rollback) ?? []).map((uri) => this.getRelativePath(projectId, uri)),
          ),
        ),
      ];
      throw Object.assign(
        new Error([files.message, ...putBack.notes].join(" ")),
        rollbacks.length > 0 && {
          rollback: {
            complete: rollbacks.every((rollback) => rollback.complete),
            failed: relative((rollback) => rollback.failed),
            kept: relative((rollback) => rollback.kept),
            trashed: relative((rollback) => rollback.trashed),
          },
        },
      );
    }
    const lines = new Set(
      collected.texts.flatMap((change) =>
        change.edits.map((text) => `${change.textDocument.uri}:${text.range.start.line}`),
      ),
    );
    return { referencesUpdated: lines.size, scriptsAffected: collected.texts.length, also };
  }

  async moveFolder(projectId: string, fromFolder: string, toFolder: string) {
    const files = await this.getFiles(projectId);
    const folders = await this.getFolders(projectId);
    const relativePaths = Object.keys(files).map((uri) =>
      this.getRelativePath(projectId, uri),
    );
    const from = fromFolder.replace(/\/+$/, "");
    const to = toFolder.replace(/\/+$/, "");
    if (!canMoveFolder(from, to)) {
      return [];
    }
    const moves = computeFolderMoves(relativePaths, from, to);
    const sources = new Set(moves.map((m) => m.from));
    const occupied = moves.find(
      (m) => relativePaths.includes(m.to) && !sources.has(m.to),
    );
    if (occupied) {
      throw new Error(
        `Cannot rename ${from} to ${to}: ${occupied.to} already exists`,
      );
    }
    const renamed =
      moves.length === 0
        ? []
        : await this.renameFiles({
            files: moves.map((m) => ({
              oldUri: this.getFileUri(projectId, m.from),
              newUri: this.getFileUri(projectId, m.to),
            })),
          });
    const movedFolders = folders
      .filter((p) => p.startsWith(`${from}/`))
      .map((p) => `${to}${p.slice(from.length)}`);
    await this.createFolders(projectId, [to, ...movedFolders]);
    await this.deleteFolders(projectId, [from]);
    return renamed;
  }

  async deleteFolder(
    projectId: string,
    folderPath: string,
    mode?: "trash" | "permanent",
  ): Promise<{ files: FileData[]; folders: string[] }> {
    const files = await this.getFiles(projectId);
    const folder = folderPath.replace(/\/+$/, "");
    const folders = (await this.getFolders(projectId)).filter(
      (p) => p === folder || p.startsWith(`${folder}/`),
    );
    const toDelete = Object.keys(files)
      .filter((uri) =>
        this.getRelativePath(projectId, uri).startsWith(`${folder}/`),
      )
      .map((uri) => ({ uri }));
    const trashed =
      mode === "trash"
        ? folders.map((p) => ({ uri: this.getFileUri(projectId, p) }))
        : [];
    const deleted =
      toDelete.length === 0 && trashed.length === 0
        ? []
        : await this.deleteFiles({ files: toDelete, folders: trashed, mode });
    const removed = new Set(await this.deleteFolders(projectId, [folder]));
    return {
      files: deleted,
      folders: folders.filter((p) => removed.has(p)),
    };
  }

  async listTrash(projectId: string): Promise<TrashBatch[]> {
    const result = await this.sendRequest(TrashFilesMessage.type, {
      projectId,
      action: "list",
    });
    return result.batches ?? [];
  }

  async restoreTrash(
    projectId: string,
    batchId: string,
  ): Promise<{ files: FileData[]; folders: string[] }> {
    const result = await this.sendRequest(TrashFilesMessage.type, {
      projectId,
      action: "restore",
      batchId,
    });
    const folders = result.restoredFolders ?? [];
    this.addFolderUris(folders.map((f) => this.getFileUri(projectId, f)));
    return { files: result.restored ?? [], folders };
  }

  async deleteTrashBatch(projectId: string, batchId: string): Promise<void> {
    await this.sendRequest(TrashFilesMessage.type, {
      projectId,
      action: "deleteBatch",
      batchId,
    });
  }

  async emptyTrash(projectId: string): Promise<void> {
    await this.sendRequest(TrashFilesMessage.type, {
      projectId,
      action: "empty",
    });
  }

  async purgeExpiredTrash(
    projectId: string,
    retentionMs?: number,
  ): Promise<void> {
    await this.sendRequest(TrashFilesMessage.type, {
      projectId,
      action: "purge",
      retentionMs,
    });
  }

  async writeTextDocument(params: {
    textDocument: { uri: string; version: number; text: string };
    origin?: string;
  }) {
    const { textDocument, origin } = params;
    const encoder = new TextEncoder();
    const encodedText = encoder.encode(textDocument.text);
    const result = await this.sendRequest(
      WillWriteFilesMessage.type,
      {
        files: [
          {
            uri: textDocument.uri,
            version: textDocument.version,
            data: encodedText.buffer,
          },
        ],
        origin,
      },
      [encodedText.buffer],
    );
    return result;
  }

  async applyWorkspaceEdit(
    edit: WorkspaceEdit,
    label?: string,
    metadata?: WorkspaceEditMetadata,
    expectedTexts?: Record<string, string>,
  ): Promise<ApplyWorkspaceEditResult> {
    const result = await this.sendRequest(
      ApplyWorkspaceEditMessage.type,
      {
        edit,
        label,
        metadata,
        ...(expectedTexts ? { expectedTexts } : {}),
      },
      edit.documentChanges
        ?.filter((c) => "kind" in c && c.kind === "create")
        .map((c) => c.data) as Transferable[],
    );
    return result;
  }
}
