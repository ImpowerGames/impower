import {
  DeleteTextDocument,
  DeleteTextDocumentParams,
} from "../../../../../packages/spark-editor-protocol/src/protocols/textDocument/messages/DeleteTextDocument";
import {
  ReadTextDocument,
  ReadTextDocumentParams,
} from "../../../../../packages/spark-editor-protocol/src/protocols/textDocument/messages/ReadTextDocument";
import {
  WriteTextDocument,
  WriteTextDocumentParams,
} from "../../../../../packages/spark-editor-protocol/src/protocols/textDocument/messages/WriteTextDocument";
import { DidCreateFiles } from "../../../../../packages/spark-editor-protocol/src/protocols/workspace/messages/DidCreateFiles";
import { DidDeleteFiles } from "../../../../../packages/spark-editor-protocol/src/protocols/workspace/messages/DidDeleteFiles";
import {
  WorkspaceDirectory,
  WorkspaceDirectoryParams,
} from "../../../../../packages/spark-editor-protocol/src/protocols/workspace/messages/WorkspaceDirectory";
import { WorkspaceEntry } from "../../../../../packages/spark-editor-protocol/src/types";
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

  worker = new Worker("/public/opfs-workspace.js");

  // TODO: Allow user to sync their data with a storage provider (like Github, Google Drive, or Dropbox)
  protected _uid = "anonymous";

  // TODO: Allow user to own more than one project
  protected _project = "default";

  protected _state: WorkspaceState;
  get state() {
    return this._state;
  }

  constructor() {
    this._state = DEFAULT_WORKSPACE_STATE;
  }

  getWorkspaceUri(...path: string[]) {
    const suffix = path.length > 0 ? `/${path.join("/")}` : "";
    return `file:///${this._uid}/projects/${this._project}${suffix}`;
  }

  async getWorkspaceDirectory(
    params: WorkspaceDirectoryParams
  ): Promise<WorkspaceEntry[]> {
    return new Promise((resolve) => {
      const request = WorkspaceDirectory.type.request(params);
      this.worker.addEventListener("message", (event) => {
        const message = event.data;
        if (WorkspaceDirectory.type.isResponse(message)) {
          if (message.id === request.id) {
            resolve(message.result);
          }
        }
      });
      this.worker.postMessage(request);
    });
  }

  async readTextDocument(params: ReadTextDocumentParams): Promise<string> {
    return new Promise((resolve) => {
      const request = ReadTextDocument.type.request(params);
      this.worker.addEventListener("message", (event) => {
        const message = event.data;
        if (ReadTextDocument.type.isResponse(message)) {
          if (message.id === request.id) {
            resolve(message.result);
          }
        }
      });
      this.worker.postMessage(request);
    });
  }

  async writeTextDocument(params: WriteTextDocumentParams): Promise<null> {
    return new Promise((resolve) => {
      const request = WriteTextDocument.type.request(params);
      this.worker.addEventListener("message", (event) => {
        const message = event.data;
        if (WriteTextDocument.type.isResponse(message)) {
          if (message.id === request.id) {
            resolve(message.result);
            window.postMessage(
              DidCreateFiles.type.notification({
                files: [{ uri: request.params.textDocument.uri }],
              })
            );
          }
        }
      });
      this.worker.postMessage(request);
    });
  }

  async deleteTextDocument(params: DeleteTextDocumentParams): Promise<null> {
    return new Promise((resolve) => {
      const request = DeleteTextDocument.type.request(params);
      this.worker.addEventListener("message", (event) => {
        const message = event.data;
        if (DeleteTextDocument.type.isResponse(message)) {
          if (message.id === request.id) {
            resolve(message.result);
            window.postMessage(
              DidDeleteFiles.type.notification({
                files: [{ uri: request.params.textDocument.uri }],
              })
            );
          }
        }
      });
      this.worker.postMessage(request);
    });
  }
}
