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
import type { SparkProgram } from "../../../../../packages/sparkdown/src/types/SparkProgram";
import { Workspace } from "./Workspace";

export default class WorkspaceFileSystem {
  protected _fileSystemWorker = new Worker("/public/opfs-workspace.js");

  protected _scheme = "file:///";
  get scheme() {
    return this._scheme;
  }

  // TODO: Allow user to sync their data with a storage provider (like Github, Google Drive, or Dropbox)
  protected _uid = "anonymous";
  get uid() {
    return this._uid;
  }

  protected _project?: { id: string; name: string } | undefined;
  get project() {
    return this._project;
  }

  protected _files?: Record<string, FileData>;
  get files() {
    return this._files;
  }

  protected _initializing?: Promise<FileData[]>;
  get initializing() {
    return this._initializing;
  }

  protected _cache: Record<string, HTMLElement> = {};

  constructor() {
    this._initializing = this.initialize();
    this._fileSystemWorker.addEventListener(
      "message",
      this.handleWorkerMessage
    );
  }

  async initialize() {
    const project = await this.readProject();
    if (project) {
      this._project = project;
    } else {
      this._project = await this.createProject();
    }
    Workspace.window.loadProject(this._project);
    await Workspace.lsp.starting;
    const directoryUri = this.getWorkspaceUri();
    const files = await this.readDirectoryFiles({
      directory: { uri: directoryUri },
    });
    const didWatchFilesParams = {
      files,
    };
    Workspace.lsp.connection.sendNotification(
      DidWatchFilesMessage.type,
      didWatchFilesParams
    );
    this.emit(
      DidWatchFilesMessage.method,
      DidWatchFilesMessage.type.notification(didWatchFilesParams)
    );
    this._files ??= {};
    files.forEach((file) => {
      this._files ??= {};
      this._files[file.uri] = file;
      this.preloadFile(file);
    });
    return files;
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

  getWorkspaceUri(...path: string[]) {
    const suffix = path.length > 0 ? `/${path.join("/")}` : "";
    // TODO: Generate unique project id instead of "default" id
    const projectId = "default";
    return `${this._scheme}${this._uid}/projects/${projectId}${suffix}`;
  }

  getFileName(uri: string) {
    return uri.split("/").slice(-1).join("");
  }

  getName(uri: string) {
    const fileName = this.getFileName(uri);
    return fileName.split(".")[0] ?? "";
  }

 protected async getFiles() {
    
    await this.initializing;
    if (!this._files) {
      throw new Error("Workspace File System not initialized.");
    }
    return this._files
  }

  async getFileUrisInDirectory(directoryPath: string): Promise<string[]> {
    const files = await this.getFiles();
    return Object.keys(files).filter((uri) =>
      uri.startsWith(this.getWorkspaceUri(directoryPath))
    );
  }

  protected async readDirectoryFiles(
    params: ReadDirectoryFilesParams
  ): Promise<FileData[]> {
    return this.sendRequest(ReadDirectoryFilesMessage.type, params);
  }

  async readProject(): Promise<{ name: string; id: string } | undefined> {
    const uri = this.getWorkspaceUri("package.sd");
    const packageContent = await this.readTextDocument({
      textDocument: { uri },
    });
    if (!packageContent) {
      return undefined;
    }
    const trimmedPackageContent = packageContent.trim();
    let validPackageContent = trimmedPackageContent.endsWith("---")
      ? trimmedPackageContent.slice(0, -3)
      : trimmedPackageContent;
    const packageObj = YAML.parse(validPackageContent);
    return packageObj;
  }

  async createProject() {
    const uri = this.getWorkspaceUri("package.sd");
    this._project = { id: "default", name: "Untitled Project" };
    const text = `---\n${YAML.stringify(this._project)}\n---`;
    await this.writeTextDocument({
      textDocument: { uri },
      text,
    });
    return this._project;
  }

  async updateProjectName(name: string) {
    if (!this._project) {
      throw new Error("No project loaded");
    }
    const uri = this.getWorkspaceUri("package.sd");
    this._project.name = name;
    const text = `---\n${YAML.stringify(this._project)}\n---`;
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
      console.warn(e);
    }
  }

  async getUrl(uri: string) {
    const files = await this.getFiles();
   return files[uri]?.src
  }
}
