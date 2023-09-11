import { MessageProtocolRequestType } from "@impower/spark-editor-protocol/src/protocols/MessageProtocolRequestType";
import { DidParseTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidParseTextDocumentMessage";
import { ConfigurationMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ConfigurationMessage.js";
import { DidChangeWatchedFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeWatchedFilesMessage.js";
import { DidCreateFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidCreateFilesMessage.js";
import { DidDeleteFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidDeleteFilesMessage.js";
import { DidWatchFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidWatchFilesMessage.js";
import { DidWriteFileMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidWriteFileMessage.js";
import {
  ReadDirectoryFilesMessage,
  ReadDirectoryFilesParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/ReadDirectoryFilesMessage.js";
import {
  WillCreateFilesMessage,
  WillCreateFilesParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/WillCreateFilesMessage.js";
import {
  WillDeleteFilesMessage,
  WillDeleteFilesParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/WillDeleteFilesMessage.js";
import { WillWriteFileMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/WillWriteFileMessage";
import {
  FileData,
  ProjectMetadata,
} from "@impower/spark-editor-protocol/src/types";
import { SparkProgram } from "../../../../../packages/sparkdown/src/types/SparkProgram";
import SingletonPromise from "./SingletonPromise";
import { Workspace } from "./Workspace";
import { WorkspaceCache } from "./WorkspaceCache";
import { WorkspaceConstants } from "./WorkspaceConstants";

export default class WorkspaceFileSystem {
  protected _fileSystemWorker = new Worker("/public/opfs-workspace.js");

  protected _initialFilesRef = new SingletonPromise(
    this.loadInitialFiles.bind(this)
  );

  protected _assetCache: Record<string, HTMLElement> = {};

  protected _scheme = "file:///";
  get scheme() {
    return this._scheme;
  }

  protected _files?: Record<string, FileData>;

  constructor() {
    this._initialFilesRef.get();
    this._fileSystemWorker.addEventListener(
      "message",
      this.handleWorkerMessage
    );
  }

  protected async loadInitialFiles() {
    const connection = await Workspace.lsp.getConnection();
    const projectId =
      WorkspaceCache.get().project.id || WorkspaceConstants.LOCAL_PROJECT_ID;
    const directoryUri = this.getDirectoryUri(projectId);
    const files = await this.readDirectoryFiles({
      directory: { uri: directoryUri },
    });
    const didWatchFilesParams = {
      files,
    };
    this._files ??= {};
    const result: Record<string, FileData> = {};
    files.forEach((file) => {
      this._files ??= {};
      this._files[file.uri] = file;
      result[file.uri] = file;
      this.preloadFile(file);
    });
    connection.sendNotification(DidWatchFilesMessage.type, didWatchFilesParams);
    this.emit(
      DidWatchFilesMessage.method,
      DidWatchFilesMessage.type.notification(didWatchFilesParams)
    );
    return result;
  }

  protected emit<T>(eventName: string, detail?: T): boolean {
    return window.dispatchEvent(
      new CustomEvent(eventName, {
        bubbles: true,
        cancelable: true,
        composed: true,
        detail,
      })
    );
  }

  protected _messageQueue: Record<string, (result: any) => void> = {};

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
      this._fileSystemWorker.postMessage(
        ConfigurationMessage.type.response(message.id, result)
      );
    } else if (DidParseTextDocumentMessage.type.isNotification(message)) {
      this.emit(message.method, message);
    } else if (
      DidWriteFileMessage.type.isNotification(message) ||
      DidCreateFilesMessage.type.isNotification(message) ||
      DidDeleteFilesMessage.type.isNotification(message) ||
      DidChangeWatchedFilesMessage.type.isNotification(message)
    ) {
      const connection = await Workspace.lsp.getConnection();
      connection.sendNotification(message.method, message.params);
      this.emit(message.method, message);
    } else {
      const resolve = this._messageQueue[message.id];
      if (resolve) {
        resolve(message.result);
        delete this._messageQueue[message.id];
      }
    }
  };

  protected async sendRequest<M extends string, P, R>(
    type: MessageProtocolRequestType<M, P, R>,
    params: P,
    transfer: Transferable[] = []
  ): Promise<R> {
    return new Promise((resolve) => {
      const request = type.request(params);
      this._messageQueue[request.id] = resolve;
      this._fileSystemWorker.postMessage(request, transfer);
    });
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
    return fileName.split(".")[0] ?? "";
  }

  async getFiles() {
    await this._initialFilesRef.get();
    if (!this._files) {
      throw new Error("Workspace File System not initialized.");
    }
    return this._files;
  }

  protected async readDirectoryFiles(
    params: ReadDirectoryFilesParams
  ): Promise<FileData[]> {
    return this.sendRequest(ReadDirectoryFilesMessage.type, params);
  }

  async readProjectName(projectId: string) {
    const uri = this.getFileUri(projectId, ".name");
    const files = await this.getFiles();
    const file = files[uri];
    const name = file?.text || "";
    if (!name) {
      return WorkspaceConstants.DEFAULT_PROJECT_NAME;
    }
    return name;
  }

  async writeProjectName(projectId: string, name: string) {
    const uri = this.getFileUri(projectId, ".name");
    const text = name;
    await this.writeTextDocument({
      textDocument: { uri, version: 0, text },
    });
  }

  async readProjectMetadata(projectId: string): Promise<ProjectMetadata> {
    const uri = this.getFileUri(projectId, ".metadata");
    const files = await this.getFiles();
    const file = files[uri];
    const metadataContent = file?.text || "";
    if (!metadataContent) {
      return {};
    }
    const metadata = JSON.parse(metadataContent);
    return metadata;
  }

  async writeProjectMetadata(projectId: string, metadata: ProjectMetadata) {
    const uri = this.getFileUri(projectId, ".metadata");
    const text = JSON.stringify(metadata).trim();
    await this.writeTextDocument({
      textDocument: { uri, version: 0, text },
    });
  }

  async readProjectContent(projectId: string) {
    // TODO: Bundle OPFS chunk files into project content before creating blob
    const uri = this.getFileUri(projectId, "main.script");
    const files = await this.getFiles();
    const file = files[uri];
    return file?.text || "";
  }

  async writeProjectContent(projectId: string, text: string) {
    // TODO: Split project content into chunk files before caching in OPFS
    const uri = this.getFileUri(projectId, "main.script");
    await Workspace.fs.writeTextDocument({
      textDocument: { uri, version: 0, text },
    });
  }

  async createFiles(params: WillCreateFilesParams) {
    const result = await this.sendRequest(
      WillCreateFilesMessage.type,
      params,
      params.files.map((file) => file.data)
    );
    result.forEach((file) => {
      this._files ??= {};
      this._files[file.uri] = file;
      this.preloadFile(file);
    });
    return result;
  }

  async deleteFiles(params: WillDeleteFilesParams) {
    const result = await this.sendRequest(WillDeleteFilesMessage.type, params);
    params.files.forEach((file) => {
      if (this._files) {
        delete this._files[file.uri];
        delete this._assetCache[file.uri];
      }
    });
    return result;
  }

  async writeTextDocument(params: {
    textDocument: { uri: string; version: number; text: string };
  }) {
    const { textDocument } = params;
    const encoder = new TextEncoder();
    const encodedText = encoder.encode(textDocument.text);
    const result = await this.sendRequest(
      WillWriteFileMessage.type,
      {
        file: {
          uri: textDocument.uri,
          version: textDocument.version,
          data: encodedText.buffer,
        },
      },
      [encodedText.buffer]
    );
    this._files ??= {};
    this._files[result.uri] = result;
    return result;
  }

  async getPrograms() {
    const files = await this.getFiles();
    const programs = Object.values(files).filter(
      (f): f is FileData & { program: SparkProgram } => Boolean(f.program)
    );
    return programs;
  }

  async preloadFile(file: FileData) {
    try {
      await new Promise((resolve, reject) => {
        if (file.type === "image") {
          const img = new Image();
          img.src = file.src;
          img.onload = () => {
            resolve(img);
          };
          img.onerror = () => {
            reject(img);
          };
          this._assetCache[file.uri] = img;
        } else if (file.type === "audio") {
          const aud = new Audio();
          aud.src = file.src;
          aud.onload = () => {
            resolve(aud);
          };
          aud.onerror = () => {
            reject(aud);
          };
          this._assetCache[file.uri] = aud;
        }
      });
    } catch (e) {
      console.warn("Could not load: ", file.name, file.src);
    }
  }

  async getUrl(uri: string) {
    const files = await this.getFiles();
    return files[uri]?.src;
  }
}
