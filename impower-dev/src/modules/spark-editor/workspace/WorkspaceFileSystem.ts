import { FileChangeType } from "@impower/spark-editor-protocol/src/enums/FileChangeType";
import { MessageProtocolRequestType } from "@impower/spark-editor-protocol/src/protocols/MessageProtocolRequestType";
import {
  ReadTextDocumentMessage,
  ReadTextDocumentParams,
} from "@impower/spark-editor-protocol/src/protocols/textDocument/ReadTextDocumentMessage.js";
import {
  WriteTextDocumentMessage,
  WriteTextDocumentParams,
} from "@impower/spark-editor-protocol/src/protocols/textDocument/WriteTextDocumentMessage.js";
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
  ReadFileMessage,
  ReadFileParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/ReadFileMessage.js";
import {
  WorkspaceDirectoryMessage,
  WorkspaceDirectoryParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/WorkspaceDirectoryMessage.js";
import { WorkspaceEntry } from "@impower/spark-editor-protocol/src/types";
import YAML from "yaml";
import WorkspaceLanguageServerProtocol from "./WorkspaceLanguageServerProtocol";

export default class WorkspaceFileSystem {
  protected _lsp: WorkspaceLanguageServerProtocol;

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

  // TODO: Allow user to own more than one project
  protected _projectId = "default";
  get projectId() {
    return this._projectId;
  }

  protected _projectName = "";
  get projectName() {
    return this._projectName;
  }

  protected _uris?: Set<string>;
  get uris() {
    return this._uris ? Array.from(this._uris) : undefined;
  }

  protected _initializing?: Promise<WorkspaceEntry[]>;
  get initializing() {
    return this._initializing;
  }

  constructor(lsp: WorkspaceLanguageServerProtocol) {
    this._lsp = lsp;
    this._initializing = this.initialize();
    this._fileSystemWorker.addEventListener(
      "message",
      this.handleWorkerMessage
    );
  }

  async initialize() {
    const packageUri = this.getWorkspaceUri("package.sd");
    const packageContent = await this.readTextDocument({
      textDocument: { uri: packageUri },
    });

    if (packageContent) {
      const trimmedPackageContent = packageContent.trim();
      let validPackageContent = trimmedPackageContent.endsWith("---")
        ? trimmedPackageContent.slice(0, -3)
        : trimmedPackageContent;
      const packageObj = YAML.parse(validPackageContent);
      this._projectId = packageObj.id;
      this._projectName = packageObj.name;
    } else {
      this._projectName = "Untitled Project";
      await this.writeTextDocument({
        textDocument: { uri: packageUri },
        text: `
---
id: ${this._projectId}
name: ${this._projectName}
---
        `.trim(),
      });
    }
    await this._lsp.starting;
    const directoryUri = this.getWorkspaceUri();
    const entries = await this.getWorkspaceEntries({
      directory: { uri: directoryUri },
    });
    const didWatchFilesParams = {
      files: entries,
    };
    this._lsp.connection.sendNotification(
      DidWatchFilesMessage.type,
      didWatchFilesParams
    );
    this.emit(
      DidWatchFilesMessage.method,
      DidWatchFilesMessage.type.notification(didWatchFilesParams)
    );
    entries.forEach((entry) => {
      this._uris ??= new Set<string>();
      this._uris.add(entry.uri);
    });
    return entries;
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
    const dispatch = this._messageQueue[message.id];
    if (dispatch) {
      dispatch(message.result);
      delete this._messageQueue[message.id];
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
    return `${this._scheme}${this._uid}/projects/${this._projectId}${suffix}`;
  }

  getFileName(uri: string) {
    return uri.split("/").slice(-1).join("");
  }

  getDisplayName(uri: string) {
    const fileName = this.getFileName(uri);
    return fileName.split(".")[0] ?? "";
  }

  async getFilesInDirectory(directoryPath: string): Promise<string[]> {
    await this.initializing;
    return (
      this.uris?.filter((uri) =>
        uri.startsWith(this.getWorkspaceUri(directoryPath))
      ) || []
    );
  }

  protected async getWorkspaceEntries(
    params: WorkspaceDirectoryParams
  ): Promise<WorkspaceEntry[]> {
    return this.sendRequest(WorkspaceDirectoryMessage.type, params);
  }

  async createFiles(params: CreateFilesParams) {
    const result = await this.sendRequest(
      CreateFilesMessage.type,
      params,
      params.files.map((file) => file.data)
    );
    params.files.forEach((file) => {
      this._uris ??= new Set<string>();
      this._uris.add(file.uri);
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
    this._lsp.connection.sendNotification(
      createMessage.method,
      createMessage.params
    );
    this._lsp.connection.sendNotification(
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
      this._uris ??= new Set<string>();
      this._uris.delete(file.uri);
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
    this._lsp.connection.sendNotification(
      deleteMessage.method,
      deleteMessage.params
    );
    this._lsp.connection.sendNotification(
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
    this.emit(changeMessage.method, changeMessage);
    return result;
  }

  async readFile(params: ReadFileParams) {
    return this.sendRequest(ReadFileMessage.type, params);
  }

  async readTextDocument(params: ReadTextDocumentParams) {
    return this.sendRequest(ReadTextDocumentMessage.type, params);
  }
}
