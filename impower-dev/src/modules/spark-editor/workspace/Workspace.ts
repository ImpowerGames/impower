import {
  ReadTextDocument,
  ReadTextDocumentParams,
} from "../../../../../packages/spark-editor-protocol/src/protocols/textDocument/messages/ReadTextDocument";
import {
  WriteTextDocument,
  WriteTextDocumentParams,
} from "../../../../../packages/spark-editor-protocol/src/protocols/textDocument/messages/WriteTextDocument";
import {
  CreateFiles,
  CreateFilesParams,
} from "../../../../../packages/spark-editor-protocol/src/protocols/workspace/messages/CreateFiles";
import {
  DeleteFiles,
  DeleteFilesParams,
} from "../../../../../packages/spark-editor-protocol/src/protocols/workspace/messages/DeleteFiles";
import { DidChangeWatchedFiles } from "../../../../../packages/spark-editor-protocol/src/protocols/workspace/messages/DidChangeWatchedFiles";
import { DidCreateFiles } from "../../../../../packages/spark-editor-protocol/src/protocols/workspace/messages/DidCreateFiles";
import { DidDeleteFiles } from "../../../../../packages/spark-editor-protocol/src/protocols/workspace/messages/DidDeleteFiles";
import { DidWatchFiles } from "../../../../../packages/spark-editor-protocol/src/protocols/workspace/messages/DidWatchFiles";
import {
  ReadFile,
  ReadFileParams,
} from "../../../../../packages/spark-editor-protocol/src/protocols/workspace/messages/ReadFile";
import {
  WorkspaceDirectory,
  WorkspaceDirectoryParams,
} from "../../../../../packages/spark-editor-protocol/src/protocols/workspace/messages/WorkspaceDirectory";
import {
  FileChangeType,
  NotificationMessage,
  RequestMessage,
} from "../../../../../packages/spark-editor-protocol/src/types";
import { isResponse } from "../../../../../packages/spark-editor-protocol/src/utils/isResponse";
import SparkdownLanguageServerConnection from "./SparkdownLanguageServerConnection";
import { WorkspaceState } from "./WorkspaceState";
import DEFAULT_WORKSPACE_STATE from "./workspace.json";

export default class Workspace {
  private static _instance: Workspace;
  static get instance(): Workspace {
    if (!this._instance) {
      this._instance = new Workspace();
    }
    return this._instance;
  }

  protected _fileSystemWorker = new Worker("/public/opfs-workspace.js");

  protected _scheme = "file:///";
  get scheme() {
    return this._scheme;
  }

  protected _languageServerWorker = new Worker(
    "/public/sparkdown-language-server.js"
  );

  languageServerConnection = new SparkdownLanguageServerConnection(
    "sparkdown-language-server",
    "Sparkdown Language Server",
    {
      documentSelector: [{ language: "sparkdown" }],
    },
    this._languageServerWorker
  );

  // TODO: Allow user to sync their data with a storage provider (like Github, Google Drive, or Dropbox)
  protected _uid = "anonymous";

  // TODO: Allow user to own more than one project
  protected _projectId = "default";

  protected _projectName = "Untitled Project";

  protected _state: WorkspaceState;
  get state() {
    return this._state;
  }

  constructor() {
    this._state = DEFAULT_WORKSPACE_STATE;
    this.initialize();
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
    await this.languageServerConnection.starting;
    const directoryUri = this.getWorkspaceUri();
    const entries = await this.getWorkspaceEntries({
      directory: { uri: directoryUri },
    });
    this.languageServerConnection.sendNotification(DidWatchFiles.method, {
      files: entries,
    });
  }

  getWorkspaceUri(...path: string[]) {
    const suffix = path.length > 0 ? `/${path.join("/")}` : "";
    return `${this._scheme}${this._uid}/projects/${this._projectId}${suffix}`;
  }

  protected async sendRequestToFileSystem<M extends string, P, R>(
    request: RequestMessage<M, P>,
    transfer: Transferable[] = []
  ): Promise<R> {
    return new Promise((resolve) => {
      this._fileSystemWorker.addEventListener(
        "message",
        (event) => {
          const message = event.data;
          if (isResponse<M, R>(message, request.method)) {
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

  protected async sendNotificationToLanguageServer<M extends string, P>(
    notification: NotificationMessage<M, P>
  ): Promise<void> {
    this.languageServerConnection.sendNotification<P>(
      notification.method,
      notification.params
    );
  }

  protected async sendNotificationToWindow<M extends string, P>(
    notification: NotificationMessage<M, P>
  ): Promise<void> {
    window.postMessage(notification);
  }

  async getWorkspaceEntries(params: WorkspaceDirectoryParams) {
    return this.sendRequestToFileSystem(
      WorkspaceDirectory.type.request(params)
    );
  }

  async createFiles(params: CreateFilesParams) {
    const result = await this.sendRequestToFileSystem(
      CreateFiles.type.request(params),
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
    this.sendNotificationToLanguageServer(createMessage);
    this.sendNotificationToLanguageServer(changeMessage);
    this.sendNotificationToWindow(createMessage);
    this.sendNotificationToWindow(changeMessage);
    return result;
  }

  async deleteFiles(params: DeleteFilesParams) {
    const result = await this.sendRequestToFileSystem(
      DeleteFiles.type.request(params)
    );
    const deleteMessage = DidDeleteFiles.type.notification({
      files: params.files.map((file) => ({ uri: file.uri })),
    });
    const changeMessage = DidChangeWatchedFiles.type.notification({
      changes: params.files.map((file) => ({
        uri: file.uri,
        type: FileChangeType.Deleted,
      })),
    });
    this.sendNotificationToLanguageServer(deleteMessage);
    this.sendNotificationToLanguageServer(changeMessage);
    this.sendNotificationToWindow(deleteMessage);
    this.sendNotificationToWindow(changeMessage);
    return result;
  }

  async readFile(params: ReadFileParams) {
    return this.sendRequestToFileSystem(ReadFile.type.request(params));
  }

  async writeTextDocument(params: WriteTextDocumentParams) {
    return this.sendRequestToFileSystem(WriteTextDocument.type.request(params));
  }

  async readTextDocument(params: ReadTextDocumentParams) {
    return this.sendRequestToFileSystem(ReadTextDocument.type.request(params));
  }
}
