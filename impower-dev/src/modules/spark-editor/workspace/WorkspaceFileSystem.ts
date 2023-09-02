import { FileChangeType } from "@impower/spark-editor-protocol/src/enums/FileChangeType";
import { MessageProtocolRequestType } from "@impower/spark-editor-protocol/src/protocols/MessageProtocolRequestType";
import { DidParseTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidParseTextDocumentMessage";
import {
  ReadTextDocumentMessage,
  ReadTextDocumentParams,
} from "@impower/spark-editor-protocol/src/protocols/textDocument/ReadTextDocumentMessage.js";
import {
  WriteTextDocumentMessage,
  WriteTextDocumentParams,
} from "@impower/spark-editor-protocol/src/protocols/textDocument/WriteTextDocumentMessage.js";
import { ConfigurationMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ConfigurationMessage.js";
import {
  CreateFilesMessage,
  CreateFilesParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/CreateFilesMessage.js";
import {
  DeleteFilesMessage,
  DeleteFilesParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/DeleteFilesMessage.js";
import { DidChangeWatchedFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeWatchedFilesMessage.js";
import { DidCreateFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidCreateFilesMessage.js";
import { DidDeleteFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidDeleteFilesMessage.js";
import { DidWatchFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidWatchFilesMessage.js";
import {
  ReadDirectoryFilesMessage,
  ReadDirectoryFilesParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/ReadDirectoryFilesMessage.js";
import {
  ReadFileMessage,
  ReadFileParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/ReadFileMessage.js";
import { FileData } from "@impower/spark-editor-protocol/src/types";
import YAML from "yaml";
import { SparkProgram } from "../../../../../packages/sparkdown/src/types/SparkProgram";
import SingletonPromise from "./SingletonPromise";
import { Workspace } from "./Workspace";

const DEFAULT_PROJECT_NAME = "Untitled Project";

export default class WorkspaceFileSystem {
  protected _fileSystemWorker = new Worker("/public/opfs-workspace.js");

  protected _initialFilesRef = new SingletonPromise(
    this.loadInitialFiles.bind(this)
  );

  protected _cache: Record<string, HTMLElement> = {};

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
    await Workspace.lsp.starting;
    const directoryUri = this.getDirectoryUri(Workspace.project.id);
    const files = await this.readDirectoryFiles({
      directory: { uri: directoryUri },
    });
    const didWatchFilesParams = {
      files,
    };
    const result: Record<string, FileData> = {};
    files.forEach((file) => {
      this._files ??= {};
      this._files[file.uri] = file;
      result[file.uri] = file;
      this.preloadFile(file);
    });
    Workspace.lsp.connection.sendNotification(
      DidWatchFilesMessage.type,
      didWatchFilesParams
    );
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

  protected handleWorkerMessage = (event: MessageEvent) => {
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
      this.emit(DidParseTextDocumentMessage.method, message);
    } else {
      const dispatch = this._messageQueue[message.id];
      if (dispatch) {
        dispatch(message.result);
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

  protected async readProjectMetadata(
    projectId: string
  ): Promise<{ name: string } | null> {
    const uri = this.getFileUri(projectId, "metadata.sd");
    const metadataContent = await this.readTextDocument({
      textDocument: { uri },
    });
    if (!metadataContent) {
      return null;
    }
    const trimmedContent = metadataContent.trim();
    let validContent = trimmedContent.endsWith("---")
      ? trimmedContent.slice(0, -3)
      : trimmedContent;
    const metadata = YAML.parse(validContent);
    return metadata;
  }

  protected async writeProjectMetadata(
    projectId: string,
    metadata: { name: string }
  ) {
    const uri = this.getFileUri(projectId, "metadata.sd");
    const text = `---\n${YAML.stringify(metadata)}\n---`;
    await this.writeTextDocument({
      textDocument: { uri },
      text,
    });
    return metadata;
  }

  async readProjectName(projectId: string) {
    const metadata = (await this.readProjectMetadata(projectId)) ?? {
      name: DEFAULT_PROJECT_NAME,
    };
    return metadata.name;
  }

  async writeProjectName(projectId: string, name: string) {
    const metadata = (await this.readProjectMetadata(projectId)) ?? {
      name: "",
    };
    metadata.name = name;
    return this.writeProjectMetadata(projectId, metadata);
  }

  async readProjectContent(projectId: string) {
    // TODO: Bundle OPFS chunk files into project content before creating blob
    const uri = this.getFileUri(projectId, "main.script");
    return Workspace.fs.readTextDocument({
      textDocument: { uri },
    });
  }

  async writeProjectContent(projectId: string, text: string) {
    // TODO: Split project content into chunk files before caching in OPFS
    const uri = this.getFileUri(projectId, "main.script");
    await this.writeTextDocument({
      textDocument: { uri },
      text,
    });
  }

  async createFiles(params: CreateFilesParams) {
    const result = await this.sendRequest(
      CreateFilesMessage.type,
      params,
      params.files.map((file) => file.data)
    );
    result.forEach((file) => {
      this._files ??= {};
      this._files[file.uri] = file;
      this.preloadFile(file);
    });
    const createMessage = DidCreateFilesMessage.type.notification({
      files: params.files.map((file) => ({ uri: file.uri })),
    });
    const changeMessage = DidChangeWatchedFilesMessage.type.notification({
      changes: params.files.map((file) => ({
        uri: file.uri,
        type: FileChangeType.Created,
      })),
    });
    Workspace.lsp.connection.sendNotification(
      createMessage.method,
      createMessage.params
    );
    Workspace.lsp.connection.sendNotification(
      changeMessage.method,
      changeMessage.params
    );
    this.emit(createMessage.method, createMessage);
    this.emit(changeMessage.method, changeMessage);
    return result;
  }

  async deleteFiles(params: DeleteFilesParams) {
    const result = await this.sendRequest(DeleteFilesMessage.type, params);
    params.files.forEach((file) => {
      if (this._files) {
        delete this._files[file.uri];
        delete this._cache[file.uri];
      }
    });
    const deleteMessage = DidDeleteFilesMessage.type.notification({
      files: params.files.map((file) => ({ uri: file.uri })),
    });
    const changeMessage = DidChangeWatchedFilesMessage.type.notification({
      changes: params.files.map((file) => ({
        uri: file.uri,
        type: FileChangeType.Deleted,
      })),
    });
    Workspace.lsp.connection.sendNotification(
      deleteMessage.method,
      deleteMessage.params
    );
    Workspace.lsp.connection.sendNotification(
      changeMessage.method,
      changeMessage.params
    );
    this.emit(deleteMessage.method, deleteMessage);
    this.emit(changeMessage.method, changeMessage);
    return result;
  }

  async writeTextDocument(params: WriteTextDocumentParams) {
    const result = await this.sendRequest(
      WriteTextDocumentMessage.type,
      params
    );
    const changeMessage = DidChangeWatchedFilesMessage.type.notification({
      changes: [
        {
          uri: params.textDocument.uri,
          type: FileChangeType.Changed,
        },
      ],
    });
    this._files ??= {};
    this._files[result.uri] = result;
    this.emit(changeMessage.method, changeMessage);
    return result;
  }

  async readFile(params: ReadFileParams) {
    return this.sendRequest(ReadFileMessage.type, params);
  }

  async readTextDocument(params: ReadTextDocumentParams) {
    return this.sendRequest(ReadTextDocumentMessage.type, params);
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
          this._cache[file.uri] = img;
        } else if (file.type === "audio") {
          const aud = new Audio();
          aud.src = file.src;
          aud.onload = () => {
            resolve(aud);
          };
          aud.onerror = () => {
            reject(aud);
          };
          this._cache[file.uri] = aud;
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
