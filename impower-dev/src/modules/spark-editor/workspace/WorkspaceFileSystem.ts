import { sendProtocolMessage } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { MessageProtocolRequestType } from "@impower/spark-editor-protocol/src/protocols/MessageProtocolRequestType";
import {
  ApplyWorkspaceEditMessage,
  ApplyWorkspaceEditResult,
  WorkspaceEdit,
} from "@impower/spark-editor-protocol/src/protocols/workspace/ApplyWorkspaceEditMessage";
import { ConfigurationMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ConfigurationMessage";
import { DidChangeWatchedFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeWatchedFilesMessage";
import { DidCreateFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidCreateFilesMessage";
import { DidDeleteFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidDeleteFilesMessage";
import { DidRenameFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidRenameFilesMessage";
import { DidWriteFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidWriteFilesMessage";
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
import { WillWriteFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/WillWriteFilesMessage";
import { ZipFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ZipFilesMessage";
import {
  FileData,
  ProjectMetadataField,
} from "@impower/spark-editor-protocol/src/types";
import SingletonPromise from "./SingletonPromise";
import { Workspace } from "./Workspace";
import { WorkspaceConstants } from "./WorkspaceConstants";
import workspace from "./WorkspaceStore";
import getTextBuffer from "./utils/getTextBuffer";
import { bundleScripts, splitScriptBundle } from "./utils/scriptBundle";
import {
  FOLDER_SENTINEL,
  computeFolderMoves,
  computeLayoutMigration,
  rewriteMainIncludesForMigration,
} from "../utils/fileTree";

const cmp = (a: any, b: any) => {
  if (a > b) return +1;
  if (a < b) return -1;
  return 0;
};

export default class WorkspaceFileSystem {
  protected _worker: Worker;

  protected _initialFilesRef = new SingletonPromise(
    this.loadInitialFiles.bind(this),
  );

  protected _preloaded: Record<string, HTMLElement> = {};

  protected _scheme = "file://";
  get scheme() {
    return this._scheme;
  }

  protected _loadedProjectId?: string;

  protected _files?: Record<string, FileData>;

  constructor() {
    const projectId = this.getLoadedProjectId();
    this._loadedProjectId = projectId;
    this._worker = new Worker("/opfs-workspace.js");
    this._worker.onerror = (e) => {
      console.error(e);
    };
    this._worker.addEventListener("message", this.handleWorkerMessage);
    this._initialFilesRef.get(projectId);
  }

  getLoadedProjectId() {
    return workspace.current.project.id || WorkspaceConstants.LOCAL_PROJECT_ID;
  }

  protected async loadInitialFiles(projectId: string) {
    const directoryUri = this.getDirectoryUri(projectId);
    let files = await this.readDirectoryFiles({
      directory: { uri: directoryUri },
    });
    // One-time, idempotent migration of legacy FLAT projects to the
    // `scripts/` + `assets/` split: every script (except root `main.sd`) moves
    // under `scripts/` and every asset under `assets/`, preserving substructure.
    // Already-split projects yield no moves (cheap no-op). Run before the files
    // load into `_files`/the LSP so everything downstream sees the new layout.
    const migration = computeLayoutMigration(
      files.map((f) => this.getRelativePath(projectId, f.uri)),
      (p) => p.endsWith(".sd"),
    );
    if (migration.length > 0) {
      await this.renameFiles({
        files: migration.map((m) => ({
          oldUri: this.getFileUri(projectId, m.from),
          newUri: this.getFileUri(projectId, m.to),
        })),
      });
      // `main.sd` stayed at the root while the scripts it `include`s moved under
      // scripts/ — rewrite its include paths so they still resolve. No-op if it
      // has no includes (or they're already rooted).
      const mainUri = this.getFileUri(projectId, "main.sd");
      const mainText = files.find((f) => f.uri === mainUri)?.text;
      if (mainText != null) {
        const rewritten = rewriteMainIncludesForMigration(mainText);
        if (rewritten !== mainText) {
          await this.writeTextDocument({
            textDocument: { uri: mainUri, version: 0, text: rewritten },
          });
        }
      }
      files = await this.readDirectoryFiles({
        directory: { uri: directoryUri },
      });
    }
    this._files ??= {};
    const result: Record<string, FileData> = {};
    files.forEach((file) => {
      this._files ??= {};
      this._files[file.uri] = { ...file };
      result[file.uri] = file;
      this.preloadFile(file);
    });
    if (!files.some((f) => f.name === "main" && f.type === "script")) {
      // Create a default empty main script if one doesn't exist
      this._files ??= {};
      const mainScriptUri = this.getFileUri(projectId, "main.sd");
      const text = "";
      const encoder = new TextEncoder();
      const encodedText = encoder.encode(text);
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
    Workspace.ls.connection.onRequest(
      ExecuteCommandMessage.method,
      async (params: ExecuteCommandParams) => {
        return this.executeCommand(params);
      },
    );
    Workspace.ls.start(
      this.getDirectoryUri(projectId),
      Object.values(this._files),
    );
    return result;
  }

  async executeCommand(params: ExecuteCommandParams) {
    // TODO: handle fetching latest text with workspace/textDocumentContent/refresh instead?
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
          return Workspace.configuration.settings;
        }
        return {};
      });
      this._worker.postMessage(
        ConfigurationMessage.type.response(message.id, result),
      );
    } else if (DidWriteFilesMessage.type.isNotification(message)) {
      message.params.files.forEach((file) => {
        this._files ??= {};
        this._files[file.uri] = { ...file };
        this.preloadFile(file);
      });
      sendProtocolMessage(message);
    } else if (DidCreateFilesMessage.type.isNotification(message)) {
      Workspace.ls.connection.sendNotification(message.method, message.params);
      sendProtocolMessage(message);
    } else if (DidDeleteFilesMessage.type.isNotification(message)) {
      message.params.files.forEach((file) => {
        delete this._files?.[file.uri];
        delete this._preloaded[file.uri];
      });
      Workspace.ls.connection.sendNotification(message.method, message.params);
      sendProtocolMessage(message);
    } else if (DidRenameFilesMessage.type.isNotification(message)) {
      message.params.files.forEach((file) => {
        this._files ??= {};
        const oldFile = this._files[file.oldUri];
        if (oldFile) {
          delete this._files[file.oldUri];
          delete this._preloaded[file.oldUri];
        }
      });
      Workspace.ls.connection.sendNotification(message.method, message.params);
      sendProtocolMessage(message);
    } else if (DidChangeWatchedFilesMessage.type.isNotification(message)) {
      Workspace.ls.connection.sendNotification(message.method, message.params);
      sendProtocolMessage(message);
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
    // Drop only the FINAL extension so multi-dot names keep interior dots
    // (`sprite.idle.001.png` -> `sprite.idle.001`); a leading-dot dotfile has an
    // empty display name (matches getName).
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

  protected async readDirectoryFiles(
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

  async readProjectZip(projectId: string): Promise<ArrayBuffer> {
    const allFiles = await this.getFiles(projectId);
    const files = Object.values(allFiles)
      .sort((a, b) => cmp(a.ext, b.ext) || cmp(a.name, b.name))
      .filter((file) => file.name)
      .map(({ uri }) => ({ uri, path: this.getRelativePath(projectId, uri) }));
    return this.zipFiles({ files });
  }

  async writeProjectZip(projectId: string, content: ArrayBuffer) {
    const existingFiles = await this.getFiles(projectId);
    const unzipped = await this.unzipFiles({ data: content });
    const zipFilesToWrite = unzipped
      // Skip directory entries / empty names — `getFileUri(projectId, "")`
      // yields the project-root URI (no filename), which makes the OPFS
      // worker call `getFileHandle("")` and throw "Name is not allowed".
      .filter(({ filename }) => filename && !filename.endsWith("/"))
      .map(({ filename, data }) => ({
        uri: this.getFileUri(projectId, filename),
        data,
      }));
    const zipFilesToDelete = Object.entries(existingFiles)
      .filter(
        ([uri, fileData]) =>
          fileData.name && !zipFilesToWrite.some((file) => file.uri === uri),
      )
      .map(([uri]) => ({ uri }));
    await Promise.all([
      this.createFiles({
        files: zipFilesToWrite,
      }),
      this.deleteFiles({
        files: zipFilesToDelete,
      }),
    ]);
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
      .filter((file) => file.text == null && file.name)
      .map(({ uri }) => ({ uri, path: this.getRelativePath(projectId, uri) }));
    return this.zipFiles({ files });
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
    const textFilesToDelete = Object.entries(existingFiles)
      .filter(
        ([uri, fileData]) =>
          fileData.name &&
          fileData.text != null &&
          !textFilesToWrite.some((file) => file.uri === uri),
      )
      .map(([uri]) => ({ uri }));
    await Promise.all([
      this.createFiles({
        files: textFilesToWrite,
      }),
      this.deleteFiles({
        files: textFilesToDelete,
      }),
    ]);
  }

  async writeProjectAssetBundle(projectId: string, content: ArrayBuffer) {
    const existingFiles = await this.getFiles(projectId);
    const unzipped = await this.unzipFiles({ data: content });
    const zipFilesToWrite = unzipped
      // Skip directory entries / empty names (see writeProjectZip).
      .filter(({ filename }) => filename && !filename.endsWith("/"))
      .map(({ filename, data }) => ({
        uri: this.getFileUri(projectId, filename),
        data,
      }));
    const zipFilesToDelete = Object.entries(existingFiles)
      .filter(
        ([uri, fileData]) =>
          fileData.name &&
          fileData.text == null &&
          !zipFilesToWrite.some((file) => file.uri === uri),
      )
      .map(([uri]) => ({ uri }));
    await Promise.all([
      this.createFiles({
        files: zipFilesToWrite,
      }),
      this.deleteFiles({
        files: zipFilesToDelete,
      }),
    ]);
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

  /**
   * Project-relative path for a file URI (the path after `file://<projectId>/`).
   * Falls back to the bare filename for URIs outside the project directory.
   */
  getRelativePath(projectId: string, uri: string): string {
    const prefix = `${this.getDirectoryUri(projectId)}/`;
    return uri.startsWith(prefix) ? uri.slice(prefix.length) : this.getFilename(uri);
  }

  async zipFiles(params: { files: { uri: string; path?: string }[] }) {
    const { files } = params;
    const result = await this.sendRequest(ZipFilesMessage.type, { files });
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

  /**
   * Create an (otherwise empty) folder by writing a hidden sentinel file —
   * OPFS directories are implicit, so an empty folder needs a file to persist.
   * `folderPath` is project-relative (e.g. `chapters` or `art/backgrounds`).
   */
  async createFolder(projectId: string, folderPath: string) {
    const sentinelPath = `${folderPath.replace(/\/+$/, "")}/${FOLDER_SENTINEL}`;
    return this.createFiles({
      files: [
        {
          uri: this.getFileUri(projectId, sentinelPath),
          data: new ArrayBuffer(0),
        },
      ],
    });
  }

  /** Move/rename a single file to a new project-relative path (across folders). */
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

  /**
   * Relocate a folder and everything beneath it (e.g. `chapters` ->
   * `archive/chapters`) by renaming each contained file across directories.
   */
  async moveFolder(projectId: string, fromFolder: string, toFolder: string) {
    const files = await this.getFiles(projectId);
    const relativePaths = Object.keys(files).map((uri) =>
      this.getRelativePath(projectId, uri),
    );
    const moves = computeFolderMoves(relativePaths, fromFolder, toFolder);
    if (moves.length === 0) {
      return [];
    }
    return this.renameFiles({
      files: moves.map((m) => ({
        oldUri: this.getFileUri(projectId, m.from),
        newUri: this.getFileUri(projectId, m.to),
      })),
    });
  }

  /** Delete a folder and everything beneath it (the empty dir then disappears). */
  async deleteFolder(projectId: string, folderPath: string) {
    const files = await this.getFiles(projectId);
    const prefix = `${folderPath.replace(/\/+$/, "")}/`;
    const toDelete = Object.keys(files)
      .filter((uri) => this.getRelativePath(projectId, uri).startsWith(prefix))
      .map((uri) => ({ uri }));
    if (toDelete.length === 0) {
      return [];
    }
    return this.deleteFiles({ files: toDelete });
  }

  async writeTextDocument(params: {
    textDocument: { uri: string; version: number; text: string };
  }) {
    const { textDocument } = params;
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
      },
      [encodedText.buffer],
    );
    return result;
  }

  async preloadFile(file: FileData) {
    try {
      await new Promise((resolve, reject) => {
        /* Preload image so it can be previewed instantly */
        if (file.type === "image") {
          const img = new Image();
          img.src = file.src;
          img.onload = () => {
            resolve(img);
          };
          img.onerror = () => {
            reject(img);
          };
          this._preloaded[file.uri] = img;
        }
        /* We shouldn't need to preload audio */
        // else if (file.type === "audio") {
        //   const aud = new Audio();
        //   aud.src = file.src;
        //   aud.onload = () => {
        //     resolve(aud);
        //   };
        //   aud.onerror = () => {
        //     reject(aud);
        //   };
        //   this._preloaded[file.uri] = aud;
        // }
      });
    } catch (e) {
      console.warn("Could not load: ", file.name, file.src);
    }
  }

  async applyWorkspaceEdit(
    edit: WorkspaceEdit,
    label?: string,
    metadata?: { isRefactoring?: boolean },
  ): Promise<ApplyWorkspaceEditResult> {
    const result = await this.sendRequest(
      ApplyWorkspaceEditMessage.type,
      {
        edit,
        label,
        metadata,
      },
      edit.documentChanges
        ?.filter((c) => "kind" in c && c.kind === "create")
        .map((c) => c.data) as Transferable[],
    );
    return result;
  }
}
