import { MessageProtocolRequestType } from "@impower/spark-editor-protocol/src/protocols/MessageProtocolRequestType";
import {
  ReadTextDocument,
  ReadTextDocumentParams,
} from "@impower/spark-editor-protocol/src/protocols/textDocument/ReadTextDocument.js";
import {
  WriteTextDocument,
  WriteTextDocumentParams,
} from "@impower/spark-editor-protocol/src/protocols/textDocument/WriteTextDocument.js";
import {
  CreateFiles,
  CreateFilesParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/CreateFiles.js";
import {
  DeleteFiles,
  DeleteFilesParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/DeleteFiles";
import { DidChangeWatchedFiles } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeWatchedFiles.js";
import { DidCreateFiles } from "@impower/spark-editor-protocol/src/protocols/workspace/DidCreateFiles.js";
import { DidDeleteFiles } from "@impower/spark-editor-protocol/src/protocols/workspace/DidDeleteFiles.js";
import { DidWatchFiles } from "@impower/spark-editor-protocol/src/protocols/workspace/DidWatchFiles.js";
import {
  ReadFile,
  ReadFileParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/ReadFile.js";
import {
  WorkspaceDirectory,
  WorkspaceDirectoryParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/WorkspaceDirectory.js";
import { WorkspaceEntry } from "@impower/spark-editor-protocol/src/types";
import { FileChangeType } from "vscode-languageserver-protocol";
import WorkspaceLanguageServerProtocol from "./WorkspaceLanguageServerProtocol";
import WorkspaceWindow from "./WorkspaceWindow";

export default class WorkspaceFileSystem {
  protected _window: WorkspaceWindow;

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

  protected _projectName = "Untitled Project";
  get projectName() {
    return this._projectName;
  }

  constructor(window: WorkspaceWindow, lsp: WorkspaceLanguageServerProtocol) {
    this.initialize();
    this._window = window;
    this._lsp = lsp;
  }

  async initialize() {
    const packageUri = this.getWorkspaceUri("package.sd");
    const packageContent = await this.readTextDocument({
      textDocument: { uri: packageUri },
    });
    if (!packageContent) {
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
    this._lsp.connection.sendNotification(DidWatchFiles.type, {
      files: entries,
    });
  }

  getWorkspaceUri(...path: string[]) {
    const suffix = path.length > 0 ? `/${path.join("/")}` : "";
    return `${this._scheme}${this._uid}/projects/${this._projectId}${suffix}`;
  }

  protected async sendRequest<M extends string, P, R>(
    type: MessageProtocolRequestType<M, P, R>,
    params: P,
    transfer: Transferable[] = []
  ): Promise<R> {
    return new Promise((resolve) => {
      const request = type.request(params);
      this._fileSystemWorker.addEventListener(
        "message",
        (event) => {
          const message = event.data;
          if (type.isResponse(message)) {
            if (message.id === request.id) {
              resolve(message.result);
            }
          }
        },
        { once: true }
      );
      this._fileSystemWorker.postMessage(request, transfer);
    });
  }

  async getWorkspaceEntries(
    params: WorkspaceDirectoryParams
  ): Promise<WorkspaceEntry[]> {
    return this.sendRequest(WorkspaceDirectory.type, params);
  }

  async createFiles(params: CreateFilesParams) {
    const result = await this.sendRequest(
      CreateFiles.type,
      params,
      params.files.map((file) => file.data)
    );
    const createMessage = DidCreateFiles.type.notification({
      files: params.files.map((file) => ({ uri: file.uri })),
    });
    const changeMessage = DidChangeWatchedFiles.type.notification({
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
    this._window.sendNotification(createMessage);
    this._window.sendNotification(changeMessage);
    return result;
  }

  async deleteFiles(params: DeleteFilesParams) {
    const result = await this.sendRequest(DeleteFiles.type, params);
    const deleteMessage = DidDeleteFiles.type.notification({
      files: params.files.map((file) => ({ uri: file.uri })),
    });
    const changeMessage = DidChangeWatchedFiles.type.notification({
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
    this._window.sendNotification(deleteMessage);
    this._window.sendNotification(changeMessage);
    return result;
  }

  async readFile(params: ReadFileParams) {
    return this.sendRequest(ReadFile.type, params);
  }

  async writeTextDocument(params: WriteTextDocumentParams) {
    return this.sendRequest(WriteTextDocument.type, params);
  }

  async readTextDocument(params: ReadTextDocumentParams) {
    return this.sendRequest(ReadTextDocument.type, params);
  }
}
